var extend = require('xtend');
var WebSocketServer = require('ws').Server;

var handleCreateMsg = function(msg, store, respond, broadcast) {
  msg.record.version = 0;
  var change = {
    type: 'create',
    storeName: msg.storeName,
    record: msg.record,
    key: msg.record.key,
    clientId: msg.clientId,
  };
  store.saveChange(change);
  respond({
    type: 'ok',
    storeName: msg.storeName,
    key: msg.record.key,
    newVersion: msg.record.key,
  });
  broadcast(change);
};

var handleUpdateMsg = function(msg, store, respond, broadcast) {
  var change = {
    type: 'update',
    storeName: msg.storeName,
    clientId: msg.clientId,
    diff: msg.diff,
    key: msg.key,
    version: msg.version + 1,
  };
  store.saveChange(change);
  respond({
    type: 'ok',
    storeName: msg.storeName,
    key: msg.key,
    newVersion: msg.version + 1,
  });
  broadcast(change);
};

var handleDeleteMsg = function(msg, store, respond, broadcast) {
  var change = {
    type: 'delete',
    storeName: msg.storeName,
    clientId: msg.clientId,
    key: msg.key,
    version: msg.version + 1,
  };
  store.saveChange(change);
  respond({
    type: 'ok',
    storeName: msg.storeName,
    key: msg.key,
    newVersion: msg.version + 1,
  });
  broadcast(change);
};

var handleResetMsg = function(msg, store, respond, broadcast) {
  store.resetChanges();
  respond({type: 'reset'});
};

var sendChanges = function(msg, store, respond, broadcast) {
  var changesToSend = store.getChanges(msg);
  respond({
    type: 'sending-changes',
    nrOfRecordsToSync: changesToSend.length,
  });
  changesToSend.forEach(function(change) {
    respond(change);
  });
  return {};
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
  for(var i in wss.clients) {
    if (wss.clients[i] !== ws) {
      wss.clients[i].send(string);
    }
  }
}

function Server(opts) {
  var server = this;
  server.resetHandlers();
  server.wss = new WebSocketServer({port: opts.port || 8080});
  server.wss.on('connection', function(ws) {
    ws.on('message', function(msg) {
      var data = JSON.parse(msg);
      if (data.type && data.type in server.handlers) {
        var s = send.bind(null, ws);
        var b = broadcast.bind(null, server.wss, ws);
        var result = server.handlers[data.type](data, opts.store, s, b);
      }
    });
  });
}

Server.defaultHandlers = handleMessageType;

Server.prototype.resetHandlers = function() {
  this.handlers = extend({}, handleMessageType);
};

Server.prototype.close = function() {
  this.wss.close();
};

exports.Server = Server;
