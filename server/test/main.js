var WebSocket = require('ws');
var assert = require('assert');

function socketConversation(ws, funcs) {
  var r = funcs[0]();
  if (r) ws.send(JSON.stringify(r));
  var next = 1;
  ws.onmessage = function(msg) {
    var r = funcs[next++](JSON.parse(msg.data));
    if (r) ws.send(JSON.stringify(r));
  };
}

describe('Backend', function() {
  var ws;
  beforeEach(function() {
    ws = new WebSocket('ws://localhost:8080');
  });
  afterEach(function(done) {
    ws.send(JSON.stringify({type: 'reset'}));
    ws.onmessage = function() {
      ws.close();
      done();
    };
  });
  it('get zero changes initially', function(done) {
    ws.onmessage = function(msg) {
      var data = JSON.parse(msg.data);
      assert.equal(data.type, 'sending-changes');
      assert.equal(data.nrOfRecordsToSync, 0);
      done();
    };
    ws.onopen = function() {
      ws.send(JSON.stringify({
        type: 'get-changes',
        since: null,
        storeName: 'animals',
        clientId: 'foo',
      }));
    };
  });
  it('sends created records on request', function(done) {
    var data1, data2;
    ws.onopen = function() {
      socketConversation(ws, [
        function() {
          return {
            type: 'create',
            storeName: 'animals',
            clientId: 'foo',
            record: {name: 'Stampe', key: 1},
          };
        },
        function(data) {
          data1 = data;
          return {
            type: 'create',
            storeName: 'animals',
            clientId: 'foo',
            record: {name: 'Thumper', key: 2},
          };
        },
        function(data) {
          data2 = data;
          assert.notEqual(data1.newVersion, data2.newVersion);
          return {
            type: 'get-changes',
            since: null,
            storeName: 'animals',
            clientId: 'otherfoo',
          };
        },
        function(data) {
          console.log(data);
          assert.equal(data.nrOfRecordsToSync, 2);
        },
        function(data) {
          assert.equal(data.record.name, 'Stampe');
        },
        function(data) {
          assert.equal(data.record.name, 'Thumper');
          done();
        }
      ]);
    };
  });
  it('only sends changes after timestamp', function(done) {
    var firstTimestamp;
    ws.onopen = function() {
      socketConversation(ws, [
        function() {
          return {
            type: 'create',
            storeName: 'animals',
            clientId: 'foo',
            record: {name: 'Stampe', key: 1},
          };
        },
        function(data) {
          assert.equal(data.type, 'ok');
          return {
            type: 'get-changes',
            since: null,
            storeName: 'animals',
            clientId: 'otherfoo',
          };
        },
        function(data) {
          assert.equal(data.nrOfRecordsToSync, 1);
        },
        function(data) {
          assert.equal(data.record.name, 'Stampe');
          firstTimestamp = data.timestamp;
          assert.equal(data.record.name, 'Stampe');
          return {
            type: 'create',
            storeName: 'animals',
            clientId: 'foo',
            record: {name: 'Smask', key: 2},
          };
        },
        function(data) {
          assert.equal(data.type, 'ok');
          return {
            type: 'get-changes',
            since: firstTimestamp,
            storeName: 'animals',
            clientId: 'otherfoo',
          };
        },
        function(data) {
          assert.equal(data.nrOfRecordsToSync, 1);
        },
        function(data) {
          assert.equal(data.record.name, 'Smask');
          done();
        }
      ]);
    };
  });
  it('only sends changes from requested store', function(done) {
    ws.onopen = function() {
      socketConversation(ws, [
        function() {
          return {
            type: 'create',
            storeName: 'animals',
            clientId: 'foo',
            record: {name: 'Stampe', key: 1},
          };
        },
        function(data) {
          data1 = data;
          return {
            type: 'create',
            storeName: 'roads',
            clientId: 'foo',
            record: {length: 100, key: 2},
          };
        },
        function(data) {
          return {
            type: 'get-changes',
            since: null,
            storeName: 'roads',
            clientId: 'otherfoo',
          };
        },
        function(data) {
          assert.equal(data.nrOfRecordsToSync, 1);
        },
        function(data) {
          assert.equal(data.record.length, 100);
          return {
            type: 'get-changes',
            since: null,
            storeName: 'animals',
            clientId: 'otherfoo',
          };
        },
        function(data) {
          assert.equal(data.nrOfRecordsToSync, 1);
        },
        function(data) {
          assert.equal(data.record.name, 'Stampe');
          done();
        },
      ]);
    };
  });
});
