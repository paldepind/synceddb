const {isString, isObject} = require('underscore');
const Events = require('minivents');

class WrappedSocket {
  constructor(url, protocol) {
    Events(this);
    const ws = this.ws = new WebSocket(url, protocol);
    ws.onopen = () => {
      this.emit('open');
    };
    ws.onerror = (error) => {
      this.emit('error', error);
    };
    ws.onclose = (e) => {
      this.emit('close', e);
    };
    ws.onmessage = (msg) => {
      let data;
      if (isString(msg.data)) {
        data = JSON.parse(msg.data);
      } else {
        data = msg.data;
      }
      this.emit('message', data);
    };
  }
  send(msg) {
    if (isObject(msg)) {
      this.ws.send(JSON.stringify(msg));
    } else {
      this.ws.send(msg);
    }
  }
  close() {
    this.ws.close.apply(this.ws, arguments);
  }
}

module.exports = WrappedSocket;
