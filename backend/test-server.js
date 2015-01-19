var Server = require('./server').Server;
var MemoryPersistence = require('./persistence/memory');

var server = new Server({
  port: 8080,
  store: new MemoryPersistence(),
});
