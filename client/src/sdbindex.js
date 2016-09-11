const {doInStoreTx, doIndexGet, createQuery} = require('./utils');

class SDBIndex {
  constructor(name, db, store) {
    this.name = name;
    this.db = db;
    this.store = store;
  }

  get(...ids) {
    const queries = ids.map((id) => ({range: IDBKeyRange.only(id)}));
    return doInStoreTx('readonly', this.store, (store, resolve, reject) => {
      return doIndexGet(this.name, queries, store.IDBStore, resolve, reject);
    });
  }

  getAll() {
    return doInStoreTx('readonly', this.store, (store, resolve, reject) => {
      return doIndexGet(this.name, [{}], store.IDBStore, resolve, reject);
    });
  }

  inRange(...queries) {
    queries = queries.map(createQuery);
    return doInStoreTx('readonly', this.store, (store, resolve, reject) => {
      return doIndexGet(this.name, queries, store.IDBStore, resolve, reject);
    });
  }
}

module.exports = SDBIndex;
