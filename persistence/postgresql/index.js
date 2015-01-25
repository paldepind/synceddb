var Promise = require('bluebird');
var pg = Promise.promisifyAll(require('pg'));

getClient = function(p) {
  return pg.connectAsync(p.conString).spread(function(client, done) {
    client.close = done;
    return client;
  });
};

function pgPersistence(opts) {
  this.conString = opts.conString;
  getClient(this).then(function(client) {
    client.queryAsync(
      'CREATE TABLE IF NOT EXISTS synceddb_changes' +
      '(timestamp serial, key integer, storename text, clientid integer, data json)'
    );
  });
}

pgPersistence.prototype.saveChange = function(change) {
  return getClient(this).then(function(client) {
    return client.queryAsync(
      'INSERT INTO synceddb_changes (key, storename, clientid, data) VALUES ($1, $2, $3, $4)',
      [change.record.key, change.storeName, change.clientId, change]
    );
  });
};

pgPersistence.prototype.getChanges = function(req) {
  var since = req.since === null ? -1 : req.since;
  return getClient(this).then(function(client) {
    return client.queryAsync(
      'SELECT * FROM synceddb_changes WHERE storename = $1 AND timestamp > $2 AND clientid <> $3',
      [req.storeName, since, req.clientId]
    );
  }).then(function(result) {
    return result.rows;
  });
};

pgPersistence.prototype.getChangesToRecord = function(change) {
};

pgPersistence.prototype.resetChanges = function(change) {
  var client;
  return getClient(this).then(function(c) {
    client = c;
    return client.queryAsync('DELETE FROM synceddb_changes');
  }).then(function() {
    return client.queryAsync('ALTER SEQUENCE synceddb_changes_timestamp_seq RESTART WITH 1');
  }).then(function() {
    client.close();
  });
};

module.exports = pgPersistence;
