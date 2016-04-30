// SyncedDB
'use strict';

require('es6-promise').polyfill();
const dffptch = require('dffptch');
const SyncPromise = require('sync-promise');
const Events = require('minivents');

// General utility functions

function toArray(arr) {
  return [].slice.call(arr);
}

function eachKeyVal(obj, fn) {
  Object.keys(obj).forEach((key) => { fn(key, obj[key]); });
}

function partial() {
  return Function.bind.apply(arguments[0], arguments);
}

function isObject(o) {
  return o !== null && typeof o === 'object';
}

const isArray = Array.isArray;

function isString(s) {
  return typeof s === 'string';
}

function isNum(n) {
  return typeof n === 'number';
}

function isFunc(f) {
  return typeof f === 'function';
}

function isUndef(x) {
  return x === undefined;
}

function isKey(k) {
  return isString(k) || isNum(k);
}

function copyRecord(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// Countdown abstraction

class Countdown {
  constructor(initial) {
    this.val = initial || 0;
  }
  add(n) {
    this.val += n;
    if (this.val === 0) this.onZero();
  }
}

// WebSocket wrapper

class WrappedSocket {
  constructor(url, protocol) {
    const wws = this;
    Events(wws);
    const ws = this.ws = new WebSocket(url, protocol);
    ws.onopen = () => {
      console.log('Connection open');
      wws.emit('open');
    };
    ws.onerror = (error) => {
      console.log('Connection errror');
      console.log(error);
      wws.emit('error', error);
    };
    ws.onclose = (e) => {
      console.log('Connection closed');
      console.log(e);
      wws.emit('close', e);
    };
    ws.onmessage = (msg) => {
      console.log('Message recieved');
      let data;
      if (isString(msg.data)) {
        data = JSON.parse(msg.data);
      } else {
        data = msg.data;
      }
      console.log(data);
      wws.emit('message', data);
    };
  }
  send(msg) {
    if (isObject(msg)) {
      this.ws.send(JSON.stringify(msg));
    } else {
      this.ws.send(msg);
    }
  }
  close() {
    this.ws.close.apply(this.ws, arguments);
  }
}

// SyncedDB

function copyWithoutMeta(rec) {
  const r = copyRecord(rec);
  delete r.remoteOriginal;
  delete r.version;
  delete r.changedSinceSync;
  return r;
}

function extractKey(pk) {
  const k = isObject(pk) ? pk.key : pk;
  if (!isKey(k)) throw new TypeError(k + ' is not a valid key');
  return k;
}

function handleVersionChange(e) {
  // The database is being deleted or opened with
  // a newer version, possibly in another tab
  e.target.close();
}

function doIndexGet(idxName, ranges, IDBStore, resolve, reject) {
  const records = [];
  const index = IDBStore.index(idxName);
  const rangesLeft = new Countdown(ranges.length);
  rangesLeft.onZero = partial(resolve, records);
  ranges.forEach((range) => {
    const req = index.openCursor(range);
    req.onsuccess = () => {
      const cursor = req.result;
      cursor ? (records.push(cursor.value), cursor.continue())
             : rangesLeft.add(-1);
    };
  });
}

class SDBIndex {
  constructor(name, db, store) {
    this.name = name;
    this.db = db;
    this.store = store;
  }

  get(/* ranges */) {
    const index = this;
    const ranges = toArray(arguments).map(IDBKeyRange.only);
    return doInStoreTx('readonly', index.store, (store, resolve, reject) => {
      return doIndexGet(index.name, ranges, store.IDBStore, resolve, reject);
    });
  }

  getAll() {
    const index = this;
    return doInStoreTx('readonly', index.store, (store, resolve, reject) => {
      return doIndexGet(index.name, [undefined], store.IDBStore, resolve, reject);
    });
  }

  inRange(/* ranges */) {
    const index = this;
    const ranges = toArray(arguments).map(createKeyRange);
    return doInStoreTx('readonly', index.store, (store, resolve, reject) => {
      return doIndexGet(index.name, ranges, store.IDBStore, resolve, reject);
    });
  }
}

function emitChangeEvents(changes, dbStore) {
  changes.forEach((change) => {
    dbStore.emit(change.type, {
      record: change.record,
      origin: change.origin
    });
    if (dbStore.db.continuousSync && change.origin !== 'REMOTE') {
      sendChangeToRemote(dbStore.db, dbStore.name, change.record);
    }
  });
}

function doGet(IDBStore, key, getDeleted) {
  return new SyncPromise((resolve, reject) => {
    const req = IDBStore.get(key);
    req.onsuccess = () => {
      if (!isUndef(req.result) &&
          (!req.result.deleted || getDeleted)) {
        resolve(req.result);
      } else {
        reject({type: 'KeyNotFoundError', key: key});
      }
    };
  });
}

function doInStoreTx(mode, store, cb) {
  if (store.tx) { // We're in transaction
    return new SyncPromise((resolve, reject) => {
      cb(store, resolve, reject);
    });
  } else {
    return new Promise((resolve, reject) => {
      let val, rejected;
      return store.db.transaction(store.name, mode, (store) => {
        cb(store, (v) => {
          val = v;
          rejected = false;
        }, (v) => {
          val = v;
          rejected = true;
        });
      }).then(() => {
        rejected ? reject(val) : resolve(val);
      });
    });
  }
}

function updateMetaData(store, record) {
  return doGet(store.IDBStore, record.key).then((oldRecord) => {
    record.version = oldRecord.version;
    if (oldRecord.changedSinceSync === 0) {
      record.remoteOriginal = copyWithoutMeta(oldRecord);
    }
  });
}

function doPutRecord(store, op) {
  const record = op.rec;
  if (op.newRec) { // Add new record
    return addRecToStore(store, record, 'LOCAL');
  } else { // Update existing record
    return updateMetaData(store, record).then(() => {
      return putRecToStore(store, record, 'LOCAL');
    });
  }
}

class SDBObjectStore {
  constructor(db, name, indexes, tx) {
    const store = this;
    store.name = name;
    store.db = db;
    store.indexes = indexes;
    store.changedRecords = [];
    store.messages = new Events();
    store.tx = tx;
    Events(store);
    indexes.forEach((i) => {
      store[i] = new SDBIndex(i, db, store);
    });
    if (!isUndef(tx)) {
      store.IDBStore = tx.objectStore(store.name);
      tx.addEventListener('complete', () => {
        emitChangeEvents(store.changedRecords, store.db.stores[store.name]);
        store.changedRecords.length = 0;
      });
    }
  }

  get(/* keys */) {
    const keys = toArray(arguments);
    return doInStoreTx('readonly', this, (store, resolve, reject) => {
      console.log('store');
      console.log(store);
      console.log(store.IDBStore);
      const gets = keys.map(partial(doGet, store.IDBStore));
      SyncPromise.all(gets).then((records) => {
        if (keys.length === records.length)
          resolve(keys.length == 1 ? records[0] : records);
      }).catch(reject);
    });
  }

  delete(/* keys */) {
    const args = toArray(arguments);
    return doInStoreTx('readwrite', this, (store, resolve, reject) => {
      const deletes = args.map((key) => {
        return deleteFromStore(store, extractKey(key), 'LOCAL');
      });
      SyncPromise.all(deletes).then(resolve).catch(reject);
    });
  }

  put(/* recs */) {
    const recs = toArray(arguments);
    const ops = recs.map((rec) => {
      let newRec;
      if (isUndef(rec.key)) {
        newRec = true;
        rec.key = Math.random().toString(36);
      } else {
        extractKey(rec); // Throws if key is invalid
        newRec = false;
      }
      rec.changedSinceSync = 1;
      return {newRec: newRec, rec: rec};
    });
    return doInStoreTx('readwrite', this, (store, resolve, reject) => {
      const puts = ops.map(partial(doPutRecord, store));
      SyncPromise.all(puts).then(resolve);
    });
  }
}

function insertRecToStore(method, store, rec, origin) {
  if (origin === 'LOCAL') {
    const sent = store.db.recordsSentToRemote[rec.key];
    if (sent !== undefined) sent.changedSince = true;
  }
  const IDBStore = store.IDBStore;
  return new SyncPromise((resolve, reject) => {
    const req = IDBStore[method](rec);
    req.onsuccess = () => {
      const type = method === 'add' ? 'add' : 'update';
      if (origin !== 'INTERNAL') {
        store.changedRecords.push({type: type, origin: origin, record: rec});
      }
      resolve(req.result);
    };
  });
}

const putRecToStore = partial(insertRecToStore, 'put');
const addRecToStore = partial(insertRecToStore, 'add');

function createTombstone(r) {
  return {
    version: r.version,
    key: r.key,
    changedSinceSync: 1,
    deleted: true,
    remoteOriginal: r.remoteOriginal || copyWithoutMeta(r),
  };
}

function deleteFromStore(store, key, origin) {
  if (origin === 'LOCAL') {
    const sent = store.db.recordsSentToRemote[key];
    if (sent !== undefined) sent.changedSince = true;
  }
  const IDBStore = store.IDBStore;
  return new SyncPromise((resolve, reject) => {
    doGet(IDBStore, key, true).then((record) => {
      const tombstone = createTombstone(record);
      store.changedRecords.push({type: 'delete', origin: origin, record: tombstone});
      if ((record.changedSinceSync === 1 && !record.remoteOriginal) ||
          origin === 'REMOTE') {
        const req = IDBStore.delete(key);
        req.onsuccess = resolve;
      } else {
        putRecToStore(store, tombstone, 'INTERNAL').then(resolve);
      }
    });
  });
}

function createKeyRange(r) {
  const gt   = 'gt' in r;
  const gte  = 'gte' in r;
  const lt   = 'lt' in r;
  const lte  = 'lte' in r;
  const low  = gt ? r.gt : r.gte;
  const high = lt ? r.lt : r.lte;
  return !gt && !gte ? IDBKeyRange.upperBound(high, lt)
       : !lt && !lte ? IDBKeyRange.lowerBound(low, gt)
                     : IDBKeyRange.bound(low, high, gt, lt);
}

function callMigrationHooks(data, migrations, newV, curV) {
  while(curV++ < newV)
    if (isFunc(migrations[curV]))
      migrations[curV](data.db, data.e);
}

const handleMigrations = (version, storeDeclaration, migrationHooks, e) => {
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
  eachKeyVal(storeDeclaration, (storeName, indexes) => {
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
};

function doSync(db, continuously, storeNames) {
  return getSyncContext(db, storeNames)
  .then(doPullFromRemote)
  .then(doPushToRemote)
  .then((ctx) => {
    continuously ? db.continuousSync = true
                 : closeSyncContext(ctx);
  });
}

class SDBDatabase {
  constructor(opts) {
    const db = this;
    Events(db);
    db.name = opts.name;
    db.remote = opts.remote;
    db.version = opts.version;
    db.recordsToSync = new Countdown();
    db.changesLeftFromRemote = new Countdown();
    db.messages = new Events();
    db.recordsSentToRemote = {}; // Dictionary of records sent
    db.stores = {};
    const stores = {};
    eachKeyVal(opts.stores, (storeName, indexes) => {
      stores[storeName] = indexes.concat([['changedSinceSync', 'changedSinceSync']]);
    });
    // Create stores on db object
    eachKeyVal(stores, (storeName, indexes) => {
      const indexNames = indexes.map((idx) => { return idx[0]; });
      const storeObj = new SDBObjectStore(db, storeName, indexNames);
      db.stores[storeName] = storeObj;
      // Make stores available directly as properties on the db
      // Store shortcut should not override db properties
      db[storeName] = db[storeName] || storeObj;
    });
    db.sdbMetaData = new SDBObjectStore(db, 'sdbMetaData', []);
    this.promise = new Promise((resolve, reject) => {
      const req = indexedDB.open(db.name, db.version);
      req.onupgradeneeded = partial(handleMigrations, db.version, stores, opts.migrations);
      req.onsuccess = (e) => {
        db.db = req.result;
        db.db.onversionchange = handleVersionChange;
        resolve({db: db, e: e});
      };
    });
    return db;
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
    const db = this;
    return db.then((res) => {
      return new Promise((resolve, reject) => {
        const tx = db.db.transaction(storeNames, mode);
        const stores = storeNames.map((s) => {
          const store = s === 'sdbMetaData' ? db[s] : db.stores[s];
          return new SDBObjectStore(db, s, store.indexes, tx);
        });
        tx.oncomplete = resolve;
        fn.apply(null, stores);
      });
    });
  }

  read() {
    const args = toArray(arguments);
    const fn = args.pop();
    return this.transaction(args, 'r', fn);
  }

  write() {
    const args = toArray(arguments);
    const fn = args.pop();
    return this.transaction(args, 'rw', fn);
  }

  connect() {
    const db = this;
    return db.then(() => {
      return getWs(db).then(() => {});
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

  pushToRemote(/* storeNames */) {
    return getSyncContext(this, arguments)
    .then(doPushToRemote)
    .then(closeSyncContext);
  }

  pullFromRemote(/* storeNames */) {
    return getSyncContext(this, arguments)
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

// Syncing

const createMsg = (storeName, record) => {
  const r = copyWithoutMeta(record);
  delete r.key;
  return {
    type: 'create',
    storeName: storeName,
    record: r,
    key: record.key,
  };
};

const updateMsg = (storeName, record) => {
  const remoteOriginal = record.remoteOriginal;
  delete record.remoteOriginal; // Noise free diff
  remoteOriginal.version = record.version;
  remoteOriginal.changedSinceSync = 1;
  const diff = dffptch.diff(remoteOriginal, record);
  record.remoteOriginal = remoteOriginal;
  return {
    type: 'update',
    storeName: storeName,
    version: record.version,
    diff: diff,
    key: record.key,
  };
};

const deleteMsg = (storeName, record) => {
  return {
    type: 'delete',
    storeName: storeName,
    key: record.key,
    version: record.version,
  };
};

function sendChangeToRemote(db, storeName, record) {
  const msgFunc = record.deleted        ? deleteMsg
              : record.remoteOriginal ? updateMsg
                                      : createMsg;
  db.recordsSentToRemote[record.key] = {
    changedSince: false,
    record: copyRecord(record),
  };
  db.ws.send(msgFunc(storeName, record));
}

function updateStoreSyncedTo(metaStore, storeName, time) {
  metaStore.get(storeName + 'Meta').then((storeMeta) => {
    storeMeta.syncedTo = time;
    putRecToStore(metaStore, storeMeta, 'INTERNAL');
  });
}

function requestChangesToStore(db, ws, storeName) {
  db.sdbMetaData.get(storeName + 'Meta').then((storeMeta) => {
    ws.send({
      type: 'get-changes',
      storeName: storeName,
      since: storeMeta.syncedTo,
    });
  });
}

function handleRemoteChange(db, storeName, cb) {
  return db.write(storeName, 'sdbMetaData', cb).then(() => {
    db.changesLeftFromRemote.add(-1);
  });
}

const handleIncomingMessageByType = {
  'sending-changes': (db, ws, msg) => {
    db.emit('sync-initiated', msg);
    db.changesLeftFromRemote.add(msg.nrOfRecordsToSync);
  },
  'create': (db, ws, msg) => {
    msg.record.changedSinceSync = 0;
    msg.record.key = msg.key;
    msg.record.version = msg.version;
    handleRemoteChange(db, msg.storeName, (store, metaStore) => {
      addRecToStore(store, msg.record, 'REMOTE').then(() => {
        updateStoreSyncedTo(metaStore, msg.storeName, msg.timestamp);
      });
    });
  },
  'update': (db, ws, msg) => {
    handleRemoteChange(db, msg.storeName, (store, metaStore) => {
      doGet(store.IDBStore, msg.key, true).then((local) => {
        if (local.changedSinceSync === 1) { // Conflict
          const original = local.remoteOriginal;
          const remote = copyRecord(original);
          remote.version = local.version;
          remote.changedSinceSync = 1;
          dffptch.patch(remote, msg.diff);
          local.remoteOriginal = remote;
          const resolved = db.stores[msg.storeName].handleConflict(original, local, remote);
          return putRecToStore(store, resolved, 'LOCAL');
        } else {
          dffptch.patch(local, msg.diff);
          local.version = msg.version;
          return putRecToStore(store, local, 'REMOTE');
        }
      }).then(() => {
        updateStoreSyncedTo(metaStore, msg.storeName, msg.timestamp);
      });
    });
  },
  'delete': (db, ws, msg) => {
    handleRemoteChange(db, msg.storeName, (store, metaStore) => {
      doGet(store.IDBStore, msg.key, true).then((local) => {
        if (local.changedSinceSync === 1 && !local.deleted) {
          const original = local.remoteOriginal;
          const remote = {deleted: true, key: msg.key};
          local.remoteOriginal = remote;
          const resolved = db.stores[msg.storeName].handleConflict(original, local, remote);
          resolved.deleted ? deleteFromStore(store, msg.key, 'REMOTE')
                           : putRecToStore(store, resolved, 'LOCAL');
        } else {
          deleteFromStore(store, msg.key, 'REMOTE');
        }
      }).then(() => {
        updateStoreSyncedTo(metaStore, msg.storeName, msg.timestamp);
      });
    });
  },
  'ok': (db, ws, msg) => {
    let record;
    const sent = db.recordsSentToRemote[msg.key];
    db.write(msg.storeName, 'sdbMetaData', (store, metaStore) => {
      doGet(store.IDBStore, msg.key, true).then((rec) => {
        record = rec;
        if (sent.changedSince === true) {
          record.remoteOriginal = sent.record;
          putRecToStore(store, record, 'INTERNAL');
        } else if (record.deleted) {
          store.IDBStore.delete(msg.key);
        } else {
          record.changedSinceSync = 0;
          record.version = msg.newVersion;
          delete record.remoteOriginal;
          if (!isUndef(msg.newKey)) {
            record.key = msg.newKey;
            store.IDBStore.delete(msg.key);
          }
          putRecToStore(store, record, 'INTERNAL');
        }
        delete db.recordsSentToRemote[msg.key];
      }).then(() => {
        updateStoreSyncedTo(metaStore, msg.storeName, msg.timestamp);
      });
    }).then(() => {
      db.stores[msg.storeName].emit('synced', msg.key, record);
      db.recordsToSync.add(-1);
    });
  },
  'reject': (db, ws, msg) => {
    if (!isKey(msg.key)) {
      throw new Error('Reject message recieved from remote without key property');
    }
    const f = isString(msg.storeName) ? db.stores[msg.storeName].handleReject
                                    : db.handleReject;
    if (!isFunc(f)) {
      throw new Error('Reject message recieved from remote but no reject handler is supplied');
    }
    db.stores[msg.storeName].get(msg.key).then((record) => {
      return f(record, msg);
    }).then((record) => {
      record ? sendChangeToRemote(db, msg.storeName, record)
             : db.recordsToSync.add(-1); // Skip syncing record
    });
  },
};

function handleIncomingMessage(db, msg) {
  const handler = handleIncomingMessageByType[msg.type];
  const target = isString(msg.storeName) ? db.stores[msg.storeName].messages
                                       : db.messages;
  isFunc(handler) ? handler(db, db.ws, msg)
                  : target.emit(msg.type, msg);
}

function doPullFromRemote(ctx) {
  return new Promise((resolve, reject) => {
    ctx.db.changesLeftFromRemote.onZero = partial(resolve, ctx);
    ctx.storeNames.map(partial(requestChangesToStore, ctx.db, ctx.db.ws));
  });
}

function sendRecordsChangedSinceSync(ctx) {
  return ctx.db.transaction(ctx.storeNames, 'r', function() {
    const stores = toArray(arguments);
    const gets = stores.map((store) => {
      return store.changedSinceSync.get(1);
    });
    SyncPromise.all(gets).then((results) => {
      const total = results.reduce((sum, recs, i) => {
        recs.forEach(partial(sendChangeToRemote, ctx.db, stores[i].name));
        return sum + recs.length;
      }, 0);
      ctx.db.recordsToSync.add(total);
    });
  });
}

function doPushToRemote(ctx) {
  return new Promise((resolve, reject) => {
    ctx.db.recordsToSync.onZero = partial(resolve, ctx);
    sendRecordsChangedSinceSync(ctx);
  });
}

function getWs(db) {
  if (!db.wsPromise) {
    db.wsPromise = new Promise((resolve, reject) => {
      db.ws = new WrappedSocket('ws://' + db.remote);
      db.ws.on('message', partial(handleIncomingMessage, db));
      db.ws.on('open', () => {
        resolve(db.ws);
      });
    });
  }
  return db.wsPromise;
}

function getSyncContext(db, storeNamesArgs) {
  if (db.syncing) {
    return Promise.reject({type: 'AlreadySyncing'});
  }
  db.syncing = true;
  const storeNames = storeNamesArgs.length ? toArray(storeNamesArgs) : Object.keys(db.stores);
  return db.then(() => {
    return getWs(db);
  }).then((ws) => {
    return {db: db, storeNames: storeNames};
  });
}

function closeSyncContext(ctx) {
  ctx.db.syncing = false;
  ctx.db.disconnect();
}

exports.open = (opts) => {
  return new SDBDatabase(opts);
};

exports.patch = dffptch.patch;

exports.diff = dffptch.diff;

exports.open = (opts) => {
  return new SDBDatabase(opts);
};
