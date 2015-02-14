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
  this.conString = opts.conString;
}

var processChange = {
  create: function(change, data, client) {
    change.version = 0;
    data.record = change.record;
    return getNewKey(client).then(function(nK) {
      change.key = nK;
    });
  },
  update: function(change, data) {
    data.diff = change.diff;
    change.version++;
  },
  delete: function(change, data) {
    change.version++;
  },
};

pgPersistence.prototype.saveChange = function(change) {
  var client;
  var data = {};
  return getClient(this).then(function(c) {
    client = c;
    return processChange[change.type](change, data, client);
  }).then(function() {
    return client.queryAsync(
      'INSERT INTO synceddb_changes (key, version, storename, type, data)' +
      'VALUES ($1, $2, $3, $4, $5) RETURNING timestamp',
      [change.key, change.version, change.storeName, change.type, data]
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
      'SELECT * FROM synceddb_changes ' +
      'WHERE storename = $1 AND timestamp > $2 ORDER BY timestamp',
      [req.storeName, since]
    );
  }).then(function(result) {
    client.close();
    return result.rows.map(function(r) {
      r.data.key = r.key;
      r.data.timestamp = r.timestamp;
      r.data.storeName = r.storename;
      r.data.type = r.type;
      r.data.version = r.version;
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

function create(opts) {
  var p = new pgPersistence(opts), client;
  return getClient(p).then(function(c) {
    client = c;
    return client.queryAsync(
      'CREATE TABLE IF NOT EXISTS synceddb_changes' +
      '(timestamp serial, ' +
      'key INTEGER NOT NULL, ' +
      'version INTEGER NOT NULL, ' +
      'storename TEXT NOT NULL, ' +
      'type TEXT NOT NULL,' +
      'data JSON NOT NULL)'
    );
  }).then(function() {
    client.close();
    return p;
  });
}

exports.create = create;
