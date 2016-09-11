const dffptch = require('dffptch');
const SyncPromise = require('sync-promise');
const {isString, isNumber, isFunction, isUndefined, partial} = require('underscore');
const Countdown = require('./countdown');
const WrappedSocket = require('./wrappedsocket');

function doGet(IDBStore, key, getDeleted) {
  return new SyncPromise((resolve, reject) => {
    const req = IDBStore.get(key);
    req.onsuccess = () => {
      if (!isUndefined(req.result) &&
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

function doIndexGet(idxName, queries, IDBStore, resolve, reject) {
  const records = [];
  const index = IDBStore.index(idxName);
  const queriesLeft = new Countdown(queries.length);
  queriesLeft.onZero = partial(resolve, records);
  for (let query of queries) {
    let {skip, limit} = query;
    const req = index.openCursor(query.range, query.direction);
    const handleWithSkip = () => {
      const cursor = req.result;
      if (!cursor) return queriesLeft.add(-1);
      req.onsuccess = limit != null ? handlerWithLimit : handler;
      return cursor.advance(skip);
    };
    const handlerWithLimit = () => {
      const cursor = req.result;
      if (!cursor || !limit) return queriesLeft.add(-1);
      records.push(cursor.value);
      limit--;
      cursor.continue();
    };
    const handler = () => {
      const cursor = req.result;
      if (!cursor) return queriesLeft.add(-1);
      records.push(cursor.value);
      cursor.continue();
    };
    req.onsuccess = skip != null ? handleWithSkip
      : limit != null ? handlerWithLimit
      : handler;
  }
}

function createQuery(q) {
  return {
    range: createKeyRange(q),
    skip: q.skip,
    limit: q.limit,
    // 'next' || 'nextunique' || 'prev' || 'prevunique'
    direction: q.direction,
  };
}

function doPushToRemote(ctx) {
  return new Promise((resolve, reject) => {
    ctx.db.recordsToSync.onZero = partial(resolve, ctx);
    sendRecordsChangedSinceSync(ctx);
  });
}

function closeSyncContext(ctx) {
  ctx.db.syncing = false;
  ctx.db.disconnect();
}

function doPullFromRemote(ctx) {
  return new Promise((resolve, reject) => {
    ctx.db.changesLeftFromRemote.onZero = partial(resolve, ctx);
    ctx.storeNames.map(partial(requestChangesToStore, ctx.db, ctx.db.ws));
  });
}

function sendRecordsChangedSinceSync(ctx) {
  return ctx.db.transaction(ctx.storeNames, 'r', (...stores) => {
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

const putRecToStore = partial(insertRecToStore, 'put');
const addRecToStore = partial(insertRecToStore, 'add');

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

function isKey(k) {
  return isString(k) || isNumber(k);
}

function createTombstone(r) {
  return {
    version: r.version,
    key: r.key,
    changedSinceSync: 1,
    deleted: true,
    remoteOriginal: r.remoteOriginal || copyWithoutMeta(r),
  };
}

function createMsg(storeName, record) {
  const r = copyWithoutMeta(record);
  delete r.key;
  return {
    type: 'create',
    storeName: storeName,
    record: r,
    key: record.key,
  };
}


function copyWithoutMeta(rec) {
  const r = copyRecord(rec);
  delete r.remoteOriginal;
  delete r.version;
  delete r.changedSinceSync;
  return r;
}

function updateMsg(storeName, record) {
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
}

function deleteMsg(storeName, record) {
  return {
    type: 'delete',
    storeName: storeName,
    key: record.key,
    version: record.version,
  };
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

function getSyncContext(db, storeNames) {
  if (db.syncing) {
    return Promise.reject({type: 'AlreadySyncing'});
  }
  db.syncing = true;
  storeNames = storeNames.length ? storeNames : Object.keys(db.stores);
  return db.then(() => {
    return getWs(db);
  }).then((ws) => {
    return {db: db, storeNames: storeNames};
  });
}

function copyRecord(obj) {
  return JSON.parse(JSON.stringify(obj));
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
          if (!isUndefined(msg.newKey)) {
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
    if (!isFunction(f)) {
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
  isFunction(handler) ? handler(db, db.ws, msg)
                  : target.emit(msg.type, msg);
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

function updateStoreSyncedTo(metaStore, storeName, time) {
  metaStore.get(storeName + 'Meta').then((storeMeta) => {
    storeMeta.syncedTo = time;
    putRecToStore(metaStore, storeMeta, 'INTERNAL');
  });
}

function handleRemoteChange(db, storeName, cb) {
  return db.write(storeName, 'sdbMetaData', cb).then(() => {
    db.changesLeftFromRemote.add(-1);
  });
}

module.exports = {doGet, doInStoreTx, doIndexGet, doPushToRemote,
    closeSyncContext, doPullFromRemote, sendRecordsChangedSinceSync,
    deleteFromStore, getSyncContext, sendChangeToRemote, isKey, addRecToStore,
    putRecToStore, copyWithoutMeta, getWs, createQuery,};
