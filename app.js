import { db, auth } from "./firebase-config.js";

import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { logout } from "./auth.js";

// Main Dashboard Application
let currentDate = new Date();
let selectedDate = null;
let editingTaskId = null;

// Helper function to get user tasks
async function getUserTasksFromFirestore() {
  return new Promise((resolve) => {
    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        resolve([]);
        return;
      }
      
      try {
        const snapshot = await getDocs(
          collection(db, "users", user.uid, "tasks")
        );
        
        const tasks = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        resolve(tasks);
      } catch (error) {
        console.error("Error getting tasks:", error);
        resolve([]);
      }
    });
  });
}

// Initialize Dashboard
if (document.querySelector('.dashboard-page')) {
  auth.onAuthStateChanged(user => {
    if (!user) {
      window.location.href = "login.html";
    } else {
      initDashboard();
    }
  });
}

async function initDashboard() {
  await renderCalendar();
  await renderTasks();
  setupEventListeners();
}

async function renderCalendar() {
  const calendarHeader = document.querySelector('.calendar-header');
  const calendarGrid = document.querySelector('.calendar-grid');
  
  if (!calendarGrid) return;
  
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  
  calendarHeader.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <button onclick="window.changeMonth(-1)" class="calendar-nav-btn">←</button>
      <span>${currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase()}</span>
      <button onclick="window.changeMonth(1)" class="calendar-nav-btn">→</button>
    </div>
  `;
  
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  const tasks = await getUserTasksFromFirestore();

  const taskDates = tasks.reduce((acc, task) => {
    if (task.dueDate) {
      const date = new Date(task.dueDate).getDate();
      acc[date] = (acc[date] || 0) + 1;
    }
    return acc;
  }, {});
  
  calendarGrid.innerHTML = `
    <div class="calendar-day">Sun</div>
    <div class="calendar-day">Mon</div>
    <div class="calendar-day">Tue</div>
    <div class="calendar-day">Wed</div>
    <div class="calendar-day">Thu</div>
    <div class="calendar-day">Fri</div>
    <div class="calendar-day">Sat</div>
  `;
  
  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) {
    calendarGrid.innerHTML += '<div class="calendar-date"></div>';
  }
  
  // Days of month
  const today = new Date();
  for (let day = 1; day <= daysInMonth; day++) {
    const isToday = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
    const hasTask = taskDates[day];
    const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    calendarGrid.innerHTML += `
      <div class="calendar-date ${isToday ? 'highlighted' : ''}" 
           onclick="window.selectDate('${dateString}')"
           data-date="${dateString}"
           style="cursor: pointer; position: relative;">
        ${day}
        ${hasTask ? `<span class="task-indicator">${hasTask}</span>` : ''}
      </div>
    `;
  }
}

// Make functions global so onclick can access them
window.changeMonth = function(delta) {
  currentDate.setMonth(currentDate.getMonth() + delta);
  renderCalendar();
}

window.selectDate = function(dateString) {
  selectedDate = dateString;
  document.querySelectorAll('.calendar-date').forEach(el => el.classList.remove('selected'));
  document.querySelector(`[data-date="${dateString}"]`)?.classList.add('selected');
  showTaskModal(dateString);
}

async function showTaskModal(date) {
  const tasks = await getUserTasksFromFirestore();
  const dateTasks = tasks.filter(t => t.dueDate === date);
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content">
      <h2>Tasks for ${new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</h2>
      <div class="modal-tasks">
        ${dateTasks.length > 0 ? dateTasks.map(task => `
          <div class="task-item" data-task-id="${task.id}">
            <input type="checkbox" ${task.completed ? 'checked' : ''} onchange="window.toggleTask('${task.id}')">
            <span class="${task.completed ? 'completed' : ''}">${task.title}</span>
            <button onclick="window.editTask('${task.id}')" class="btn-icon">✏️</button>
            <button onclick="window.deleteTask('${task.id}')" class="btn-icon">🗑️</button>
          </div>
        `).join('') : '<p>No tasks for this date.</p>'}
      </div>
      <button onclick="window.showAddTaskForm('${date}')" class="btn-primary" style="margin-top: 15px;">Add Task</button>
      <button onclick="this.closest('.modal-overlay').remove()" class="btn-secondary">Close</button>
    </div>
  `;
  
  document.body.appendChild(modal);
}

window.showAddTaskForm = async function(date = null) {
  // Remove existing modal
  document.querySelector('.modal-overlay')?.remove();
  
  let task = null;
  if (editingTaskId) {
    const tasks = await getUserTasksFromFirestore();
    task = tasks.find(t => t.id === editingTaskId);
  }
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content">
      <h2>${task ? 'Edit Task' : 'Add New Task'}</h2>
      <form id="taskForm">
        <div class="form-group">
          <label for="taskTitle">Task Title</label>
          <input type="text" id="taskTitle" value="${task ? task.title : ''}" required>
        </div>
        <div class="form-group">
          <label for="taskDescription">Description (Optional)</label>
          <textarea id="taskDescription" rows="3">${task ? task.description || '' : ''}</textarea>
        </div>
        <div class="form-group">
          <label for="taskDate">Due Date</label>
          <input type="date" id="taskDate" value="${task ? task.dueDate : date || ''}" required>
        </div>
        <div class="form-group">
          <label for="taskPriority">Priority</label>
          <select id="taskPriority">
            <option value="low" ${task?.priority === 'low' ? 'selected' : ''}>Low</option>
            <option value="medium" ${task?.priority === 'medium' ? 'selected' : ''}>Medium</option>
            <option value="high" ${task?.priority === 'high' ? 'selected' : ''}>High</option>
          </select>
        </div>
        <button type="submit" class="btn-primary">${task ? 'Update' : 'Add'} Task</button>
        <button type="button" onclick="window.closeTaskForm()" class="btn-secondary">Cancel</button>
      </form>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  document.getElementById('taskForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const user = auth.currentUser;
    if (!user) {
      showMessage('Please log in first!', 'error');
      window.location.href = 'login.html';
      return;
    }
    
    const taskData = {
      title: document.getElementById('taskTitle').value.trim(),
      description: document.getElementById('taskDescription').value.trim(),
      dueDate: document.getElementById('taskDate').value,
      priority: document.getElementById('taskPriority').value
    };
    
    try {
      if (editingTaskId) {
        await updateDoc(
          doc(db, "users", user.uid, "tasks", editingTaskId),
          taskData
        );
        showMessage('Task updated successfully!', 'success');
        editingTaskId = null;
      } else {
        await addDoc(
          collection(db, "users", user.uid, "tasks"),
          {
            ...taskData,
            completed: false,
            createdAt: new Date().toISOString()
          }
        );
        showMessage('Task added successfully!', 'success');
      }
      
      closeTaskForm();
      await renderCalendar();
      await renderTasks();
    } catch (error) {
      console.error("Error saving task:", error);
      showMessage('Error saving task: ' + error.message, 'error');
    }
  });
}

window.closeTaskForm = function() {
  document.querySelector('.modal-overlay')?.remove();
  editingTaskId = null;
}

window.editTask = function(taskId) {
  editingTaskId = taskId;
  showAddTaskForm();
}

window.deleteTask = async function(taskId) {
  if (confirm('Are you sure you want to delete this task?')) {
    const user = auth.currentUser;
    if (!user) {
      showMessage('Please log in first!', 'error');
      return;
    }
    
    try {
      await deleteDoc(
        doc(db, "users", user.uid, "tasks", taskId)
      );
      showMessage('Task deleted successfully!', 'success');
      document.querySelector('.modal-overlay')?.remove();
      await renderCalendar();
      await renderTasks();
    } catch (error) {
      console.error("Error deleting task:", error);
      showMessage('Error deleting task: ' + error.message, 'error');
    }
  }
}

window.toggleTask = async function(taskId) {
  const user = auth.currentUser;
  if (!user) {
    showMessage('Please log in first!', 'error');
    return;
  }
  
  try {
    const tasks = await getUserTasksFromFirestore();
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      await updateDoc(
        doc(db, "users", user.uid, "tasks", taskId),
        { completed: !task.completed }
      );
      await renderTasks();
      await renderCalendar();
    }
  } catch (error) {
    console.error("Error toggling task:", error);
    showMessage('Error updating task: ' + error.message, 'error');
  }
}

async function renderTasks() {
  const tasks = await getUserTasksFromFirestore();
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  
  // Upcoming tasks
  const upcomingTasks = tasks
    .filter(t => !t.completed && new Date(t.dueDate) >= now)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
    .slice(0, 4);
  
  const upcomingSection = document.querySelector('.task-grid');
  if (upcomingSection) {
    upcomingSection.innerHTML = upcomingTasks.length > 0 ? upcomingTasks.map(task => `
      <div class="task-card" onclick="window.editTask('${task.id}')" style="cursor: pointer;">
        <div style="font-weight: 600;">${task.title}</div>
        <div style="font-size: 12px; color: #6b7280; margin-top: 5px;">${new Date(task.dueDate).toLocaleDateString()}</div>
      </div>
    `).join('') : '<div class="task-card">No upcoming tasks</div>';
  }
  
  // Recent activity (last 6 tasks)
  const recentTasks = tasks
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 6);
  
  const activityCards = document.querySelectorAll('.activity-card');
  activityCards.forEach((card, index) => {
    const items = card.querySelectorAll('.activity-item');
    items.forEach((item, i) => {
      const task = recentTasks[i + (index * 3)];
      if (task) {
        item.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span class="${task.completed ? 'completed' : ''}">${task.title}</span>
            <button onclick="window.editTask('${task.id}')" class="btn-icon-small">✏️</button>
          </div>
        `;
      }
    });
  });
}

function setupEventListeners() {
  // Add Task Button
  const addTaskBtn = document.getElementById('addTaskBtn');
  if (addTaskBtn) {
    addTaskBtn.addEventListener('click', () => showAddTaskForm());
  }
  
  // Search functionality
  const searchBox = document.querySelector('.search-box');
  if (searchBox) {
    searchBox.addEventListener('input', function(e) {
      const query = e.target.value.toLowerCase();
      // Implement search logic here
    });
  }
}

function showMessage(message, type) {
  const existingMsg = document.querySelector('.message-toast');
  if (existingMsg) existingMsg.remove();

  const messageDiv = document.createElement('div');
  messageDiv.className = `message-toast ${type}`;
  messageDiv.textContent = message;
  document.body.appendChild(messageDiv);

  setTimeout(() => messageDiv.classList.add('show'), 100);

  setTimeout(() => {
    messageDiv.classList.remove('show');
    setTimeout(() => messageDiv.remove(), 300);
  }, 3000);
}

// Make logout global
window.logout = logout;
