(function() {
  var stores = {
    tasks: [
      ['byCreation', 'createdAt']
    ]
  };
  var db = syncedDB.open({
    name: 'todoApp',
    version: 1,
    stores: stores,
    remote: 'localhost:8080',
  });

  var tasks = [];

  document.addEventListener('DOMContentLoaded', function() {
    db.tasks.on('add', function(e) {
      console.log('todo added');
      console.log(e);
      createTaskElm(e.record);
    });
    db.tasks.on('update', function(e) {
      console.log('todo updated');
      console.log(e);
      updateTaskElm(e.record);
    });
    db.tasks.on('delete', function(e) {
      console.log('todo deleted');
      deleteTaskElm(e.record);
      console.log(e);
    });
    db.tasks.byCreation.getAll()
    .then(function(tasks) {
      tasks.forEach(createTaskElm);
    });
    db.syncContinuously('tasks');

    var createTaskElm = function(task) {
      tasks.push(task);
      var list = document.getElementById('tasks');
      var taskElm = document.createElement('li');
      taskElm.id = 'task-' + task.key;
      taskElm.innerHTML = '<span>' + task.description + '</span><a class="delete">×</a>';
      taskElm.addEventListener('click', toggleDone.bind(null, task));
      taskElm.querySelector('.delete').addEventListener('click', deleteTask.bind(null, task));
      if (task.finished) taskElm.classList.add('task-finished');
      list.appendChild(taskElm);
    };

    var updateTaskElm = function(task) {
      var taskElm = document.getElementById('task-' + task.key);
      if (taskElm.classList.contains('task-finished') !== task.finished) {
        taskElm.classList.toggle('task-finished');
      }
    };

    var deleteTaskElm = function(task) {
      var taskElm = document.getElementById('task-' + task.key);
      taskElm.parentNode.removeChild(taskElm);
    };

    function toggleDone(task, ev) {
      console.log('toggle task');
      console.log(task);
      console.log(ev);
      task.finished = !task.finished;
      db.tasks.put(task);
    }

    function deleteTask(task, ev) {
      ev.preventDefault();
      ev.cancelBubble = true;
      console.log('delete');
      console.log(task);
      db.tasks.delete(task.key);
    }

    document.getElementById('add-todo-form').addEventListener('submit', function(e) {
      e.preventDefault();
      var desc = document.getElementById('todo-description').value;
      document.getElementById('todo-description').value = '';
      console.log(desc);
      db.tasks.put({
        description: desc,
        finished: false,
        createdAt: Date.now()
      });
    });
  });
}());
