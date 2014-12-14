(function() {
  var stores = [
    ['messages',
      ['bySentTime', 'sentAt']
    ]
  ];
  var db = syncedDB.open('chatApp', 1, stores);
  db.remote = 'localhost:8080';
  db.messages.on('add', function(key) {
    console.log('message created');
    console.log(key);
  });
  db.pullFromRemote()
  .then(function() {
    console.log('synced');
    return db.messages.put({
      text: 'Hello there',
      sentAt: Date.now()
    });
  }).then(function() {
    db.pushToRemote();
  });
}());
