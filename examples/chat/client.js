(function() {
  var stores = {
    messages: [
      ['bySentTime', 'sentAt']
    ]
  };
  var db = syncedDB.open('chatApp', 1, stores);
  db.remote = 'localhost:8080';

  document.addEventListener('DOMContentLoaded', function() {
    db.messages.on('add', function(e) {
      console.log('message created');
      console.log(e);
      addMessage(e.record);
    });
    db.messages.bySentTime.getAll()
    .then(function(messages) {
      messages.forEach(addMessage);
    });
    db.pullFromRemote('messages')
    .then(function() {
      db.pushToRemote();
    });

    var addMessage = function(msg) {
      var list = document.getElementById('messages');
      var newMsgElm = document.createElement('li');
      newMsgElm.innerHTML = msg.sentAt + ': ' + msg.text;
      list.appendChild(newMsgElm);
    };

    document.getElementById('add-message-form').addEventListener('submit', function(e) {
      e.preventDefault();
      var text = document.getElementById('message-text').value;
      console.log(text);
      db.messages.put({
        text: text,
        sentAt: Date.now()
      }).then(function() {
        db.pushToRemote();
      });
    });

    setInterval(function() {
      db.pullFromRemote('messages');
    }, 2000);
  });
}());
