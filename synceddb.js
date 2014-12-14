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

var SDBIndex = function(name, store) {
  this.name = name;
  this.store = store;
};

SDBIndex.prototype.get = function() {
  var keys = [].slice.call(arguments);
  var storeName = this.store.name;
  var indexName = this.name;
  var db = this.store.db;
  return new Promise(function(resolve, reject) {
    db.then(function(res) {
      var records = [];
      var req, keyReq, valReq;
      var tx = res.db.db.transaction(storeName, 'readonly');
      var store = tx.objectStore(storeName);
      var index = store.index(indexName);
      keys.forEach(function(key) {
        if (!index.unique) {
          req = index.openCursor(IDBKeyRange.only(key));
          req.onsuccess = function() {
            var cursor = req.result;
            if (cursor) {
              records.push(cursor.value);
              cursor.continue();
            }
          };
        } else {
          keyReq = index.getKey(key);
          valReq = index.get(key);
        }
        tx.oncomplete = function() {
          resolve(index.unique ? valReq.result : (records));
        };
      });
    });
  });
};

var SDBObjectStore = function(db, name, indexes) {
  this.name = name;
  this.db = db;
  this.indexes = indexes;
  Events(this);
  indexes.forEach(function(i) {
    this[i] = new SDBIndex(i, this);
  }, this);
};

SDBObjectStore.prototype.get = function() {
  var records, store = this;
  var keys = [].slice.call(arguments);
  return store.db.transaction(this.name, 'r', function(stores) {
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
  var objs = [].slice.call(arguments);
  var insertKeys;
  return store.db.transaction(store.name, 'rw', function(stores) {
    stores[store.name].put.apply(stores[store.name], objs).then(function(keys) {
      insertKeys = keys;
    });
  }).then(function() {
    return insertKeys;
  });
};

var SDBObjectStoreInTransaction = function(db, tx, name, indexes) {
  this.name = name;
  this.db = db;
  this.tx = tx;
  this.IDBStore = tx.objectStore(name);
  this.changedRecords = [];
  this.indexes = indexes;
  indexes.forEach(function(i) {
    this[i] = new SDBIndex(i, this);
  }, this);
};

SDBObjectStoreInTransaction.prototype.get = function(keys) {
  var store = this;
  var db = store.db;
  keys = [].slice.call(arguments);
  var records = [];
  var IDBStore = this.IDBStore;
  return new ImmediateThenable(function(resolve, reject) {
    var gets = keys.map(function(key) {
      var req = IDBStore.get(key);
      req.onsuccess = function() {
        req.result !== undefined ? records.push(req.result)
                                 : reject('Key not found'); // FIXME
        if (records.length === keys.length) {
          resolve(keys.length == 1 ? records[0] : records);
        }
      };
    });
  });
};

function insertValInStore(method, store, val) {
  var IDBStore = store.IDBStore;
  return new ImmediateThenable(function(resolve, reject) {
    var isNew = !('key' in val);
    if (isNew) val.key = Math.random().toString(36);
    var req = IDBStore[method](val);
    req.onsuccess = function() {
      var type = (method === 'add' || isNew) ? 'add' : 'update';
      store.changedRecords.push({type: type, record: val});
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
  var store = this;
  var vals = [].slice.call(arguments);
  vals.forEach(function(val) {
    val.changedSinceSync = 1;
    if (val.serverId && !val.remoteOriginal) {
      // FIXME
    }
  });
  return putValsToStore(store, vals);
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

SDBObjectStore.prototype.inRange = function(rangeObj) {
  var keyRange = createKeyRange(rangeObj);
  var storeName = this.name;
  var db = this.db;
  return new Promise(function(resolve, reject) {
    db.then(function(res) {
      var records = [];
      var tx = res.db.db.transaction(storeName, 'readonly');
      var store = tx.objectStore(storeName);
      var req = store.openCursor(keyRange);
      req.onsuccess = function() {
        var cursor = req.result;
        if (cursor) {
          records.push(cursor.value);
          cursor.continue();
        }
      };
      tx.oncomplete = function() {
        resolve(records);
      };
    });
  });
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
  storeDeclaration.forEach(function(s) {
    var storeDeclaration =
      existingStores.contains(s[0]) ?
        req.transaction.objectStore(s[0]) :
        db.createObjectStore(s[0], {keyPath: 'key'});
    s.slice(1).forEach(function(index) {
      if (!storeDeclaration.indexNames.contains(index[0]))
        storeDeclaration.createIndex.apply(storeDeclaration, index);
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
    return store.concat([['changedSinceSync', 'changedSinceSync'],
                         ['key', 'key', {unique: true}]]);
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
      var stores = storeNames.reduce(function(ss, s) {
        ss[s] = new SDBObjectStoreInTransaction(db, tx, s, db[s].indexes);
        return ss;
      }, {tx: tx});
      tx.oncomplete = function() {
        storeNames.forEach(function(storeName) {
          var store = stores[storeName];
          store.changedRecords.forEach(function(change) {
            db.stores[storeName].emit(change.type, {
              record: change.record
            });
          });
        });
        resolve();
      };
      fn(stores);
    });
  });
};

SDBDatabase.prototype.read = function() {
  var args = [].slice.call(arguments);
  return this.transaction(args.slice(0, -1), 'read', args.slice(-1)[0]);
};

var createMsg = function(storeName, record) {
  return JSON.stringify({
    type: 'create',
    storeName: storeName,
    record: record,
  });
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

function handleRemoteOk(db, msg) {
  return db.transaction(msg.storeName, 'rw', function(stores) {
    var store = stores[msg.storeName];
    store.get(msg.key)
    .then(function(record) {
      record.changedSinceSync = 0;
      record.version = msg.newVersion;
      putValToStore(store, record);
    });
  });
}

var syncToRemote = function(ws, db) {
  return new Promise(function(resolve, reject) {
    var messageUnresolved = 0;
    ws.onmessage = function(msg) {
      var msgObj = JSON.parse(msg.data);
      if (msgObj.type === 'ok') {
        handleRemoteOk(db, msgObj)
        .then(function() {
          messageUnresolved--;
          if (messageUnresolved === 0) resolve();
        });
      }
    };
    forEachRecordChangedSinceSync(db, function(storeName, record) {
      console.log('Sending record');
      messageUnresolved++;
      ws.send(createMsg(storeName, record));
    });
  });
};

SDBDatabase.prototype.pushToRemote = function(startFn) {
  var db = this;
  this.syncing = true;
  var ws = new WebSocket('ws://' + db.remote);
  return new Promise(function(resolve, reject) {
    ws.onopen = function () {
      console.log('Connection established');
      syncToRemote(ws, db)
      .then(function() {
        console.log('done syncing');
        resolve();
      });
    };
    ws.onerror = function (error) {
      console.log('Connection errror');
      console.log(error);
    };
    ws.onclose = function (e) {
      console.log('Connection closed');
      console.log(e);
    };
  });
};

function handleRecordChange(db, msg) {
  if (msg.type === 'create') {
    msg.record.changedSinceSync = 0;
    return db.transaction(msg.storeName, 'rw', function(stores) {
      addValToStore(stores[msg.storeName], msg.record);
    });
  }
}

function handleChanges(db, ws, nrOfRecordsToSync) {
  if (nrOfRecordsToSync === 0) {
    console.log('nr of record is ZEROO!');
    return Promise.resolve();
  } else {
    return new Promise(function(resolve, reject) {
      ws.onmessage = function(msg) {
        var data = JSON.parse(msg.data);
        handleRecordChange(db, data)
        .then(function() {
          nrOfRecordsToSync--;
          if (nrOfRecordsToSync === 0) resolve();
        });
      };
    });
  }
}

SDBDatabase.prototype.pullFromRemote = function() {
  var db = this;
  var storeNames = toArray(arguments);
  return db.then(function() {
    var nrOfRecordsToSync = 0;
    db.syncing = true;
    return new Promise(function(resolve, reject) {
      var ws = new WebSocket('ws://' + db.remote);
      ws.onopen = function () {
        ws.send(JSON.stringify({
          type: 'get-changes',
          storeNames: storeNames,
          clientId: 'foobar',
          since: -1,
        }));
      };
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
          handleChanges(db, ws, data.nrOfRecordsToSync)
          .then(resolve);
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
