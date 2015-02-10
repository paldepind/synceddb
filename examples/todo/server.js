var Server = require('../../backend');

// Persistence in memory
//var MemoryPersistence = require('synceddb-persistence-memory');
var MemoryPersistence = require('../../persistence/memory');

// Persistence with PostreSQL
//var pgPersistence = require('synceddb-persistence-postgres');
var pgPersistence = require('../../persistence/postgresql');

// Persistence with MySQL
//var pgPersistence = require('synceddb-persistence-mysql');
var mysqlPersistence = require('../../persistence/mysql');

var server = new Server({
  port: 8080,
  //store: new pgPersistence({
    //conString: 'postgres://postgres@localhost/synceddb',
  //}),
  //store: new mysqlPersistence({
    //host: 'localhost',
    //user: 'synceddb',
    //password: 'mypass',
    //database: 'synceddb',
  //}),
  store: new MemoryPersistence(),
});
