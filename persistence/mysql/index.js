var mysql = require('mysql');
var Promise = require('bluebird');
Promise.promisifyAll(mysql);
Promise.promisifyAll(require('mysql/lib/Connection').prototype);
Promise.promisifyAll(require('mysql/lib/Pool').prototype);

function getNewKey(con) {
  return con.queryAsync(
    'SELECT MAX(`key`) AS `max` FROM synceddb_changes'
  ).spread(function(res) {
    return (res[0].max !== null) ? res[0].max + 1 : 0;
  });
}

function mysqlPersistence(opts) {
  this.connection = mysql.createConnection(opts);
  this.connection.connect();
  this.connection.queryAsync(
    'CREATE TABLE IF NOT EXISTS `synceddb_changes` ' +
    '(`timestamp` INT NOT NULL AUTO_INCREMENT PRIMARY KEY, ' +
    '`key` INT NOT NULL, ' +
    '`storename` VARCHAR(255) NOT NULL, ' +
    '`data` TEXT NOT NULL)'
  );
}

function processChange(con, change) {
  if (change.type === 'create') {
    change.version = 0;
    return getNewKey(con).then(function(newKey) {
      change.record.key = newKey;
      change.key = newKey;
      return change;
    });
  } else {
    change.version++;
    return Promise.resolve(change);
  }
}

mysqlPersistence.prototype.saveChange = function(change) {
  var con = this.connection;
  var newKey;
  return processChange(con, change).then(function(change) {
    var changeStr = JSON.stringify(change);
    return con.queryAsync(
      'INSERT INTO synceddb_changes (`key`, `storename`, `data`) ' +
      'VALUES (?, ?, ?)',
      [change.key, change.storeName, changeStr]
    );
  }).then(function(res) {
    change.timestamp = res[0].insertId;
    return change;
  });
};

mysqlPersistence.prototype.getChanges = function(req) {
  var con = this.connection;
  var since = req.since === null ? -1 : req.since;
  return con.queryAsync(
    'SELECT * FROM synceddb_changes WHERE storename = ? AND timestamp > ?',
    [req.storeName, since]
  ).spread(function(res) {
    return res.map(function(r) {
      r.data = JSON.parse(r.data);
      r.data.timestamp = r.timestamp;
      return r.data;
    });
  });
};

mysqlPersistence.prototype.getChangesToRecord = function(change) {
};

mysqlPersistence.prototype.resetChanges = function(change) {
  var con = this.connection;
  return con.queryAsync('DELETE FROM synceddb_changes').then(function() {
    return con.queryAsync('ALTER TABLE synceddb_changes AUTO_INCREMENT = 1');
  });
};

module.exports = mysqlPersistence;
