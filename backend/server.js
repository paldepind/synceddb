'use strict';
const blacklist = require('blacklist');
const WebSocketServer = require('ws').Server;

const handleMessageType = {
  create: handleCreateMsg,
  update: handleUpdateMsg,
  delete: handleDeleteMsg,
  reset: handleResetMsg,
  'get-changes': sendChanges,
};

class Server {
  constructor(opts) {
    this.resetHandlers();
    this.store = opts.store;
    const wssArg = blacklist(opts, 'store');
    if (!wssArg.server && !wssArg.port) wssArg.port = 8080;
    this.wss = new WebSocketServer(wssArg);
    this.wss.on('connection', (ws) => {
      ws.clientData = {};
      const handleMsg = this.handleMsgFn(ws);
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

  handleMsgFn(ws) {
    const s = send.bind(null, ws);
    const b = broadcast.bind(null, this.wss, ws);
    return (msg) => {
      const data = JSON.parse(msg);
      if (data.type && data.type in this.handlers) {
        this.handlers[data.type](ws.clientData, this.store, data, s, b, ws.upgradeReq);
      }
    };
  }
}

Server.defaultHandlers = handleMessageType;

module.exports = Server;

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

function handleCreateMsg(clientData, store, msg, respond, broadcast) {
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
}

function handleUpdateMsg(clientData, store, msg, respond, broadcast) {
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
}

function handleDeleteMsg(clientData, store, msg, respond, broadcast) {
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
}

function handleResetMsg(clientData, store, msg, respond, broadcast) {
  store.resetChanges().then(() => {
    respond({type: 'reset'});
  });
}

function sendChanges(clientData, store, msg, respond, broadcast) {
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
}
