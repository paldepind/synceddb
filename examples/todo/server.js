var Server = require('../../backend').Server;

// Persistence in memory
var MemoryPersistence = require('synceddb-persistence-memory');

var server = new Server({
  port: 8080,
  store: new MemoryPersistence(),
});

/* Persistence with PostreSQL
var pgPersistence = require('../../persistence/postgresql');

var server = new Server({
  port: 8080,
  store: new pgPersistence({
    conString: 'postgres://postgres@localhost/synceddb',
  }),
});
*/
