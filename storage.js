// LocalStorage Management
const Storage = {
  // User Management
  getUsers: () => JSON.parse(localStorage.getItem('users') || '[]'),
  
  
  // Session Management
  setCurrentUser: (email) => localStorage.setItem('currentUser', email),
  getCurrentUser: () => localStorage.getItem('currentUser'),
  logout: () => localStorage.removeItem('currentUser'),
  
  // Task Management
  getTasks: () => JSON.parse(localStorage.getItem('tasks') || '[]'),
  
  saveTasks: (tasks) => localStorage.setItem('tasks', JSON.stringify(tasks)),
  
  addTask: (task) => {
    const tasks = Storage.getTasks();
    task.id = Date.now().toString();
    task.userId = Storage.getCurrentUser();
    task.completed = false;
    tasks.push(task);
    Storage.saveTasks(tasks);
    return task;
  },
  
  updateTask: (taskId, updates) => {
    const tasks = Storage.getTasks();
    const taskIndex = tasks.findIndex(t => t.id === taskId);
    if (taskIndex !== -1) {
      tasks[taskIndex] = { ...tasks[taskIndex], ...updates };
      Storage.saveTasks(tasks);
      return tasks[taskIndex];
    }
    return null;
  },
  
  deleteTask: (taskId) => {
    const tasks = Storage.getTasks();
    const filtered = tasks.filter(t => t.id !== taskId);
    Storage.saveTasks(filtered);
  },
  
  getUserTasks: () => {
    const currentUser = Storage.getCurrentUser();
    const tasks = Storage.getTasks();
    return tasks.filter(t => t.userId === currentUser);
  },
  
  // Settings Management
  getSettings: () => JSON.parse(localStorage.getItem('settings') || '{"theme":"pastel","notifications":true}'),
  
  saveSettings: (settings) => localStorage.setItem('settings', JSON.stringify(settings)),
  
  updateSetting: (key, value) => {
    const settings = Storage.getSettings();
    settings[key] = value;
    Storage.saveSettings(settings);
  }
};