// dffptch

var O = Object; // Our own binding to Object – global objects can't be minified
var keys = O.keys; // Same for keys, we use this funcion quite a bit

exports.diff = function diff(a, b) {
  var aKeys = keys(a).sort(),
      bKeys = keys(b).sort(),
      delta = {}, adds = {}, mods = {}, dels = [], recurses = {},
      aI = 0, bI = 0;
  // Continue looping as long as we haven't reached the end of both keys lists
  while(aKeys[aI] || bKeys[bI]) {
    var aKey = aKeys[aI], shortAKey = String.fromCharCode(aI+48),
        bKey = bKeys[bI],
        aVal = a[aKey], bVal = b[bKey];
    if (aKey == bKey) {
      // We are looking at two equal keys this is a
      // change – possibly to an object or array
      if (O(aVal) === aVal && O(bVal) === bVal) {
        // Find changs in the object recursively
        var rDelta = diff(aVal, bVal);
        // Add recursive delta if it contains modifications
        if(keys(rDelta)[0]) recurses[shortAKey] = rDelta;
      } else if (aVal !== bVal) {
        mods[shortAKey] = bVal;
      }
      aI++; bI++;
    } else if (aKey > bKey || !aKey) {
      // aKey is ahead, this means keys have been added to b
      adds[bKey] = bVal;
      bI++;
    } else {
      // bKey is larger, keys have been deleted
      dels.push(shortAKey);
      aI++;
    }
  }
  // We only add the change types to delta if they contains changes
  if (dels[0]) delta.d = dels;
  if (keys(adds)[0]) delta.a = adds;
  if (keys(mods)[0]) delta.m = mods;
  if (keys(recurses)[0]) delta.r = recurses;
  return delta;
};

exports.patch = function patch(obj, delta) {
  var operation, key, val, longKey, objKeys = keys(obj).sort();
  for (operation in delta) {
    // Operation is either 'a', 'm', 'd' or 'r'
    for (key in delta[operation]) {
      val = delta[operation][key];
      longKey = objKeys[(operation != 'd' ? key : val).charCodeAt()-48];
      operation == 'a' ? obj[key] = val : // addition
      operation == 'm' ? obj[longKey] = val : // modification
      operation == 'd' ? delete obj[longKey] : // deletion
                        patch(obj[longKey], val); // recuse
    }
  }
};
// SyncedDB
'use strict';

// Minivents
// https://github.com/allouis/minivents
function Events(target){
  var events = {};
  target = target || this;
  // On: listen to events
  target.on = function(type, func, ctx){
    (events[type] = events[type] || []).push({f:func, c:ctx});
  };
  // Off: stop listening to event / specific callback
  target.off = function(type, func){
    type || (events = {});
    var list = events[type] || [],
    i = list.length = func ? list.length : 0;
    while(i-->0) func == list[i].f && list.splice(i,1);
  };
  // Emit: send event, callbacks will be triggered
  target.emit = function(){
    var args = Array.apply([], arguments),
    list = events[args.shift()] || [], i=0, j;
    for(;j=list[i++];) j.f.apply(j.c, args);
  };
}

// Utility functions

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

function extractKey(k) {
  k = isKey(k) ? k
    : isObject(k) && isKey(k.key) ? k.key
    : undefined;
  if (isUndef(k)) throw new TypeError(k + ' is not a valid key');
  return k;
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
  var self = this;
  if (val && isFunc(val.then)) {
    val.then(this._resolve.bind(this));
  } else {
    self.val = val;
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
    if ('val' in self) {
      resolve(isFunc(onFulfilled) ? onFulfilled(self.val)
                                  : self.val);
    } else {
      self._thenCbs.push(function(result) {
        resolve(isFunc(onFulfilled) ? onFulfilled(result)
                                    : result);
      });
      self._catchCbs.push(function(reason) {
        reject(reason);
      });
    }
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
    if (isString(msg.data)) {
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
      cursor ? (records.push(cursor.value), cursor.continue())
             : rangesLeft.add(-1);
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
      if (!isUndef(req.result) &&
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
    var keys = args.map(extractKey);
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

function doPutRecord(store, record) {
  record.changedSinceSync = 1;
  return new SyncPromise(function(resolve, reject) {
    if (!isUndef(record.key)) { // Update existing record
      doGet(store.IDBStore, record.key).then(function(oldRecord) {
        record.version = oldRecord.version;
        if (oldRecord.changedSinceSync === 0) {
          record.remoteOriginal = stripLocalMeta(copyRecord(oldRecord));
        }
        putValToStore(store, record, 'LOCAL').then(resolve);
      });
    } else { // Add new record
      record.key = Math.random().toString(36);
      addRecToStore(store, record, 'LOCAL').then(resolve);
    }
  });
}

SDBObjectStore.prototype.put = function(/* recs */) {
  var recs = toArray(arguments);
  var store = this;
  return doInStoreTx('readwrite', store, function(tx, resolve, reject) {
    var puts = recs.map(partial(doPutRecord, store));
    SyncPromise.all(puts).then(resolve);
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
      if ((record.changedSinceSync === 1 && !record.remoteOriginal)
          || origin === 'REMOTE') {
        var req = store.IDBStore.delete(key);
        req.onsuccess = resolve;
      } else {
        putValToStore(store, tombstone, 'INTERNAL').then(resolve);
      }
    });
  });
}

var putValToStore = partial(insertValInStore, 'put');
var addRecToStore = partial(insertValInStore, 'add');

var createKeyRange = function(r) {
  var gt   = 'gt' in r,
      gte  = 'gte' in r,
      lt   = 'lt' in r,
      lte  = 'lte' in r,
      low  = gt ? r.gt : r.gte,
      high = lt ? r.lt : r.lte;
  return !gt && !gte ? IDBKeyRange.upperBound(high, lt)
       : !lt && !lte ? IDBKeyRange.lowerBound(low, gt)
                     : IDBKeyRange.bound(low, high, gt, lt);
};

function callMigrationHooks(data, migrations, newV, curV) {
  while(curV++ < newV)
    if (isFunc(migrations[curV]))
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
      metaStore.put({key: storeName + 'Meta', syncedTo: null});
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
  Events(db);
  db.name = opts.name;
  db.remote = opts.remote;
  db.version = opts.version;
  db.recordsToSync = new Countdown();
  db.changesLeftFromRemote = new Countdown();
  db.messages = new Events();
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
  return new Promise(function(resolve, reject) {
    db.then(function(res) {
      var tx = db.db.transaction(storeNames, mode);
      var stores = storeNames.map(function(s) {
        return (new SDBObjectStore(db, s, db[s].indexes, tx));
      });
      tx.oncomplete = resolve;
      fn.apply(null, stores);
    });
  });
};

SDBDatabase.prototype.read = function() {
  var args = toArray(arguments), fn = args.pop();
  return this.transaction(args, 'r', fn);
};

SDBDatabase.prototype.write = function() {
  var args = toArray(arguments), fn = args.pop();
  return this.transaction(args, 'rw', fn);
};

var getRecordsChangedSinceSync = function(db, storeNames) {
  var records = [];
  return db.transaction(storeNames, 'r', function() {
    var stores = toArray(arguments);
    stores.forEach(function(store) {
      store.changedSinceSync.get(1).then(function(rs) {
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
  var diff = exports.diff(remoteOriginal, record);
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
  var msgFunc = record.deleted        ? deleteMsg
              : record.remoteOriginal ? updateMsg
                                      : createMsg;
  ws.send(msgFunc(storeName, clientId, record));
}

function updateStoreSyncedTo(metaStore, storeName, time) {
  metaStore.get(storeName + 'Meta').then(function(storeMeta) {
    storeMeta.syncedTo = time;
    putValToStore(metaStore, storeMeta, 'INTERNAL');
  });
}

function getClientId(db, ws) {
  if (db.clientId) {
    return Promise.resolve(db.clientId);
  } else {
    return db.sdbMetaData.get('meta').then(function(meta) {
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
  db.sdbMetaData.get(storeName + 'Meta').then(function(storeMeta) {
    ws.send({
      type: 'get-changes',
      storeName: storeName,
      clientId: clientId,
      since: storeMeta.syncedTo,
    });
  });
}

function handleRemoteChange(db, storeName, cb) {
  db.write(storeName, 'sdbMetaData', cb).then(function() {
    db.changesLeftFromRemote.add(-1);
  });
}

var handleIncomingMessageByType = {
  'sending-changes': function(db, ws, msg) {
    db.emit('sync-initiated', msg);
    db.changesLeftFromRemote.add(msg.nrOfRecordsToSync);
  },
  'create': function(db, ws, msg) {
    msg.record.changedSinceSync = 0;
    handleRemoteChange(db, msg.storeName, function(store, metaStore) {
      addRecToStore(store, msg.record, 'REMOTE').then(function() {
        updateStoreSyncedTo(metaStore, msg.storeName, msg.timestamp);
      });
    });
  },
  'update': function(db, ws, msg) {
    handleRemoteChange(db, msg.storeName, function(store, metaStore) {
      doGet(store.IDBStore, msg.key, true).then(function(record) {
        if (record.changedSinceSync === 1) { // Conflict
          var original = record.remoteOriginal;
          var local = stripLocalMeta(record);
          var remote = copyRecord(original);
          exports.patch(remote, msg.diff);
          var resolved = db.stores[msg.storeName].handleConflict(original, local, remote);
          return putValToStore(store, resolved, 'LOCAL');
        } else {
          exports.patch(record, msg.diff);
          return putValToStore(store, record, 'REMOTE');
        }
      }).then(function() {
        updateStoreSyncedTo(metaStore, msg.storeName, msg.timestamp);
      });
    });
  },
  'delete': function(db, ws, msg) {
    handleRemoteChange(db, msg.storeName, function(store, metaStore) {
      doGet(store.IDBStore, msg.key, true).then(function(record) {
        if (record.changedSinceSync === 1 && !record.deleted) {
          var original = record.remoteOriginal;
          var local = stripLocalMeta(record);
          var remote = {deleted: true, key: msg.key};
          var resolved = db.stores[msg.storeName].handleConflict(original, local, remote);
          resolved.deleted ? deleteFromStore(store, msg.key, 'REMOTE')
                           : putValToStore(store, resolved, 'LOCAL');
        } else {
          deleteFromStore(store, msg.key, 'REMOTE');
        }
      }).then(function() {
        updateStoreSyncedTo(metaStore, msg.storeName, msg.timestamp);
      });
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
          if (!isUndef(msg.newKey)) {
            record.key = msg.newKey;
            store.IDBStore.delete(msg.key);
          }
          putValToStore(store, record, 'INTERNAL');
        }
      });
    }).then(function() {
      db.stores[msg.storeName].emit('synced', msg.key, record);
      db.recordsToSync.add(-1);
    });
  },
  'reject': function(db, ws, msg) {
    var func = db.stores[msg.storeName].handleReject;
    if (!isFunc(func)) {
      throw new Error('Reject message recieved from remote but no reject handler is supplied');
    }
    db.stores[msg.storeName].get(msg.key).then(function(record) {
      return func(record, msg);
    }).then(function(record) {
      record ? sendChangeToRemote(ws, msg.storeName, db.clientId, record)
             : db.recordsToSync.add(-1); // Skip syncing record
    });
  },
};

function handleIncomingMessage(db, ws, msg) {
  var handler = handleIncomingMessageByType[msg.type];
  handler ? handler(db, ws, msg)
          : db.messages.emit(msg.type, msg);
}

function doPullFromRemote(ctx) {
  return new Promise(function(resolve, reject) {
    ctx.db.changesLeftFromRemote.onZero = partial(resolve, ctx);
    ctx.storeNames.map(partial(requestChangesToStore, ctx.db, ctx.ws, ctx.clientId));
  });
}

function doPushToRemote(ctx) {
  return new Promise(function(resolve, reject) {
    ctx.db.recordsToSync.onZero = partial(resolve, ctx);
    getRecordsChangedSinceSync(ctx.db, ctx.storeNames)
    .then(function(records) {
      ctx.db.recordsToSync.add(records.length);
      records.forEach(function(res) {
        sendChangeToRemote(ctx.ws, res.storeName, ctx.clientId, res.record);
      });
    });
  });
}

function getSyncContext(db, storeNamesArgs) {
  if (db.syncing) {
    return Promise.reject({type: 'AlreadySyncing'});
  }
  db.syncing = true;
  var storeNames = storeNamesArgs.length ? toArray(storeNamesArgs) : Object.keys(db.stores);
  return getClientId(db).then(function(clientId) {
    return new Promise(function(resolve, reject) {
      var ws = new WrappedSocket('ws://' + db.remote);
      ws.on('message', partial(handleIncomingMessage, db, ws));
      ws.on('open', function() {
        resolve({db: db, storeNames: storeNames, clientId: clientId, ws: ws});
      });
    });
  });
}

function closeSyncContext(ctx) {
  ctx.db.syncing = false;
  ctx.ws.close();
}

SDBDatabase.prototype.pushToRemote = function(/* storeNames */) {
  return getSyncContext(this, arguments)
  .then(doPushToRemote)
  .then(closeSyncContext);
};

SDBDatabase.prototype.pullFromRemote = function(/* storeNames */) {
  return getSyncContext(this, arguments)
  .then(doPullFromRemote)
  .then(closeSyncContext);
};

SDBDatabase.prototype.sync = function(/* storeNames */) {
  return getSyncContext(this, arguments)
  .then(doPullFromRemote)
  .then(doPushToRemote)
  .then(closeSyncContext);
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
