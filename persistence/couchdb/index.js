var Promise = require('bluebird');
var request = Promise.promisify(require('request'));

function saveDocument(dbUrl, doc) {
  var method = doc._id ? 'PUT' : 'POST';
  var url = dbUrl + (doc._id ? doc._id : '');
  return request({
    url: url,
    method: method,
    json: doc,
  }).spread(function(res, body) {
    console.log(body);
  });
}

function doCreateDb(dbUrl) {
  return request({
    url: dbUrl,
    method: 'PUT',
  }).then(function() {
    saveDocument(dbUrl, {
      _id: '_design/synceddb',
      language: 'javascript',
      views: {
        changes: {
          map: 'function(d) { if (d.docType === "change") emit([d.storeName, d.timestamp], d) }'
        }
      }
    });
  });
}

function createDb(dbUrl) {
  return request({
    url: dbUrl,
    json: true,
  }).spread(function(res, body) {
    if (res.statusCode === 404 && body.reason === 'no_db_file') {
      return doCreateDb(dbUrl);
    }
  });
}

function getStoreMetaDoc(dbUrl, storeName) {
  return request({
    url: dbUrl + storeName,
    method: 'GET',
    json: true,
  }).spread(function(res, body) {
    if (res.statusCode === 404 && body.reason === 'missing') {
      return {
        '_id': storeName,
        docType: 'storeMeta',
        timestamp: 0,
        nextKey: 0
      };
    } else {
      return body;
    }
  });
}

function couchdbPersistence(opts) {
  this.dbUrl = opts.dbUrl;
}

couchdbPersistence.prototype.saveChange = function(change) {
  var dbUrl = this.dbUrl, storeMeta;
  return getStoreMetaDoc(dbUrl, change.storeName).then(function(sM) {
    storeMeta = sM;
    if (change.type === 'create') {
      change.version = 0;
      change.key = storeMeta.nextKey;
      storeMeta.nextKey++;
    } else {
      change.version++;
    }
    change.timestamp = storeMeta.timestamp;
    change.docType = 'change';
    return saveDocument(dbUrl, change);
  }).then(function() {
    storeMeta.timestamp++;
    return saveDocument(dbUrl, storeMeta);
  }).then(function() {
    change.docType = undefined;
    change._id = undefined;
    change._rev = undefined;
    return change;
  });
};

couchdbPersistence.prototype.getChanges = function(req) {
  var dbUrl = this.dbUrl;
  var qs = {};
  var since = req.since === null ? 0 : req.since + 1;
  return request({
    url: dbUrl + '_design/synceddb/_view/changes',
    method: 'GET',
    json: true,
    qs: {startkey: '["' + req.storeName + '",' + since + ']',
         endkey: '["' + req.storeName + '",{}]'}
  }).spread(function(res, body) {
    console.log(body);
    return body.rows.map(function(d) {
      d.value.docType = undefined;
      d.value._id = undefined;
      d.value._rev = undefined;
      return d.value;
    });
  });
};

couchdbPersistence.prototype.resetChanges = function(change) {
  var dbUrl = this.dbUrl;
  return request({
    method: 'DELETE',
    url: dbUrl
  }).then(function() {
    return doCreateDb(dbUrl);
  });
};

function create(opts) {
  var p = new couchdbPersistence(opts);
  return createDb(opts.dbUrl).then(function() {
    return p;
  });
}

exports.create = create;
