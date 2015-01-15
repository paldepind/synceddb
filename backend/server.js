var WebSocketServer = require('ws').Server;
var wss = new WebSocketServer({port: 8080});

var MemoryPersistence = require('./persistence/memory');

wss.broadcastToOther = function broadcast(ws, data) {
  for(var i in this.clients) {
    if (this.clients[i] !== ws) {
      this.clients[i].send(data);
    }
  }
};

var persistence = new MemoryPersistence();

handleCreateMsg = function(ws, msg) {
  msg.record.version = 0;
  var change = {
    type: 'create',
    storeName: msg.storeName,
    record: msg.record,
    key: msg.record.key,
    clientId: msg.clientId,
  };
  persistence.saveChange(change);
  ws.send(JSON.stringify({
    type: 'ok',
    storeName: msg.storeName,
    key: msg.record.key,
    newVersion: msg.record.key,
  }));
  wss.broadcastToOther(ws, JSON.stringify(change));
};

handleUpdateMsg = function(ws, msg) {
  var change = {
    type: 'update',
    storeName: msg.storeName,
    clientId: msg.clientId,
    diff: msg.diff,
    key: msg.key,
    version: msg.version + 1,
  };
  persistence.saveChange(change);
  ws.send(JSON.stringify({
    type: 'ok',
    storeName: msg.storeName,
    key: msg.key,
    newVersion: msg.version + 1,
  }));
  wss.broadcastToOther(ws, JSON.stringify(change));
};

handleDeleteMsg = function(ws, msg) {
  var change = {
    type: 'delete',
    storeName: msg.storeName,
    clientId: msg.clientId,
    key: msg.key,
    version: msg.version + 1,
  };
  persistence.saveChange(change);
  ws.send(JSON.stringify({
    type: 'ok',
    storeName: msg.storeName,
    key: msg.key,
    newVersion: msg.version + 1,
  }));
  wss.broadcastToOther(ws, JSON.stringify(change));
};

handleResetMsg = function(ws, msg) {
  persistence.resetChanges();
  ws.send(JSON.stringify({type: 'reset'}));
};

sendChanges = function(ws, msg) {
  var changesToSend = persistence.getChanges(msg);
  ws.send(JSON.stringify({
    type: 'sending-changes',
    nrOfRecordsToSync: changesToSend.length,
  }));
  changesToSend.forEach(function(change) {
    ws.send(JSON.stringify(change));
  });
};

var handleMessageType = {
  create: handleCreateMsg,
  update: handleUpdateMsg,
  delete: handleDeleteMsg,
  reset: handleResetMsg,
  'get-changes': sendChanges,
};

wss.on('connection', function(ws) {
  ws.on('message', function(msg) {
    console.log(msg);
    var data = JSON.parse(msg);
    if (data.type && data.type in handleMessageType) {
      handleMessageType[data.type](ws, data);
    }
  });
});
