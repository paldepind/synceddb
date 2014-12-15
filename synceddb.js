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

var SDBIndex = function(name, db, store) {
  this.name = name;
  this.db = db;
  this.store = store;
};

SDBIndex.prototype.get = function(/* keys */) {
  var records, index = this;
  var keys = toArray(arguments);
  return index.db.transaction(index.store.name, 'r', function(stores) {
    var txIndex = stores[index.store.name][index.name];
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
  return store.db.transaction(store.name, 'r', function(stores) {
    var txStore = stores[store.name];
    txStore.get.apply(txStore, keys).then(function(recs) {
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
  return store.db.transaction(store.name, 'rw', function(stores) {
    stores[store.name].put.apply(stores[store.name], objs).then(function(keys) {
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
    var gets = keys.map(function(key) {
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
  storeDeclaration.forEach(function(s) {
    var store;
    if (existingStores.contains(s[0])) {
      store = req.transaction.objectStore(s[0]);
    } else {
      store = db.createObjectStore(s[0], {keyPath: 'key'});
      metaStore.put({ key: s[0] + 'Meta', syncedTo: -1});
    }
    s.slice(1).forEach(function(index) {
      if (!store.indexNames.contains(index[0]))
        store.createIndex.apply(store, index);
    });
  });
  if (migrationHooks)
    callMigrationHooks({db: db, e: e}, migrationHooks, version, e.oldVersion);
};

var SDBDatabase = function(name, version, stores, migrations) {
  var db = this;
  db.name = name;
  db.remote = '';
  db.version = version;
  db.stores = {};
  stores = stores.map(function(store) {
    return store.concat([['changedSinceSync', 'changedSinceSync']]);
  });
  // Create stores on db object
  stores.forEach(function(store) {
    var indexNames = store.slice(1).map(function(idx) { return idx[0]; });
    var storeObj = new SDBObjectStore(db, store[0], indexNames);
    db.stores[store[0]] = storeObj;
    // Make stores available directly as properties on the db
    // Store shortcut should not override db properties
    db[store[0]] = db[store[0]] || storeObj;
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
  for (var name in stores) {
    stores[name].changedRecords.forEach(function(change) {
      dbStores[name].emit(change.type, {
        record: change.record
      });
    });
  }
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
      var stores = {};
      storeNames.forEach(function(s) {
        stores[s] = new SDBObjectStoreInTransaction(db, s, tx.objectStore(s), db[s].indexes);
      });
      tx.oncomplete = function() {
        emitEvents(stores, db.stores);
        resolve();
      };
      fn(stores);
    });
  });
};

SDBDatabase.prototype.read = function() {
  var args = toArray(arguments);
  return this.transaction(args.slice(0, -1), 'read', args.slice(-1)[0]);
};

var forEachRecordChangedSinceSync = function(db, fn) {
  var storeNames = Object.keys(db.stores);
  db.transaction(storeNames, 'r', function(stores) {
    storeNames.forEach(function(storeName) {
      var boundFn = fn.bind(null, storeName);
      stores[storeName].changedSinceSync.get(1)
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
  return db.transaction(msg.storeName, 'rw', function(stores) {
    var store = stores[msg.storeName];
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

var syncToRemote = function(ws, db) {
  return new Promise(function(resolve, reject) {
    var counter = new Countdown();
    counter.onZero = resolve;
    getClientId(db, ws).then(function(clientId) {
      var messageUnresolved = 0;
      ws.onmessage = function(msg) {
        var msgObj = JSON.parse(msg.data);
        handleRemotePushResponse(db, msgObj, counter);
      };
      forEachRecordChangedSinceSync(db, function(storeName, record) {
        counter.add(1);
        ws.send(createMsg(storeName, clientId, record));
      });
    });
  });
};

SDBDatabase.prototype.pushToRemote = function(startFn) {
  var db = this;
  db.syncing = true;
  var ws = new WebSocket('ws://' + db.remote);
  return new Promise(function(resolve, reject) {
    ws.onopen = function () {
      console.log('Connection established');
      syncToRemote(ws, db).then(function() {
        console.log('done syncing');
        resolve();
      });
    };
    ws.onerror = function (error) {
      console.log('Connection errror', error);
    };
    ws.onclose = function (e) {
      console.log('Connection closed', e);
    };
  });
};

function updateStoreSyncedTo(stores, storeName, time) {
  stores.sdbMetaData.get(storeName + 'Meta')
  .then(function(storeMeta) {
    storeMeta.syncedTo = time;
    putValToStore(stores.sdbMetaData, storeMeta, true);
  });
}

function handleRecordChange(db, msg) {
  if (msg.type === 'create') {
    msg.record.changedSinceSync = 0;
    return db.transaction([msg.storeName, 'sdbMetaData'], 'rw', function(stores) {
      addValToStore(stores[msg.storeName], msg.record)
      .then(function() {
        updateStoreSyncedTo(stores, msg.storeName, msg.timestamp);
      });
    });
  }
}

function handleChanges(db, ws, recordsLeft) {
  if (recordsLeft.val === 0) {
    recordsLeft.add(0);
  } else {
    ws.onmessage = function(msg) {
      var data = JSON.parse(msg.data);
      handleRecordChange(db, data)
      .then(recordsLeft.add.bind(recordsLeft, -1));
    };
  }
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
        return db.transaction(['sdbMetaData'], 'rw', function(stores) {
          putValToStore(stores.sdbMetaData, meta, true);
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
    ws.send(JSON.stringify({
      type: 'get-changes',
      storeNames: storeName,
      clientId: clientId,
      since: storeMeta.syncedTo,
    }));
  });
}

SDBDatabase.prototype.pullFromRemote = function() {
  var db = this;
  var storeNames = toArray(arguments);
  var storeName = storeNames[0];
  return db.then(function() {
    return getClientId(db);
  }).then(function(clientId) {
    db.syncing = true;
    return new Promise(function(resolve, reject) {
      var ws = new WebSocket('ws://' + db.remote);
      ws.onopen = requestChangesToStore.bind(null, db, ws, storeName, clientId);
      ws.onerror = function (error) {
        console.log('Connection errror');
        console.log(error);
      };
      ws.onclose = function (e) {
        console.log('Connection closed');
        console.log(e);
      };
      ws.onmessage = function(msg) {
        console.log('on msg');
        var data = JSON.parse(msg.data);
        if (data.type === 'sending-changes') {
          var recordsLeft = new Countdown(data.nrOfRecordsToSync);
          recordsLeft.onZero = resolve;
          handleChanges(db, ws, recordsLeft);
        }
      };
    });
  });
};

exports.open = function(name, version, stores, migrations) {
  return new SDBDatabase(name, version, stores, migrations);
};

return exports;
}));
