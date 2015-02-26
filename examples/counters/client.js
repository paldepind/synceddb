(function() {
  var stores = {
    counters: [
      ['byCreation', 'createdAt']
    ]
  };
  var db = syncedDB.open({
    name: 'countApp',
    version: 1,
    stores: stores,
    remote: 'localhost:8080',
  });

  var counters = [];

  document.addEventListener('DOMContentLoaded', function() {
    db.counters.on('add', function(e) {
      console.log('Counter added');
      console.log(e);
      createCounterElm(e.record);
    });
    db.counters.on('update', function(e) {
      console.log('Counter updated');
      console.log(e);
      counters.forEach(function(counter) {
        if (counter.record.key === e.record.key) {
          counter.record.count = e.record.count;
          updateCounterElm(counter.elm, counter.record);
        }
      });
    });
    db.counters.on('delete', function(e) {
      console.log('Counter deleted');
      console.log(e);
      var idx;
      counters.forEach(function(counter, i) {
        if (counter.record.key === e.record.key) idx = i;
      });
      deleteCounterElm(counters[idx].elm);
      counters.splice(idx, 1);
    });
    db.counters.on('synced', function(key, counter) {
      console.log('Counter synced');
      console.log(key, counter);
      counters.forEach(function(obj) {
        if (obj.record.key === key) obj.record.key = counter.key;
      });
    });
    db.counters.byCreation.getAll().then(function(counters) {
      counters.forEach(createCounterElm);
    });
    db.counters.handleConflict = function(original, local, remote) {
      var locallyAdded = local.count - original.count;
      local.count = locallyAdded + remote.count;
      return local;
    };
    document.getElementById('initiate-sync').addEventListener('click', function() {
      db.sync();
    });

    var createCounterElm = function(counter) {
      var list = document.getElementById('counters');
      var counterElm = document.createElement('li');
      counters.push({record: counter, elm: counterElm});
      counterElm.innerHTML = '<span class="count">' + counter.count + '</span><span>' + counter.name + '</span><a class="delete">×</a>';
      counterElm.addEventListener('click', increment.bind(null, counter));
      counterElm.querySelector('.delete').addEventListener('click', deleteCounter.bind(null, counter));
      counterElm.style.transform = 'scale(.5)';
      counterElm.style.marginBottom = '-2.6em';
      counterElm.style.opacity = '0';
      list.appendChild(counterElm);
      // Make sure the initial state is applied.
      getComputedStyle(counterElm).opacity;
      counterElm.style.transform = 'scale(1)';
      counterElm.style.opacity = '1';
      counterElm.style.marginBottom = '0';
      setTimeout(function() {
        counterElm.style.transform = 'none';
      }, 200);
    };

    function updateCounterElm(elm, counter) {
      elm.innerHTML = '<span class="count">' + counter.count + '</span><span>' + counter.name + '</span><a class="delete">×</a>';
    }

    function deleteCounterElm(counterElm) {
      counterElm.style.transform = 'scale(.5)';
      counterElm.style.opacity = '0';
      setTimeout(function() {
        counterElm.style.marginBottom = '-2.6em';
        setTimeout(function() {
          counterElm.parentNode.removeChild(counterElm);
        }, 200);
      }, 200);
    }

    function increment(counter, ev) {
      counter.count++;
      db.counters.put(counter);
    }

    function deleteCounter(counter, ev) {
      //var key = ev.target.parentNode.id.slice(5);
      ev.preventDefault();
      ev.cancelBubble = true;
      console.log(counter);
      db.counters.delete(counter);
    }

    document.getElementById('add-count-form').addEventListener('submit', function(e) {
      e.preventDefault();
      var desc = document.getElementById('count-name').value;
      document.getElementById('count-name').value = '';
      db.counters.put({
        name: desc,
        count: 0,
        createdAt: Date.now()
      });
    });
    document.getElementById('reset').addEventListener('click', function() {
      var req = indexedDB.deleteDatabase('countApp');
      req.onsuccess = function() { location.reload(); };
    });
  });
}());
