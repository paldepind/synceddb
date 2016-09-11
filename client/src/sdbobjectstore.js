const SyncPromise = require('sync-promise');
const Events = require('minivents');
const {isUndefined, isObject, partial} = require('underscore');
const {doGet, doInStoreTx, deleteFromStore, sendChangeToRemote, putRecToStore, addRecToStore, isKey, copyWithoutMeta} = require('./utils');
const SDBIndex = require('./sdbindex');

class SDBObjectStore {
  constructor(db, name, indexes, tx) {
    this.name = name;
    this.db = db;
    this.indexes = indexes;
    this.changedRecords = [];
    this.messages = new Events();
    this.tx = tx;
    Events(this);
    indexes.forEach((i) => {
      this[i] = new SDBIndex(i, db, this);
    });
    if (!isUndefined(tx)) {
      this.IDBStore = tx.objectStore(this.name);
      tx.addEventListener('complete', () => {
        emitChangeEvents(this.changedRecords, this.db.stores[this.name]);
        this.changedRecords.length = 0;
      });
    }
  }

  get(...keys) {
    return doInStoreTx('readonly', this, (store, resolve, reject) => {
      const gets = keys.map(partial(doGet, store.IDBStore));
      SyncPromise.all(gets).then((records) => {
        if (keys.length === records.length)
          resolve(keys.length == 1 ? records[0] : records);
      }).catch(reject);
    });
  }

  delete(...keys) {
    return doInStoreTx('readwrite', this, (store, resolve, reject) => {
      const deletes = keys.map((key) => {
        return deleteFromStore(store, extractKey(key), 'LOCAL');
      });
      SyncPromise.all(deletes).then(resolve).catch(reject);
    });
  }

  put(...recs) {
    const ops = recs.map((rec) => {
      let newRec;
      if (isUndefined(rec.key)) {
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

module.exports = SDBObjectStore;

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

function extractKey(pk) {
  const k = isObject(pk) ? pk.key : pk;
  if (!isKey(k)) throw new TypeError(k + ' is not a valid key');
  return k;
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

function updateMetaData(store, record) {
  return doGet(store.IDBStore, record.key).then((oldRecord) => {
    record.version = oldRecord.version;
    if (oldRecord.changedSinceSync === 0) {
      record.remoteOriginal = copyWithoutMeta(oldRecord);
    }
  });
}
