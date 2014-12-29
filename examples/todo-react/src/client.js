/** @jsx React.DOM */

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
      //createTaskElm(e.record);
      console.log('calling add task');
      console.log(TodoActions.addTask);
      TodoActions.addTask(e.record);
    });
    db.tasks.on('update', function(e) {
      //updateTaskElm(e.record);
      console.log(e);
      if (e.origin !== 'LOCAL') {
        TodoActions.updateTask(e.record);
      }
    });
    db.tasks.on('delete', function(e) {
      //deleteTaskElm(e.record);
    });
    db.tasks.byCreation.getAll()
    .then(function(tasks) {
      //tasks.forEach(createTaskElm);
    });
    db.syncContinuously('tasks');

    // *******************************************
    // Actions

    TodoActions = Reflux.createActions([
      'addTask',
      'updateTask',
      'toggleFinished',
      'removeItem',
    ]);

    // *******************************************
    // Stores

    var todoStore = Reflux.createStore({
      listenables: [TodoActions],
      init: function() {
        var self = this;
        this.tasks = [];
        db.tasks.byCreation.getAll()
        .then(function(tasks) {
          console.log('setting tasks');
          console.log(tasks);
          self.tasks = tasks;
          console.log(self);
          self.trigger(self.tasks);
        });
      },
      getInitialData: function() {
        return this.tasks;
      },
      onAddTask: function(task) {
        this.tasks.push(task);
        this.trigger(this.tasks);
      },
      onUpdateTask: function(task) {
        var self = this;
        self.tasks.forEach(function(t, i) {
          if (t.key === task.key)
            self.tasks[i] = task;
        });
        this.trigger(self.tasks);
      },
      onToggleFinished: function(key) {
        this.tasks.forEach(function(task) {
          if (task.key === key) {
            task.finished = !task.finished;
            db.tasks.put(task);
          }
        });
        this.trigger(this.tasks);
      },
    });

    // *******************************************
    // Components

    var Task = React.createClass({
      toggleFinished: function() {
        console.log('toggling done!!!!');
        console.log(this.props.task);
        TodoActions.toggleFinished(this.props.task.key);
      },
      render: function() {
        var classString = this.props.task.finished ? 'task-finished' : '';
        return (
          <li className={classString} onClick={this.toggleFinished}>
            <span>
              {this.props.task.description}
            </span>
            <a className="delete">×</a>
          </li>
        );
      }
    });

    var TaskSubmit = React.createClass({
      render: function() {
        return (
          <form id="add-todo-form" action="">
            <button type="submit">Add</button>
            <input id="todo-description" />
          </form>
        );
      }
    });

    var TaskList = React.createClass({
      render: function() {
        var tasks = this.props.list.map(function(task) {
          return (
            <Task task={task} />
          );
        });
        return (
          <div>
            <h1>Todo list</h1>
            <ul id="tasks">
              {tasks}
            </ul>
          </div>
        );
      },
    });

    var TodoApp = React.createClass({
      mixins: [Reflux.connect(todoStore,"list")],
      getInitialState: function() {
        return {
          list: []
        };
      },
      render: function() {
        return (
          <div>
            <TaskList list={this.state.list} />
            <TaskSubmit />
          </div>
        );
      }
    });

    React.render(
      <TodoApp />,
      document.getElementById('wrapper')
    );

    var createTaskElm = function(task) {
      tasks.push(task);
      var list = document.getElementById('tasks');
      var taskElm = document.createElement('li');
      taskElm.id = 'task-' + task.key;
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

    function updateTaskElm(task) {
      var taskElm = document.getElementById('task-' + task.key);
      if (taskElm.classList.contains('task-finished') !== task.finished) {
        taskElm.classList.toggle('task-finished');
      }
    }

    function deleteTaskElm(task) {
      var taskElm = document.getElementById('task-' + task.key);
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
      task.finished = !task.finished;
      db.tasks.put(task);
    }

    function deleteTask(task, ev) {
      ev.preventDefault();
      ev.cancelBubble = true;
      db.tasks.delete(task.key);
    }

    document.getElementById('add-todo-form').addEventListener('submit', function(e) {
      e.preventDefault();
      var desc = document.getElementById('todo-description').value;
      document.getElementById('todo-description').value = '';
      db.tasks.put({
        description: desc,
        finished: false,
        createdAt: Date.now()
      });
    });
  });
}());
