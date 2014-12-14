var WebSocketServer = require('ws').Server;
var wss = new WebSocketServer({port: 8080});

var changes = [];

handleCreateMsg = function(ws, msg) {
  msg.record.version = 0;
  changes.push({
    type: 'create',
    storeName: msg.storeName,
    record: msg.record,
    clientId: msg.clientId,
    timestamp: changes.length,
  });
  ws.send(JSON.stringify({
    type: 'ok',
    storeName: msg.storeName,
    key: msg.record.key,
  }));
};

sendChanges = function(ws, msg) {
  console.log('changes requested');
  var changesToSend = changes.slice(msg.since + 1);
  ws.send(JSON.stringify({
    type: 'sending-changes',
    nrOfRecordsToSync: changesToSend.length,
  }));
  changesToSend.forEach(function(change) {
    if (msg.clientId !== change.clientId) {
      ws.send(JSON.stringify(change));
    }
  });
};

var handleMessageType = {
  create: handleCreateMsg,
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
