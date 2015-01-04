var WebSocketServer = require('ws').Server;
var wss = new WebSocketServer({port: 8080});

wss.broadcastToOther = function broadcast(ws, data) {
  for(var i in this.clients) {
    if (this.clients[i] !== ws) {
      this.clients[i].send(data);
    }
  }
};

// Persistence hooks

var changes = {};

function saveChange(change) {
  if (!changes[change.storeName]) {
    changes[change.storeName] = [];
  }
  console.log('saving change to', change.storeName);
  change.timestamp = changes[change.storeName].length;
  changes[change.storeName].push(change);
}

function getChanges(req) {
  console.log('get changes from ', req.storeName);
  var since = req.since === null ? -1 : req.since;
  var storeChanges = changes[req.storeName];
  console.log(storeChanges);
  if (storeChanges) {
    console.log('getting store changes');
    return storeChanges.slice(since + 1).filter(function(change) {
      return req.clientId !== change.clientId;
    });
  } else {
    return [];
  }
}

function resetChanges() {
  changes = {};
}

handleCreateMsg = function(ws, msg) {
  msg.record.version = 0;
  var change = {
    type: 'create',
    storeName: msg.storeName,
    record: msg.record,
    clientId: msg.clientId,
  };
  saveChange(change);
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
  saveChange(change);
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
  saveChange(change);
  ws.send(JSON.stringify({
    type: 'ok',
    storeName: msg.storeName,
    key: msg.key,
    newVersion: msg.version + 1,
  }));
  wss.broadcastToOther(ws, JSON.stringify(change));
};

handleResetMsg = function(ws, msg) {
  resetChanges();
  ws.send(JSON.stringify({type: 'reset'}));
};

sendChanges = function(ws, msg) {
  var changesToSend = getChanges(msg);
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
