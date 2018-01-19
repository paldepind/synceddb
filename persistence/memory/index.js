'use strict';

let nextKey = 0;

function create() {
  return Promise.resolve(new MemoryPersistence());
}

function MemoryPersistence() {
  this.changes = {};
}

MemoryPersistence.prototype.saveChange = function(change) {
  if (change.type === 'create') {
    change.version = 0;
    change.key = nextKey;
    nextKey++;
  } else {
    change.version++;
  }
  change.version = change.type === 'create' ? 0 : change.version + 1;
  if (!this.changes[change.storeName]) {
    this.changes[change.storeName] = [];
  }
  change.timestamp = this.changes[change.storeName].length;
  this.changes[change.storeName].push(change);
  return Promise.resolve(change);
};

MemoryPersistence.prototype.getChanges = function(req) {
  const since = req.since === null ? -1 : req.since;
  const storeChanges = this.changes[req.storeName];
  if (storeChanges) {
    const changes = storeChanges.slice(since + 1);
    return Promise.resolve(changes);
  } else {
    return Promise.resolve([]);
  }
};

MemoryPersistence.prototype.resetChanges = function() {
  this.changes = {};
  return Promise.resolve();
};

exports.create = create;
