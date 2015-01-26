var Promise = require('bluebird');
var pg = Promise.promisifyAll(require('pg'));

function getClient(p) {
  return pg.connectAsync(p.conString).spread(function(client, done) {
    client.close = done;
    return client;
  });
}

function getNewKey(client) {
  return client.queryAsync(
    'SELECT max(key) FROM synceddb_changes'
  ).then(function(res) {
    return (res.rows[0].max !== null) ? res.rows[0].max + 1 : 0;
  });
}

function pgPersistence(opts) {
  var client;
  this.conString = opts.conString;
  getClient(this).then(function(c) {
    client = c;
    return client.queryAsync(
      'CREATE TABLE IF NOT EXISTS synceddb_changes' +
      '(timestamp serial, key integer, storename text, clientid text, data json)'
    );
  }).then(function() {
    client.close();
  });
}

pgPersistence.prototype.saveChange = function(change) {
  var client, newKey;
  return getClient(this).then(function(c) {
    client = c;
    return (change.type === 'create') ? getNewKey(client) : undefined;
  }).then(function(nK) {
    newKey = nK;
    if (newKey !== undefined) {
      change.record.key = newKey;
      change.key = newKey;
    }
    return client.queryAsync(
      'INSERT INTO synceddb_changes (key, storename, clientid, data) VALUES ($1, $2, $3, $4)',
      [change.key, change.storeName, change.clientId, change]
    );
  }).then(function() {
    client.close();
    return {newKey: newKey};
  });
};

pgPersistence.prototype.getChanges = function(req) {
  var client;
  var since = req.since === null ? -1 : req.since;
  return getClient(this).then(function(c) {
    client = c;
    return client.queryAsync(
      'SELECT * FROM synceddb_changes WHERE storename = $1 AND timestamp > $2 AND clientid <> $3',
      [req.storeName, since, req.clientId]
    );
  }).then(function(result) {
    client.close();
    return result.rows.map(function(r) { return r.data; });
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
