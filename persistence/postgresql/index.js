const bluebird = require('bluebird');
const pg = bluebird.promisifyAll(require('pg'));

function getClient(p) {
  return pg.connectAsync(p.conString).spread(function(client, done) {
    client.close = done;
    return client;
  });
}

let nextKey;

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

const processChange = {
  create: function(change, data, client) {
    change.version = 0;
    data.record = change.record;
    change.key = nextKey;
    nextKey++;
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
  let client;
  const data = {};
  return getClient(this).then(function(c) {
    client = c;
    processChange[change.type](change, data, client);
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
  let client;
  const since = req.since === null ? -1 : req.since;
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

pgPersistence.prototype.resetChanges = function(change) {
  let client;
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
  let client;
  const p = new pgPersistence(opts);
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
    return getNewKey(client);
  }).then(function(key) {
    nextKey = key;
    client.close();
    return p;
  });
}

exports.create = create;
