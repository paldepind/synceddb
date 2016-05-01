const {doInStoreTx, doIndexGet, createKeyRange} = require('./utils');

class SDBIndex {
  constructor(name, db, store) {
    this.name = name;
    this.db = db;
    this.store = store;
  }

  get(...ranges) {
    ranges = ranges.map(IDBKeyRange.only);
    return doInStoreTx('readonly', this.store, (store, resolve, reject) => {
      return doIndexGet(this.name, ranges, store.IDBStore, resolve, reject);
    });
  }

  getAll() {
    return doInStoreTx('readonly', this.store, (store, resolve, reject) => {
      return doIndexGet(this.name, [undefined], store.IDBStore, resolve, reject);
    });
  }

  inRange(...ranges) {
    ranges = ranges.map(createKeyRange);
    return doInStoreTx('readonly', this.store, (store, resolve, reject) => {
      return doIndexGet(this.name, ranges, store.IDBStore, resolve, reject);
    });
  }
}

module.exports = SDBIndex;
