(function() {
  const stores = {
    tasks: [
      ['byCreation', 'createdAt']
    ]
  };
  const db = syncedDB.open({
    name: 'todoApp',
    version: 1,
    stores: stores,
    remote: 'localhost:8080',
  });

  const tasks = [];

  document.addEventListener('DOMContentLoaded', function() {
    db.tasks.on('add', function(e) {
      console.log('Todo added');
      console.log(e);
      createTaskElm(e.record);
    });
    db.tasks.on('update', function(e) {
      console.log('Todo updated');
      console.log(e);
      tasks.forEach(function(task) {
        if (task.record.key === e.record.key) {
          task.record.finished = e.record.finished;
          updateTaskElm(task.elm, task.record);
        }
      });
    });
    db.tasks.on('delete', function(e) {
      console.log('Todo deleted');
      console.log(e);
      let idx;
      tasks.forEach(function(task, i) {
        if (task.record.key === e.record.key) idx = i;
      });
      deleteTaskElm(tasks[idx].elm);
      tasks.splice(idx, 1);
    });
    db.tasks.on('synced', function(key, task) {
      console.log('Todo synced');
      console.log(key, task);
      tasks.forEach(function(obj) {
        if (obj.record.key === key) obj.record.key = task.key;
      });
    });
    db.tasks.byCreation.getAll().then(function(tasks) {
      tasks.forEach(createTaskElm);
    });
    db.sync('tasks', {continuously: true});

    const createTaskElm = function(task) {
      const list = document.getElementById('tasks');
      const taskElm = document.createElement('li');
      tasks.push({record: task, elm: taskElm});
      taskElm.innerHTML = '<span>' + task.description + '</span><a class="delete">×</a>';
      taskElm.addEventListener('click', toggleDone.bind(null, task));
      taskElm.querySelector('.delete').addEventListener('click', deleteTask.bind(null, task));
      taskElm.style.transform = 'scale(.5)';
      taskElm.style.marginBottom = '-2.6em';
      taskElm.style.opacity = '0';
      if (task.finished) taskElm.classList.add('task-finished');
      list.appendChild(taskElm);
      // Make sure the initial state is applied.
      getComputedStyle(taskElm).opacity;
      taskElm.style.transform = 'scale(1)';
      taskElm.style.opacity = '1';
      taskElm.style.marginBottom = '0';
      setTimeout(function() {
        taskElm.style.transform = 'none';
      }, 200);
    };

    function updateTaskElm(elm, task) {
      if (elm.classList.contains('task-finished') !== task.finished) {
        elm.classList.toggle('task-finished');
      }
    }

    function deleteTaskElm(taskElm) {
      taskElm.style.transform = 'scale(.5)';
      taskElm.style.opacity = '0';
      setTimeout(function() {
        taskElm.style.marginBottom = '-2.6em';
        setTimeout(function() {
          taskElm.parentNode.removeChild(taskElm);
        }, 200);
      }, 200);
    }

    function toggleDone(task, ev) {
      //const key = ev.target.id.slice(5);
      task.finished = !task.finished;
      db.tasks.put(task);
    }

    function deleteTask(task, ev) {
      //const key = ev.target.parentNode.id.slice(5);
      ev.preventDefault();
      ev.cancelBubble = true;
      console.log(task);
      db.tasks.delete(task);
    }

    document.getElementById('add-todo-form').addEventListener('submit', function(e) {
      e.preventDefault();
      const desc = document.getElementById('todo-description').value;
      document.getElementById('todo-description').value = '';
      db.tasks.put({
        description: desc,
        finished: false,
        createdAt: Date.now()
      });
    });

    document.getElementById('reset').addEventListener('click', function() {
      const req = indexedDB.deleteDatabase('todoApp');
      req.onsuccess = function() { location.reload(); };
    });
  });
}());
