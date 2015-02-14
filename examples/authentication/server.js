var Server = require('../../backend');

// Persistence in memory
var MemoryPersistence = require('../../persistence/memory');

MemoryPersistence.create().then(function(p) {
  var server = new Server({
    port: 8080,
    store: p,
  });

  server.handlers.connect = function(clientData, store, msg, send, broadcast) {
    console.log('Connection established');
    setTimeout(function() {
      if (!clientData.authenticated) {
        console.log('Client didn\'t authenticate in 5 seconds :(');
      } else {
        console.log('Client was authenticated within 5 seconds :)');
      }
    }, 5000);
  };

  server.handlers.create = function(clientData, store, msg, send, broadcast) {
    if (clientData.privileges !== 'readwrite') {
      send({
        type: 'reject',
        storeName: msg.storeName,
        key: msg.key,
        description: 'You do not have privileges to create records',
      });
    } else {
      Server.defaultHandlers.create.apply(undefined, arguments);
    }
  };

  server.handlers['get-changes'] = function(clientData, store, msg, send, broadcast) {
    if (clientData.privileges === 'readwrite' ||
        clientData.privileges === 'readonly') {
      Server.defaultHandlers['get-changes'].apply(undefined, arguments);
    } else {
      send({
        type: 'unauthorized',
        requestedStore: msg.storeName,
        description: 'You do not have privileges to read records',
      });
    }
  };

  server.handlers.authenticate = function(clientData, store, msg, send, broadcast) {
    console.log('Authentication message recieved');
    var res = {type: 'auth-response'};
    if (msg.token === 'token1') {
      clientData.authenticated = res.success = true;
      clientData.privileges = 'readonly';
    } else if (msg.token === 'token2') {
      clientData.authenticated = res.success = true;
      clientData.privileges = 'readwrite';
    } else {
      res.success = false;
    }
    send(res);
  };
});
