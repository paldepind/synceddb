const _ = require('underscore');
const {isString, isFunction, isObject, partial, isArray} = require('underscore');
const {closeSyncContext, doPullFromRemote, getSyncContext, getWs, doPushToRemote} = require('./utils');
const SDBObjectStore = require('./sdbobjectstore');
const Events = require('minivents');
const Countdown = require('./countdown');

class SDBDatabase {
  constructor(opts) {
    Events(this);
    this.name = opts.name;
    this.remote = opts.remote;
    this.version = opts.version;
    this.recordsToSync = new Countdown();
    this.changesLeftFromRemote = new Countdown();
    this.messages = new Events();
    this.recordsSentToRemote = {}; // Dictionary of records sent
    this.stores = {};
    const stores = {};
    _.each(opts.stores, (indexes, storeName) => {
      stores[storeName] = indexes.concat([['changedSinceSync', 'changedSinceSync']]);
    });
    // Create stores on db object
    _.each(stores, (indexes, storeName) => {
      const indexNames = indexes.map((idx) => { return idx[0]; });
      const storeObj = new SDBObjectStore(this, storeName, indexNames);
      this.stores[storeName] = storeObj;
      // Make stores available directly as properties on the db
      // Store shortcut should not override db properties
      this[storeName] = this[storeName] || storeObj;
    });
    this.sdbMetaData = new SDBObjectStore(this, 'sdbMetaData', []);
    this.promise = new Promise((resolve, reject) => {
      const req = indexedDB.open(this.name, this.version);
      req.onupgradeneeded = partial(handleMigrations, this.version, stores, opts.migrations);
      req.onsuccess = (e) => {
        this.db = req.result;
        this.db.onversionchange = handleVersionChange;
        resolve({db: this, e: e});
      };
    });
  }

  then(fn) {
    return this.promise.then(fn);
  }

  catch(fn) {
    return this.promise.catch(fn);
  }

  transaction(storeNames, mode, fn) {
    storeNames = [].concat(storeNames);
    mode = mode === 'r'    ? 'readonly'
         : mode === 'read' ? 'readonly'
         : mode === 'rw'   ? 'readwrite'
                           : mode;
    return this.then((res) => {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(storeNames, mode);
        const stores = storeNames.map((s) => {
          const store = s === 'sdbMetaData' ? this[s] : this.stores[s];
          return new SDBObjectStore(this, s, store.indexes, tx);
        });
        tx.oncomplete = resolve;
        fn.apply(null, stores);
      });
    });
  }

  read(...args) {
    const fn = args.pop();
    return this.transaction(args, 'r', fn);
  }

  write(...args) {
    const fn = args.pop();
    return this.transaction(args, 'rw', fn);
  }

  connect() {
    return this.then(() => {
      return getWs(this).then(() => {});
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.wsPromise = null;
    }
  }

  send(msg) {
    return getWs(this).then((ws) => {
      ws.send(msg);
    });
  }

  pushToRemote(...storeNames) {
    return getSyncContext(this, storeNames)
    .then(doPushToRemote)
    .then(closeSyncContext);
  }

  pullFromRemote(...storeNames) {
    return getSyncContext(this, storeNames)
    .then(doPullFromRemote)
    .then(closeSyncContext);
  }

  sync(storeNames, opts) {
    if (arguments.length === 1 && !isArray(storeNames)) {
      opts = storeNames;
    }
    storeNames = isString(storeNames) ? [storeNames]
               : !isArray(storeNames) ? []
                                      : storeNames;
    const continuously = isObject(opts) && opts.continuously === true;
    return doSync(this, continuously, storeNames);
  }
}

module.exports = SDBDatabase;

function handleMigrations(version, storeDeclaration, migrationHooks, e) {
  const req = e.target;
  const db = req.result;
  const existingStores = db.objectStoreNames;
  let metaStore;
  if (existingStores.contains('sdbMetaData')) {
    metaStore = req.transaction.objectStore('sdbMetaData');
  } else {
    metaStore = db.createObjectStore('sdbMetaData', {keyPath: 'key'});
    metaStore.put({key: 'meta'});
  }
  _.each(storeDeclaration, (indexes, storeName) => {
    let store;
    if (existingStores.contains(storeName)) {
      store = req.transaction.objectStore(storeName);
    } else {
      store = db.createObjectStore(storeName, {keyPath: 'key'});
      metaStore.put({key: storeName + 'Meta', syncedTo: null});
    }
    indexes.forEach((index) => {
      if (!store.indexNames.contains(index[0]))
        store.createIndex.apply(store, index);
    });
  });
  if (migrationHooks)
    callMigrationHooks({db: db, e: e}, migrationHooks, version, e.oldVersion);
}

function handleVersionChange(e) {
  // The database is being deleted or opened with
  // a newer version, possibly in another tab
  e.target.close();
}

function callMigrationHooks(data, migrations, newV, curV) {
  while(curV++ < newV)
    if (isFunction(migrations[curV]))
      migrations[curV](data.db, data.e);
}

function doSync(db, continuously, storeNames) {
  return getSyncContext(db, storeNames)
  .then(doPullFromRemote)
  .then(doPushToRemote)
  .then((ctx) => {
    continuously ? db.continuousSync = true
                 : closeSyncContext(ctx);
  });
}

