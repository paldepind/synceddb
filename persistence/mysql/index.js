'use strict';

const mysql = require('mysql');
const bluebird = require('bluebird');
bluebird.promisifyAll(mysql);
bluebird.promisifyAll(require('mysql/lib/Connection').prototype);
bluebird.promisifyAll(require('mysql/lib/Pool').prototype);

let nextKey;

function getNewKey(con) {
  return con.queryAsync(
    'SELECT MAX(`key`) AS `max` FROM synceddb_changes'
  ).spread(function(res) {
    return (res[0].max !== null) ? res[0].max + 1 : 0;
  });
}

function create(opts) {
  const p = new mysqlPersistence(opts);
  return p.connection.queryAsync(
    'CREATE TABLE IF NOT EXISTS `synceddb_changes` ' +
    '(`timestamp` INT NOT NULL AUTO_INCREMENT PRIMARY KEY, ' +
    '`key` INT NOT NULL, ' +
    '`version` INT NOT NULL, ' +
    '`storename` VARCHAR(255) NOT NULL, ' +
    '`type` ENUM("create", "update", "delete") NOT NULL, ' +
    '`data` TEXT NOT NULL)'
  ).then(function() {
    return getNewKey(p.connection);
  }).then(function(key) {
    nextKey = key;
    return p;
  });
}

function mysqlPersistence(opts) {
  this.connection = mysql.createConnection(opts);
  this.connection.connect();
}

const processChange = {
  create: function(change, data, con) {
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

mysqlPersistence.prototype.saveChange = function(change) {
  const data = {};
  const con = this.connection;
  processChange[change.type](change, data, con);
  const dataStr = JSON.stringify(data);
  return con.queryAsync(
    'INSERT INTO synceddb_changes (`key`, version, storename, type, data) ' +
    'VALUES (?, ?, ?, ?, ?)',
    [change.key, change.version, change.storeName, change.type, dataStr]
  ).then(function(res) {
    change.timestamp = res[0].insertId;
    return change;
  });
};

mysqlPersistence.prototype.getChanges = function(req) {
  const con = this.connection;
  const since = req.since === null ? -1 : req.since;
  return con.queryAsync(
    'SELECT * FROM synceddb_changes WHERE storename = ? AND timestamp > ?',
    [req.storeName, since]
  ).spread(function(res) {
    return res.map(function(r) {
      r.data = JSON.parse(r.data);
      r.data.key = r.key;
      r.data.timestamp = r.timestamp;
      r.data.storeName = r.storename;
      r.data.type = r.type;
      r.data.version = r.version;
      return r.data;
    });
  });
};

mysqlPersistence.prototype.resetChanges = function(change) {
  const con = this.connection;
  return con.queryAsync('DELETE FROM synceddb_changes').then(function() {
    nextKey = 0;
    return con.queryAsync('ALTER TABLE synceddb_changes AUTO_INCREMENT = 1');
  });
};

exports.create = create;
