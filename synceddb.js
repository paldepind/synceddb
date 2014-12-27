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

function copyRecord(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function stripLocalMeta(record) {
  delete record.remoteOriginal;
  delete record.version;
  delete record.changedSinceSync;
  return record;
}

function partial() {
  return Function.bind.apply(arguments[0], arguments);
}

var handleVersionChange = function(e) {
  // The database is being deleted or opened with
  // a newer version, possibly in another tab
  e.target.close();
};

function isObject(o) {
  return o !== null && typeof o === 'object';
}

function isString(s) {
  return typeof s === 'string';
}

function Countdown(initial) {
  this.val = initial || 0;
}
Countdown.prototype.add = function(n) {
  this.val += n;
  if (this.val === 0) this.onZero();
};

// Super retarded promise implementation
function SyncPromise(fn) {
  this._thenCbs = [];
  this._catchCbs = [];
  fn(this._resolve.bind(this), this._reject.bind(this));
}

SyncPromise.prototype._resolve = function(val) {
  if (val && typeof val.then == 'function') {
    val.then(this._resolve.bind(this));
  } else {
    this._thenCbs.forEach(function(fn) {
      fn(val);
    });
  }
};

SyncPromise.prototype._reject = function(val) {
  this._catchCbs.forEach(function(fn) {
    fn(val);
  });
};

SyncPromise.prototype.then = function(onFulfilled) {
  var self = this;
  return (new SyncPromise(function(resolve, reject) {
    self._thenCbs.push(function(result) {
      if (typeof onFulfilled === 'function') {
        resolve(onFulfilled(result));
      } else {
        resolve(result);
      }
    });
    self._catchCbs.push(function(reason) {
      reject(reason);
    });
  }));
};

SyncPromise.prototype.catch = function(cb) {
  this._catchCbs.push(cb);
};

SyncPromise.all = function(promises) {
  return new SyncPromise(function(resolve, reject) {
    var results = [], resolved = 0;
    promises.forEach(function(promise, i) {
      promise.then(function(res) {
        results[i] = res;
        if (++resolved === promises.length) resolve(results);
      });
      promise.catch(reject);
    });
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
    console.log(data);
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

WrappedSocket.prototype.close = function() {
  this.ws.close.apply(this.ws, arguments);
};

var SDBIndex = function(name, db, store) {
  this.name = name;
  this.db = db;
  this.store = store;
};

function doIndexGet(idx, ranges, tx, resolve, reject) {
  var records = [];
  var index = idx.store.IDBStore.index(idx.name);
  var rangesLeft = new Countdown(ranges.length);
  rangesLeft.onZero = partial(resolve, records);
  ranges.forEach(function(range) {
    var req = index.openCursor(range);
    req.onsuccess = function() {
      var cursor = req.result;
      if (cursor) {
        records.push(cursor.value);
        cursor.continue();
      } else {
        rangesLeft.add(-1);
      }
    };
  });
}

SDBIndex.prototype.get = function(/* ranges */) {
  var index = this;
  var ranges = toArray(arguments).map(IDBKeyRange.only);
  return doInStoreTx('readonly', index.store, function(tx, resolve, reject) {
    return doIndexGet(index, ranges, tx, resolve, reject);
  });
};

SDBIndex.prototype.getAll = function() {
  var index = this;
  return doInStoreTx('readonly', index.store, function(tx, resolve, reject) {
    return doIndexGet(index, [undefined], tx, resolve, reject);
  });
};
SDBIndex.prototype.inRange = function(/* ranges */) {
  var index = this;
  var ranges = toArray(arguments).map(createKeyRange);
  return doInStoreTx('readonly', index.store, function(tx, resolve, reject) {
    return doIndexGet(index, ranges, tx, resolve, reject);
  });
};

function setStoreTx(store, tx) {
  store.tx = tx;
  store.IDBStore = tx.objectStore(store.name);
  tx.addEventListener('complete', function() {
    store.tx = undefined;
    emitChangeEvents(store.changedRecords, store.db.stores[store.name]);
    store.changedRecords.length = 0;
  });
}

var SDBObjectStore = function(db, name, indexes, tx) {
  var store = this;
  store.name = name;
  store.db = db;
  store.indexes = indexes;
  store.changedRecords = [];
  Events(store);
  indexes.forEach(function(i) {
    store[i] = new SDBIndex(i, db, store);
  });
  if (tx) setStoreTx(store, tx);
};

function doGet(IDBStore, key, getDeleted) {
  return new SyncPromise(function(resolve, reject) {
    var req = IDBStore.get(key);
    req.onsuccess = function() {
      if (req.result !== undefined &&
          (!req.result.deleted || getDeleted)) {
        resolve(req.result);
      } else {
        reject({type: 'KeyNotFoundError', key: key});
      }
    };
  });
}

SDBObjectStore.prototype.get = function(/* keys */) {
  var store = this;
  var keys = toArray(arguments);
  return doInStoreTx('readonly', store, function(tx, resolve, reject) {
    var gets = keys.map(partial(doGet, store.IDBStore));
    SyncPromise.all(gets)
    .then(function(records) {
      if (keys.length === records.length)
        resolve(keys.length == 1 ? records[0] : records);
    })
    .catch(function(err) { reject(err); });
  });
};

SDBObjectStore.prototype.delete = function(/* keys */) {
  var store = this;
  var args = toArray(arguments);
  return doInStoreTx('readwrite', store, function(tx, resolve, reject) {
    var invalidKey;
    var keys = args.map(function(key) {
      return isString(key) ? key
           : isObject(key) && isString(key.key) ? key.key
           : (invalidKey = key);
    });
    if (invalidKey) reject(new TypeError(invalidKey + ' is not a valid key'));
    var recordsLeftToDelete = new Countdown(keys.length);
    recordsLeftToDelete.onZero = resolve;
    keys.forEach(function(key) {
      deleteFromStore(store, key, 'LOCAL').then(function() {
        recordsLeftToDelete.add(-1);
      });
    });
  });
};

function doInStoreTx(mode, store, cb) {
  if (store.tx) { // We're in transaction
    return (new SyncPromise(function(resolve, reject) {
      cb(store.tx, resolve, reject);
    }));
  } else {
    return store.db.then(function() {
      var tx = store.db.db.transaction(store.name, mode);
      setStoreTx(store, tx);
      return (new Promise(function(resolve, reject) {
        var res;
        cb(tx, function(r) { res = r; }, reject);
        tx.oncomplete = function() { resolve(res); };
      }));
    });
  }
}

SDBObjectStore.prototype.put = function(/* recs */) {
  var recs = toArray(arguments);
  var store = this;
  return doInStoreTx('readwrite', store, function(tx, resolve, reject) {
    var recordsLeftToPut = new Countdown(recs.length);
    recordsLeftToPut.onZero = resolve;
    recs.forEach(function(record) {
      record.changedSinceSync = 1;
      if (record.key) {
        var req = store.IDBStore.get(record.key);
        req.onsuccess = function() {
          record.version = req.result.version;
          if (req.result.changedSinceSync === 0) {
            record.remoteOriginal = stripLocalMeta(copyRecord(req.result));
          }
          putValToStore(store, record, 'LOCAL').then(function(k) {
            recordsLeftToPut.add(-1);
          });
        };
      } else {
        record.key = Math.random().toString(36);
        addValToStore(store, record, 'LOCAL').then(function(k) {
          recordsLeftToPut.add(-1);
        });
      }
    });
  });
};

function emitChangeEvents(changes, dbStore) {
  changes.forEach(function(change) {
    dbStore.emit(change.type, {
      record: change.record,
      origin: change.origin
    });
    if (dbStore.db.continuousWs && change.origin !== 'REMOTE') {
      sendChangeToRemote(dbStore.db.continuousWs, dbStore.name, dbStore.db.clientId, change.record);
    }
  });
}

function insertValInStore(method, store, val, origin) {
  var IDBStore = store.IDBStore;
  return new SyncPromise(function(resolve, reject) {
    var req = IDBStore[method](val);
    req.onsuccess = function() {
      var type = method === 'add' ? 'add' : 'update';
      if (origin !== 'INTERNAL')
        store.changedRecords.push({type: type, origin: origin, record: val});
      resolve(req.result);
    };
  });
}

function deleteFromStore(store, key, origin) {
  var IDBStore = store.IDBStore;
  return new SyncPromise(function(resolve, reject) {
    doGet(IDBStore, key, true).then(function(record) {
      var tombstone = {
        version: record.version, key: record.key,
        changedSinceSync: 1, deleted: true,
        remoteOriginal: record.remoteOriginal || stripLocalMeta(copyRecord(record)),
      };
      store.changedRecords.push({type: 'delete', origin: origin, record: tombstone});
      if (record.changedSinceSync === 1 && !record.remoteOriginal) {
        var req = store.IDBStore.delete(key);
        req.onsuccess = resolve;
      } else {
        putValToStore(store, tombstone, 'INTERNAL').then(resolve);
      }
    });
  });
}

var putValToStore = partial(insertValInStore, 'put');
var addValToStore = partial(insertValInStore, 'add');

var insertValsInStore = function(method, store, vals, origin) {
  return new SyncPromise(function(resolve, reject) {
    var keys = [];
    vals.forEach(function(val) {
      insertValInStore(method, store, val, origin).then(function(key) {
        keys.push(key);
        if (keys.length === vals.length)
          resolve(vals.length == 1 ? keys[0] : keys);
      });
    });
  });
};

var putValsToStore = insertValsInStore.bind(null, 'put');
var addValsToStore = insertValsInStore.bind(null, 'add');

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
      metaStore.put({key: storeName + 'Meta', syncedTo: -1});
    }
    indexes.forEach(function(index) {
      if (!store.indexNames.contains(index[0]))
        store.createIndex.apply(store, index);
    });
  });
  if (migrationHooks)
    callMigrationHooks({db: db, e: e}, migrationHooks, version, e.oldVersion);
};

var SDBDatabase = function(opts) {
  var db = this;
  db.name = opts.name;
  db.remote = opts.remote;
  db.version = opts.version;
  db.recordsToSync = new Countdown();
  db.recordsLeft = new Countdown();
  db.stores = {};
  var stores = {};
  eachKeyVal(opts.stores, function(storeName, indexes) {
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
    var req = indexedDB.open(db.name, db.version);
    req.onupgradeneeded = partial(handleMigrations, db.version, stores, opts.migrations);
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

SDBDatabase.prototype.transaction = function(storeNames, mode, fn) {
  storeNames = [].concat(storeNames);
  mode = mode === 'r'    ? 'readonly'
       : mode === 'read' ? 'readonly'
       : mode === 'rw'   ? 'readwrite'
                         : mode;
  var db = this;
  return db.then(function(res) {
    return new Promise(function(resolve, reject) {
      var tx = db.db.transaction(storeNames, mode);
      var stores = storeNames.map(function(s) {
        return (new SDBObjectStore(db, s, db[s].indexes, tx));
      });
      tx.oncomplete = function() {
        resolve();
      };
      fn.apply(null, stores);
    });
  });
};

SDBDatabase.prototype.read = function() {
  var args = toArray(arguments);
  return this.transaction(args.slice(0, -1), 'r', args.slice(-1)[0]);
};

SDBDatabase.prototype.write = function() {
  var args = toArray(arguments);
  return this.transaction(args.slice(0, -1), 'rw', args.slice(-1)[0]);
};

var findRecordsChangedSinceSync = function(db, storeNames) {
  var records = [];
  return db.transaction(storeNames, 'r', function() {
    var stores = toArray(arguments);
    stores.forEach(function(store) {
      store.changedSinceSync.get(1)
      .then(function(rs) {
        rs.forEach(function(r) {
          records.push({record: r, storeName: store.name});
        });
      });
    });
  }).then(function() { return records; });
};

var createMsg = function(storeName, clientId, record) {
  stripLocalMeta(record);
  return JSON.stringify({
    type: 'create',
    storeName: storeName,
    clientId: clientId,
    record: record,
  });
};

var updateMsg = function(storeName, clientId, record) {
  var remoteOriginal = record.remoteOriginal;
  delete record.remoteOriginal; // Noise free diff
  remoteOriginal.version = record.version;
  remoteOriginal.changedSinceSync = 1;
  var diff = dffptch.diff(remoteOriginal, record);
  record.remoteOriginal = remoteOriginal;
  return JSON.stringify({
    type: 'update',
    storeName: storeName,
    clientId: clientId,
    version: record.version,
    diff: diff,
    key: record.key,
  });
};

var deleteMsg = function(storeName, clientId, record) {
  return JSON.stringify({
    type: 'delete',
    storeName: storeName,
    key: record.key,
    version: record.version,
    clientId: clientId,
  });
};

function sendChangeToRemote(ws, storeName, clientId, record) {
  if (record.deleted) {
    ws.send(deleteMsg(storeName, clientId, record));
  } else if (record.remoteOriginal) {
    ws.send(updateMsg(storeName, clientId, record));
  } else {
    ws.send(createMsg(storeName, clientId, record));
  }
}

function updateStoreSyncedTo(metaStore, storeName, time) {
  metaStore.get(storeName + 'Meta')
  .then(function(storeMeta) {
    storeMeta.syncedTo = time;
    putValToStore(metaStore, storeMeta, 'INTERNAL');
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
        return db.write('sdbMetaData', function(sdbMetaData) {
          putValToStore(sdbMetaData, meta, 'INTERNAL');
        }).then(function() {
          db.clientId = meta.clientId;
          return meta.clientId;
        });
      }
    });
  }
}

function requestChangesToStore(db, ws, clientId, storeName) {
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

var handleIncomingMessageByType = {
  'sending-changes': function(db, ws, msg) {
    db.recordsLeft.add(msg.nrOfRecordsToSync);
  },
  'create': function(db, ws, msg) {
    msg.record.changedSinceSync = 0;
    db.write(msg.storeName, 'sdbMetaData', function(store, metaStore) {
      addValToStore(store, msg.record, 'REMOTE')
      .then(function() {
        updateStoreSyncedTo(metaStore, msg.storeName, msg.timestamp);
      });
    }).then(function() {
      db.recordsLeft.add(-1);
    });
  },
  'update': function(db, ws, msg) {
    db.write(msg.storeName, 'sdbMetaData', function(store, metaStore) {
      doGet(store.IDBStore, msg.key, true).then(function(record) {
        if (record.changedSinceSync === 1) { // Conflict
          var original = record.remoteOriginal;
          var local = stripLocalMeta(record);
          var remote = copyRecord(original);
          dffptch.patch(remote, msg.diff);
          var resolved = db.stores[msg.storeName].handleConflict(original, local, remote);
          return putValToStore(store, resolved, 'LOCAL');
        } else {
          dffptch.patch(record, msg.diff);
          return putValToStore(store, record, 'REMOTE');
        }
      }).then(function() {
        updateStoreSyncedTo(metaStore, msg.storeName, msg.timestamp);
      });
    }).then(function() {
      db.recordsLeft.add(-1);
    });
  },
  'delete': function(db, ws, msg) {
    db.write(msg.storeName, 'sdbMetaData', function(store, metaStore) {
      doGet(store.IDBStore, msg.key, true).then(function(record) {
        if (record.changedSinceSync === 1 && !record.deleted) {
          var original = record.remoteOriginal;
          var local = stripLocalMeta(record);
          var remote = {deleted: true, key: msg.key};
          var resolved = db.stores[msg.storeName].handleConflict(original, local, remote);
          resolved.deleted ? deleteFromStore(store, msg.key)
                           : putValToStore(store, resolved, 'LOCAL');
        } else {
          deleteFromStore(store, msg.key);
        }
      }).then(function() {
        updateStoreSyncedTo(metaStore, msg.storeName, msg.timestamp);
      });
    }).then(function() {
      db.recordsLeft.add(-1);
    });
  },
  'ok': function(db, ws, msg) {
    var record;
    return db.write(msg.storeName, function(store) {
      doGet(store.IDBStore, msg.key, true).then(function(rec) {
        record = rec;
        if (record.deleted) {
          store.IDBStore.delete(msg.key);
        } else {
          record.changedSinceSync = 0;
          record.version = msg.newVersion;
          delete record.remoteOriginal;
          putValToStore(store, record, 'INTERNAL');
        }
      });
    }).then(function() {
      db.stores[msg.storeName].emit('synced', record);
      db.recordsToSync.add(-1);
    });
  },
};

function handleIncomingMessage(db, ws, msg) {
  handleIncomingMessageByType[msg.type](db, ws, msg);
}

function doPullFromRemote(ctx) {
  return new Promise(function(resolve, reject) {
    ctx.db.recordsLeft.onZero = partial(resolve, ctx);
    ctx.storeNames.map(partial(requestChangesToStore, ctx.db, ctx.ws, ctx.clientId));
  });
}

function doPushToRemote(ctx) {
  return new Promise(function(resolve, reject) {
    ctx.db.recordsToSync.onZero = partial(resolve, ctx);
    findRecordsChangedSinceSync(ctx.db, ctx.storeNames)
    .then(function(results) {
      ctx.db.recordsToSync.add(results.length);
      results.forEach(function(res) {
        sendChangeToRemote(ctx.ws, res.storeName, ctx.clientId, res.record);
      });
    });
  });
}

function getSyncContext(db, storeNamesArgs) {
  var storeNames = storeNamesArgs.length ? toArray(storeNamesArgs) : Object.keys(db.stores);
  return getClientId(db)
  .then(function(clientId) {
    return new Promise(function(resolve, reject) {
      var ws = new WrappedSocket('ws://' + db.remote);
      ws.on('message', partial(handleIncomingMessage, db, ws));
      ws.on('open', function() {
        resolve({db: db, storeNames: storeNames, clientId: clientId, ws: ws});
      });
    });
  });
}

function closeWsInCtx(ctx) { ctx.ws.close(); }

SDBDatabase.prototype.pushToRemote = function(/* storeNames */) {
  return getSyncContext(this, arguments)
  .then(doPushToRemote)
  .then(closeWsInCtx);
};

SDBDatabase.prototype.pullFromRemote = function(/* storeNames */) {
  return getSyncContext(this, arguments)
  .then(doPullFromRemote)
  .then(closeWsInCtx);
};

SDBDatabase.prototype.sync = function(/* storeNames */) {
  return getSyncContext(this, arguments)
  .then(doPullFromRemote)
  .then(doPushToRemote)
  .then(closeWsInCtx);
};

SDBDatabase.prototype.syncContinuously = function(/* storeNames */) {
  var db = this;
  return getSyncContext(db, arguments)
  .then(function(ctx) {
    db.continuousWs = ctx.ws;
    return ctx;
  }).then(doPullFromRemote)
  .then(doPushToRemote);
};

exports.open = function(opts) {
  return new SDBDatabase(opts);
};

return exports;
}));
