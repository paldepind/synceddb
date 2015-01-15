
function MemoryPersistence() {
  this.changes = {};
}

MemoryPersistence.prototype.saveChange = function(change) {
  if (!this.changes[change.storeName]) {
    this.changes[change.storeName] = [];
  }
  console.log('saving change to', change.storeName);
  change.timestamp = this.changes[change.storeName].length;
  this.changes[change.storeName].push(change);
};

MemoryPersistence.prototype.getChanges = function(req) {
  console.log('get changes from ', req.storeName);
  var since = req.since === null ? -1 : req.since;
  var storeChanges = this.changes[req.storeName];
  console.log(storeChanges);
  if (storeChanges) {
    console.log('getting store changes');
    return storeChanges.slice(since + 1).filter(function(change) {
      return req.clientId !== change.clientId;
    });
  } else {
    return [];
  }
};

MemoryPersistence.prototype.getChangesToRecord = function(storeName, key) {
  return store[storeName].filte(function(change) {
    return change.key === key;
  });
};

MemoryPersistence.prototype.resetChanges = function() {
  this.changes = {};
};

module.exports = MemoryPersistence;
