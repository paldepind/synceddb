var extend = require('xtend');
var WebSocketServer = require('ws').Server;

var handleCreateMsg = function(clientData, store, msg, respond, broadcast) {
  var originalKey = msg.key;
  store.saveChange(msg).then(function(change) {
    var newKey = originalKey !== change.key ? change.key : undefined;
    respond({
      type: 'ok',
      storeName: msg.storeName,
      key: originalKey,
      newKey: newKey,
      timestamp: change.timestamp,
      newVersion: change.version,
    });
    broadcast(change);
  });
};

var handleUpdateMsg = function(clientData, store, msg, respond, broadcast) {
  store.saveChange(msg).then(function(change) {
    respond({
      type: 'ok',
      storeName: change.storeName,
      key: msg.key,
      timestamp: change.timestamp,
      newVersion: change.version,
    });
    broadcast(change);
  });
};

var handleDeleteMsg = function(clientData, store, msg, respond, broadcast) {
  store.saveChange(msg).then(function(change) {
    respond({
      type: 'ok',
      storeName: msg.storeName,
      key: msg.key,
      timestamp: change.timestamp,
      newVersion: change.version,
    });
    broadcast(change);
  });
};

var handleResetMsg = function(clientData, store, msg, respond, broadcast) {
  store.resetChanges().then(function() {
    respond({type: 'reset'});
  });
};

var sendChanges = function(clientData, store, msg, respond, broadcast) {
  clientData.changesRequested = true;
  store.getChanges(msg).then(function(changesToSend) {
    respond({
      type: 'sending-changes',
      nrOfRecordsToSync: changesToSend.length,
    });
    changesToSend.forEach(function(change) {
      respond(change);
    });
  });
};

var handleMessageType = {
  create: handleCreateMsg,
  update: handleUpdateMsg,
  delete: handleDeleteMsg,
  reset: handleResetMsg,
  'get-changes': sendChanges,
};

function send(ws, msg) {
  ws.send(JSON.stringify(msg));
}

function broadcast(wss, ws, msg) {
  var string = JSON.stringify(msg);
  wss.clients.forEach(function(client) {
    if (client !== ws && ws.clientData.changesRequested === true) {
      client.send(string);
    }
  });
}

function handleMsgFn(server, ws) {
  var s = send.bind(null, ws);
  var b = broadcast.bind(null, server.wss, ws);
  return function(msg) {
    var data = JSON.parse(msg);
    if (data.type && data.type in server.handlers) {
      server.handlers[data.type](ws.clientData, server.store, data, s, b);
    }
  };
}

function Server(opts) {
  var server = this;
  server.resetHandlers();
  server.store = opts.store;
  server.wss = new WebSocketServer({port: opts.port || 8080});
  server.wss.on('connection', function(ws) {
    ws.clientData = {};
    var handleMsg = handleMsgFn(server, ws);
    handleMsg('{"type":"connect"}');
    ws.on('message', handleMsg);
  });
}

Server.defaultHandlers = handleMessageType;

Server.prototype.resetHandlers = function() {
  this.handlers = extend({}, handleMessageType);
};

Server.prototype.close = function() {
  this.wss.close();
};

module.exports = Server;
