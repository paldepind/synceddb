(function() {
  document.addEventListener('DOMContentLoaded', function() {
    const stores = {
      messages: [
        ['byCreation', 'createdAt']
      ]
    };
    const db = syncedDB.open({
      name: 'authApp',
      version: 1,
      stores: stores,
      remote: 'localhost:8080',
    });
    const messages = [];
    const msgStore = db.stores.messages;

    msgStore.on('add', function(e) {
      console.log('todo added');
      console.log(e);
      createMessageElm(e.record);
    });
    msgStore.byCreation.getAll()
    .then(function(messages) {
      messages.forEach(createMessageElm);
    });
    msgStore.handleReject = function(rec, msg) {
      console.log('record rejected');
      console.log(rec);
      console.log(msg);
      const msgElm = document.getElementById('msg-' + msg.key);
      msgElm.classList.add('rejected');
    };
    msgStore.on('synced', function(key, record) {
      console.log('record synced');
      console.log(key);
      console.log(record);
      const msgElm = document.getElementById('msg-' + key);
      msgElm.classList.add('synced');
    });

    const createMessageElm = function(msg) {
      console.log(msg);
      messages.push(msg);
      const list = document.getElementById('messages');
      const msgElm = document.createElement('li');
      msgElm.id = 'msg-' + msg.key;
      msgElm.innerHTML = '<span>'+msg.text+'</span>';
      msgElm.style.transform = 'scale(.5)';
      msgElm.style.marginBottom = '-2.6em';
      msgElm.style.opacity = '0';
      if (msg.changedSinceSync !== 1) {
        msgElm.classList.add('synced');
      }
      list.appendChild(msgElm);
      // Make sure the initial state is applied.
      getComputedStyle(msgElm).opacity;
      msgElm.style.transform = 'scale(1)';
      msgElm.style.opacity = '1';
      msgElm.style.marginBottom = '0';
      setTimeout(function() {
        msgElm.style.transform = 'none';
      }, 200);
    };

    document.getElementById('connect-form').addEventListener('submit', function(e) {
      e.preventDefault();
      const selectedToken = document.querySelector('input[name="token"]:checked').value;
      db.connect().then(function() {
        db.send({type: 'authenticate', token: selectedToken});
      });
    });

    db.messages.on('auth-response', function(msg) {
      if (msg.success === true) {
        console.log('authenticated');
      } else {
        console.log('Auth failed, we try synchronizing anyway.');
      }
      db.sync({continuously: true});
    });

    db.messages.on('unauthorized', function(msg) {
      console.log('Unauthorized message recieved from server');
      console.log(msg);
    });

    document.getElementById('add-msg-form').addEventListener('submit', function(e) {
      e.preventDefault();
      const desc = document.getElementById('msg-text').value;
      document.getElementById('msg-text').value = '';
      msgStore.put({
        text: desc,
        createdAt: Date.now()
      });
    });

    document.getElementById('reset').addEventListener('click', function() {
      const req = indexedDB.deleteDatabase('authApp');
      req.onsuccess = function() { location.reload(); };
    });
  });
}());
