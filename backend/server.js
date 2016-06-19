'use strict';
const WebSocketServer = require('ws').Server;

const handleCreateMsg = (clientData, store, msg, respond, broadcast) => {
  const originalKey = msg.key;
  store.saveChange(msg).then((change) => {
    const newKey = originalKey !== change.key ? change.key : undefined;
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

const handleUpdateMsg = (clientData, store, msg, respond, broadcast) => {
  store.saveChange(msg).then((change) => {
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

const handleDeleteMsg = (clientData, store, msg, respond, broadcast) => {
  store.saveChange(msg).then((change) => {
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

const handleResetMsg = (clientData, store, msg, respond, broadcast) => {
  store.resetChanges().then(() => {
    respond({type: 'reset'});
  });
};

const sendChanges = (clientData, store, msg, respond, broadcast) => {
  clientData.changesRequested = true;
  store.getChanges(msg).then((changesToSend) => {
    respond({
      type: 'sending-changes',
      nrOfRecordsToSync: changesToSend.length,
    });
    changesToSend.forEach((change) => {
      respond(change);
    });
  });
};

const handleMessageType = {
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
  const string = JSON.stringify(msg);
  wss.clients.forEach((client) => {
    if (client !== ws && ws.clientData.changesRequested === true) {
      client.send(string);
    }
  });
}

function handleMsgFn(server, ws) {
  const s = send.bind(null, ws);
  const b = broadcast.bind(null, server.wss, ws);
  return (msg) => {
    const data = JSON.parse(msg);
    if (data.type && data.type in server.handlers) {
      server.handlers[data.type](ws.clientData, server.store, data, s, b, ws.upgradeReq);
    }
  };
}

class Server {
  constructor(opts) {
    this.resetHandlers();
    this.store = opts.store;
    if (opts.server) {
      this.wss = new WebSocketServer({server: opts.server});
    }
    else {
      this.wss = new WebSocketServer({port: opts.port || 8080});
    }
    this.wss.on('connection', (ws) => {
      ws.clientData = {};
      const handleMsg = handleMsgFn(this, ws);
      handleMsg('{"type":"connect"}');
      ws.on('message', handleMsg);
    });
  }

  resetHandlers() {
    this.handlers = Object.assign({}, handleMessageType);
  }

  close() {
    this.wss.close();
  }
}

Server.defaultHandlers = handleMessageType;

module.exports = Server;
