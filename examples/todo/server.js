var Server = require('../../backend');

// Persistence in memory
//var MemoryPersistence = require('synceddb-persistence-memory');
var memoryPersistence = require('../../persistence/memory');

// Persistence with PostreSQL
//var pgPersistence = require('synceddb-persistence-postgres');
var pgPersistence = require('../../persistence/postgresql');
var pgOpts = {
  conString: 'postgres://postgres@localhost/synceddb',
};

// Persistence with MySQL
//var mysqlPersistence = require('synceddb-persistence-mysql');
var mysqlPersistence = require('../../persistence/mysql');
var mysqlOpts = {
  host: 'localhost',
  user: 'synceddb',
  password: 'mypass',
  database: 'synceddb',
};

// Persistence with CouchDB
//var mysqlPersistence = require('synceddb-persistence-couchdb');
var couchdbPersistence = require('../../persistence/couchdb');
var couchdbOpts = {
  dbUrl: 'http://synceddb:mypass@localhost:5984/synceddb/',
};

memoryPersistence.create().then(function(p) {
//pgPersistence.create(pgOpts).then(function(p) {
//mysqlPersistence.create(mysqlOpts).then(function(p) {
//couchdbPersistence.create(couchdbOpts).then(function(p) {
  var server = new Server({
    port: 8080,
    store: p,
  });
});
