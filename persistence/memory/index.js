var Promise = require('bluebird');

function MemoryPersistence() {
  this.changes = {};
}

MemoryPersistence.prototype.saveChange = function(change) {
  change.version = change.type === 'create' ? 0 : change.version + 1;
  if (!this.changes[change.storeName]) {
    this.changes[change.storeName] = [];
  }
  change.timestamp = this.changes[change.storeName].length;
  this.changes[change.storeName].push(change);
  return Promise.resolve(change);
};

MemoryPersistence.prototype.getChanges = function(req) {
  var since = req.since === null ? -1 : req.since;
  var storeChanges = this.changes[req.storeName];
  if (storeChanges) {
    var changes = storeChanges.slice(since + 1);
    return Promise.resolve(changes);
  } else {
    return Promise.resolve([]);
  }
};

MemoryPersistence.prototype.getChangesToRecord = function(storeName, key) {
  return store[storeName].filter(function(change) {
    return change.key === key;
  });
};

MemoryPersistence.prototype.resetChanges = function() {
  this.changes = {};
  return Promise.resolve();
};

module.exports = MemoryPersistence;
