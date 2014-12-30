var WebSocket = require('ws');
var assert = require('assert');

describe('Backend', function() {
  var ws;
  beforeEach(function() {
    ws = new WebSocket('ws://localhost:8080');
  });
  afterEach(function() {
    ws.close();
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
        since: -1,
        storeNames: 'animals',
        clientId: 'foo',
      }));
    };
  });
  it('receives sent changes on request', function(done) {
    var data1, data2;
    ws.onopen = function() {
      ws.send(JSON.stringify({
        type: 'create',
        storeName: 'animals',
        clientId: 'foo',
        record: {name: 'Stampe', key: 1},
      }));
      ws.onmessage = getFirstOk;
    };
    function getFirstOk(msg) {
      data1 = JSON.parse(msg.data);
      ws.send(JSON.stringify({
        type: 'create',
        storeName: 'animals',
        clientId: 'foo',
        record: {name: 'Smask', key: 2},
      }));
      ws.onmessage = getSecondOk;
    }
    function getSecondOk(msg) {
      data2 = JSON.parse(msg.data);
      assert.notEqual(data1.newVersion, data2.newVersion);
      done();
    }
  });
});
