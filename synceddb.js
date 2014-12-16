// SyncedDB

// Begin universal Module Definition
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define([], factory);
  } else if (typeof exports === 'object') {
    // Node. Does not work with strict CommonJS, but
    // only CommonJS-like environments that support module.exports,
    // like Node.
    module.exports = factory();
  } else {
    // Browser globals (root is window)
    root.syncedDB = factory();
  }
}(this, function () {
'use strict';
var exports = {};
// End Universal Module Definition

function toArray(arr) {
  return [].slice.call(arr);
}

function eachKeyVal(obj, fn) {
  Object.keys(obj).forEach(function(key) { fn(key, obj[key]); });
}

var handleVersionChange = function(e) {
  // The database is being deleted or opened with
  // a newer version, possibly in another tab
  e.target.close();
};

function isObject(o) {
  return o !== null && typeof o === 'object';
}

function Countdown(initial) {
  this.val = initial || 0;
}
Countdown.prototype.add = function(n) {
  this.val += n;
  if (this.val === 0) this.onZero();
};

function ImmediateThenable(fn) {
  this.thenCbs = [];
  this.catchCbs = [];
  fn(this._resolve.bind(this), this._reject.bind(this));
}

ImmediateThenable.prototype.then = function(cb) {
  this.thenCbs.push(cb);
};

ImmediateThenable.prototype.catch = function(cb) {
  this.catchCbs.push(cb);
};

ImmediateThenable.prototype._resolve = function(val) {
  this.thenCbs.forEach(function(fn) {
    fn(val);
  });
};

ImmediateThenable.prototype._reject = function(val) {
  this.catchCbs.forEach(function(fn) {
    fn(val);
  });
};

function WrappedSocket(url, protocol) {
  var wws = this;
  Events(wws);
  var ws = this.ws = new WebSocket(url, protocol);
  ws.onopen = function () {
    console.log('Connection open');
    wws.emit('open');
  };
  ws.onerror = function (error) {
    console.log('Connection errror');
    console.log(error);
    wws.emit('error', error);
  };
  ws.onclose = function (e) {
    console.log('Connection closed');
    console.log(e);
    wws.emit('close', e);
  };
  ws.onmessage = function(msg) {
    console.log('Message recieved');
    var data;
    if (typeof msg.data === 'string') {
      data = JSON.parse(msg.data);
    } else {
      data = msg.data;
    }
    wws.emit('message', data);
  };
}

WrappedSocket.prototype.send = function(msg) {
  if (isObject(msg)) {
    this.ws.send(JSON.stringify(msg));
  } else {
    this.ws.send(msg);
  }
};

var SDBIndex = function(name, db, store) {
  this.name = name;
  this.db = db;
  this.store = store;
};

SDBIndex.prototype.get = function(/* keys */) {
  var records, index = this;
  var keys = toArray(arguments);
  return index.db.transaction(index.store.name, 'r', function(store) {
    var txIndex = store[index.name];
    txIndex.get.apply(txIndex, keys).then(function(recs) {
      records = recs;
    });
  }).then(function() {
    return records;
  });
};

var SDBObjectStore = function(db, name, indexes) {
  this.name = name;
  this.db = db;
  this.indexes = indexes;
  Events(this);
  indexes.forEach(function(i) {
    this[i] = new SDBIndex(i, db, this);
  }, this);
};

SDBObjectStore.prototype.get = function() {
  var records, store = this;
  var keys = toArray(arguments);
  return store.db.transaction(store.name, 'r', function(store) {
    store.get.apply(store, keys).then(function(recs) {
      records = recs;
    });
  }).then(function() {
    return records;
  });
};

SDBObjectStore.prototype.put = function() {
  var store = this;
  var objs = toArray(arguments);
  var insertKeys;
  return store.db.transaction(store.name, 'rw', function(store) {
    store.put.apply(store, objs).then(function(keys) {
      insertKeys = keys;
    });
  }).then(function() {
    return insertKeys;
  });
};

var SDBIndexInTransaction = function(name, store) {
  this.name = name;
  this.store = store;
};

function getInRange(index, range) {
  return new ImmediateThenable(function(resolve, reject) {
    var records = [];
    var req = index.openCursor(range);
    req.onsuccess = function() {
      var cursor = req.result;
      if (cursor) {
        records.push(cursor.value);
        cursor.continue();
      } else {
        resolve(records);
      }
    };
  });
}

SDBIndexInTransaction.prototype.get = function() {
  var keys = toArray(arguments);
  var records = [];
  var index = this.store.IDBStore.index(this.name);
  var countdown = new Countdown(keys.length);
  return new Promise(function(resolve, reject) {
    countdown.onZero = function() {
      resolve(records);
    };
    keys.forEach(function(key) {
      getInRange(index, IDBKeyRange.only(key))
      .then(function(recs) {
        records = records.concat(recs);
        countdown.add(-1);
      });
    });
  });
};

SDBIndexInTransaction.prototype.inRange = function(rangeObj) {
  var index = this.store.IDBStore.index(this.name);
  var range = createKeyRange(rangeObj);
  return getInRange(index, range);
};

var SDBObjectStoreInTransaction = function(db, name, IDBStore, indexes) {
  this.name = name;
  this.IDBStore = IDBStore;
  this.changedRecords = [];
  this.indexes = {};
  indexes.forEach(function(i) {
    this.indexes[i] = new SDBIndexInTransaction(i, this);
    this[i] = this[i] || this.indexes[i];
  }, this);
};

SDBObjectStoreInTransaction.prototype.get = function(keys) {
  keys = toArray(arguments);
  var records = [];
  var IDBStore = this.IDBStore;
  return new ImmediateThenable(function(resolve, reject) {
    keys.forEach(function(key) {
      var req = IDBStore.get(key);
      req.onsuccess = function() {
        records.push(req.result);
        if (records.length === keys.length) {
          resolve(keys.length == 1 ? records[0] : records);
        }
      };
    });
  });
};

function insertValInStore(method, store, val, silent) {
  var IDBStore = store.IDBStore;
  return new ImmediateThenable(function(resolve, reject) {
    var isNew = !('key' in val);
    if (isNew) val.key = Math.random().toString(36);
    var req = IDBStore[method](val);
    req.onsuccess = function() {
      var type = (method === 'add' || isNew) ? 'add' : 'update';
      if (!silent) store.changedRecords.push({type: type, record: val});
      resolve(req.result);
    };
  });
}

var putValToStore = insertValInStore.bind(null, 'put');
var addValToStore = insertValInStore.bind(null, 'add');

var insertValsInStore = function(method, store, vals) {
  return new ImmediateThenable(function(resolve, reject) {
    var keys = [];
    vals.forEach(function(val) {
      insertValInStore(method, store, val).then(function(key) {
        keys.push(key);
        if (keys.length === vals.length)
          resolve(vals.length == 1 ? keys[0] : keys);
      });
    });
  });
};

var putValsToStore = insertValsInStore.bind(null, 'put');
var addValsToStore = insertValsInStore.bind(null, 'add');

SDBObjectStoreInTransaction.prototype.put = function() {
  var vals = toArray(arguments);
  vals.forEach(function(val) {
    val.changedSinceSync = 1;
    if (val.serverId && !val.remoteOriginal) {
      // FIXME
    }
  });
  return putValsToStore(this, vals);
};

var createKeyRange = function(r) {
  var gt   = 'gt' in r,
      gte  = 'gte' in r,
      lt   = 'lt' in r,
      lte  = 'lte' in r,
      low  = gt ? r.gt : r.gte,
      high = lt ? r.lt : r.lte;
  return !(gt || gte) ? IDBKeyRange.upperBound(high, lt)
       : !(lt || lte) ? IDBKeyRange.lowerBound(low, gt)
                      : IDBKeyRange.bound(low, high, gt, lt);
};

function callMigrationHooks(data, migrations, newV, curV) {
  while(curV++ < newV)
    if (typeof migrations[curV] === 'function')
      migrations[curV](data.db, data.e);
}

var handleMigrations = function(version, storeDeclaration, migrationHooks, e) {
  var req = e.target;
  var db = req.result;
  var existingStores = db.objectStoreNames;
  var metaStore;
  if (existingStores.contains('sdbMetaData')) {
    metaStore = req.transaction.objectStore('sdbMetaData');
  } else {
    metaStore = db.createObjectStore('sdbMetaData', {keyPath: 'key'});
    metaStore.put({key: 'meta', clientId: undefined});
  }
  eachKeyVal(storeDeclaration, function(storeName, indexes) {
    var store;
    if (existingStores.contains(storeName)) {
      store = req.transaction.objectStore(storeName);
    } else {
      store = db.createObjectStore(storeName, {keyPath: 'key'});
      metaStore.put({ key: storeName + 'Meta', syncedTo: -1});
    }
    indexes.forEach(function(index) {
      if (!store.indexNames.contains(index[0]))
        store.createIndex.apply(store, index);
    });
  });
  if (migrationHooks)
    callMigrationHooks({db: db, e: e}, migrationHooks, version, e.oldVersion);
};

var SDBDatabase = function(name, version, storeDecs, migrations) {
  var db = this;
  db.name = name;
  db.remote = '';
  db.version = version;
  db.stores = {};
  var stores = {};
  eachKeyVal(storeDecs, function(storeName, indexes) {
    stores[storeName] = indexes.concat([['changedSinceSync', 'changedSinceSync']]);
  });
  // Create stores on db object
  eachKeyVal(stores, function(storeName, indexes) {
    var indexNames = indexes.map(function(idx) { return idx[0]; });
    var storeObj = new SDBObjectStore(db, storeName, indexNames);
    db.stores[storeName] = storeObj;
    // Make stores available directly as properties on the db
    // Store shortcut should not override db properties
    db[storeName] = db[storeName] || storeObj;
  });
  db.sdbMetaData = new SDBObjectStore(db, 'sdbMetaData', []);
  this.promise = new Promise(function(resolve, reject) {
    var req = indexedDB.open(name, version);
    req.onupgradeneeded = handleMigrations.bind(null, version, stores, migrations);
    req.onsuccess = function(e) {
      db.db = req.result;
      db.db.onversionchange = handleVersionChange;
      resolve({db: db, e: e});
    };
  });
  return db;
};

SDBDatabase.prototype.then = function(fn) {
  return this.promise.then(fn);
};
SDBDatabase.prototype.catch = function(fn) {
  return this.promise.catch(fn);
};

function emitEvents(stores, dbStores) {
  stores.forEach(function(store) {
    store.changedRecords.forEach(function(change) {
      dbStores[store.name].emit(change.type, {
        record: change.record
      });
    });
  });
}

SDBDatabase.prototype.transaction = function(storeNames, mode, fn) {
  storeNames = [].concat(storeNames);
  mode = mode === 'r'    ? 'readonly'
       : mode === 'read' ? 'readwrite'
       : mode === 'rw'   ? 'readwrite'
                         : mode;
  var db = this;
  return db.then(function(res) {
    return new Promise(function(resolve, reject) {
      var tx = db.db.transaction(storeNames, mode);
      var stores = storeNames.map(function(s) {
        return (new SDBObjectStoreInTransaction(db, s, tx.objectStore(s), db[s].indexes));
      });
      tx.oncomplete = function() {
        emitEvents(stores, db.stores);
        resolve();
      };
      fn.apply(null, stores);
    });
  });
};

SDBDatabase.prototype.read = function() {
  var args = toArray(arguments);
  return this.transaction(args.slice(0, -1), 'read', args.slice(-1)[0]);
};

var forEachRecordChangedSinceSync = function(db, storeNames, fn) {
  db.transaction(storeNames, 'r', function() {
    var stores = toArray(arguments);
    stores.forEach(function(store) {
      var boundFn = fn.bind(null, store.name);
      store.changedSinceSync.get(1)
      .then(function(records) {
        records.forEach(boundFn);
      });
    });
  });
};

var createMsg = function(storeName, clientId, record) {
  return JSON.stringify({
    type: 'create',
    storeName: storeName,
    clientId: clientId,
    record: record,
  });
};

function handleRemoteOk(db, msg) {
  return db.transaction(msg.storeName, 'rw', function(store) {
    store.get(msg.key).then(function(record) {
      record.changedSinceSync = 0;
      record.version = msg.newVersion;
      putValToStore(store, record);
    });
  });
}

function handleRemotePushResponse(db, res, countdown) {
  if (res.type === 'ok') {
    handleRemoteOk(db, res).then(function() {
      countdown.add(-1);
    });
  }
}

var syncToRemote = function(db, ws, storeNames) {
  return new Promise(function(resolve, reject) {
    var counter = new Countdown();
    counter.onZero = resolve;
    getClientId(db, ws).then(function(clientId) {
      ws.on('message', function(data) {
        handleRemotePushResponse(db, data, counter);
      });
      forEachRecordChangedSinceSync(db, storeNames, function(storeName, record) {
        counter.add(1);
        ws.send(createMsg(storeName, clientId, record));
      });
    });
  });
};

SDBDatabase.prototype.pushToRemote = function(/* storeNames */) {
  var db = this;
  var storeNames = arguments.length ? toArray(arguments) : Object.keys(db.stores);
  var ws = new WrappedSocket('ws://' + db.remote);
  return new Promise(function(resolve, reject) {
    ws.on('open', function () {
      syncToRemote(db, ws, storeNames).then(function() {
        console.log('done syncing');
        resolve();
      });
    });
  });
};

function updateStoreSyncedTo(metaStore, storeName, time) {
  metaStore.get(storeName + 'Meta')
  .then(function(storeMeta) {
    storeMeta.syncedTo = time;
    putValToStore(metaStore, storeMeta, true);
  });
}

function getClientId(db, ws) {
  if (db.clientId) {
    return Promise.resolve(db.clientId);
  } else {
    return db.sdbMetaData.get('meta')
    .then(function(meta) {
      if (meta.clientId) {
        db.clientId = meta.clientId;
        return meta.clientId;
      } else {
        meta.clientId = Math.random().toString(36); // FIXME
        return db.transaction('sdbMetaData', 'rw', function(sdbMetaData) {
          putValToStore(sdbMetaData, meta, true);
        }).then(function() {
          db.clientId = meta.clientId;
          return meta.clientId;
        });
      }
    });
  }
}

function requestChangesToStore(db, ws, storeName, clientId) {
  db.sdbMetaData.get(storeName + 'Meta')
  .then(function(storeMeta) {
    ws.send({
      type: 'get-changes',
      storeNames: storeName,
      clientId: clientId,
      since: storeMeta.syncedTo,
    });
  });
}

function handleChanges(db, ws, recordsLeft, msg) {
  if (msg.type === 'sending-changes') {
    recordsLeft.add(msg.nrOfRecordsToSync);
  } else if (msg.type === 'create') {
    msg.record.changedSinceSync = 0;
    db.transaction([msg.storeName, 'sdbMetaData'], 'rw', function(store, metaStore) {
      addValToStore(store, msg.record)
      .then(function() {
        updateStoreSyncedTo(metaStore, msg.storeName, msg.timestamp);
      });
    }).then(function() {
      recordsLeft.add(-1);
    });
  }
}

SDBDatabase.prototype.pullFromRemote = function() {
  var db = this;
  var storeNames = arguments.length ? toArray(arguments) : Object.keys(db.stores);
  return db.then(function() {
    return getClientId(db);
  }).then(function(clientId) {
    db.syncing = true;
    return new Promise(function(resolve, reject) {
      var ws = new WrappedSocket('ws://' + db.remote);
      var recordsLeft = new Countdown(0);
      recordsLeft.onZero = resolve;
      ws.on('open', function() {
        storeNames.map(function(storeName) {
          requestChangesToStore(db, ws, storeName, clientId);
        });
      });
      ws.on('message', function(msg) {
        handleChanges(db, ws, recordsLeft, msg);
      });
    });
  });
};

exports.open = function(name, version, stores, migrations) {
  return new SDBDatabase(name, version, stores, migrations);
};

return exports;
}));
