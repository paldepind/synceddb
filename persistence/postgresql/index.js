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
      '(timestamp serial, key INTEGER NOT NULL, storename TEXT NOT NULL, data JSON NOT NULL)'
    );
  }).then(function() {
    client.close();
  });
}

pgPersistence.prototype.saveChange = function(change) {
  var client, newKey;
  return getClient(this).then(function(c) {
    client = c;
    if (change.type === 'create') {
      change.version = 0;
      return getNewKey(client);
    } else {
      change.version++;
      return undefined;
    }
  }).then(function(nK) {
    newKey = nK;
    if (newKey !== undefined) {
      change.record.key = newKey;
      change.key = newKey;
    }
    change.version = 0;
    console.log(change);
    return client.queryAsync(
      'INSERT INTO synceddb_changes (key, storename, data)' +
      'VALUES ($1, $2, $3) RETURNING timestamp',
      [change.key, change.storeName, change]
    );
  }).then(function(res) {
    client.close();
    change.timestamp = res.rows[0].timestamp;
    return change;
  });
};

pgPersistence.prototype.getChanges = function(req) {
  var client;
  var since = req.since === null ? -1 : req.since;
  return getClient(this).then(function(c) {
    client = c;
    return client.queryAsync(
      'SELECT * FROM synceddb_changes WHERE storename = $1 AND timestamp > $2',
      [req.storeName, since]
    );
  }).then(function(result) {
    client.close();
    return result.rows.map(function(r) {
      r.data.timestamp = r.timestamp;
      return r.data;
    });
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
