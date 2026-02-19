import { db, auth } from "./firebase-config.js";
import {
  collection, addDoc, getDocs, updateDoc, deleteDoc, doc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { logout } from "./auth.js";
import { initTheme } from "./theme.js";
import { checkAndSendDueNotifications } from "./notifications.js";

// Apply theme instantly on load
initTheme();

let currentDate   = new Date();
let selectedDate  = null;
let editingTaskId = null;

async function getUserTasksFromFirestore() {
  return new Promise((resolve) => {
    auth.onAuthStateChanged(async (user) => {
      if (!user) { resolve([]); return; }
      try {
        const snapshot = await getDocs(collection(db, "users", user.uid, "tasks"));
        resolve(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error(e); resolve([]); }
    });
  });
}

if (document.querySelector('.dashboard-page')) {
  auth.onAuthStateChanged(async user => {
    if (!user) { window.location.href = "login.html"; return; }
    await initDashboard(user);
  });
}

async function initDashboard(user) {
  await renderCalendar();
  await renderTasks();
  setupEventListeners();
  // Check & send due-soon email notifications (once per day)
  try {
    const tasks  = await getUserTasksFromFirestore();
    const result = await checkAndSendDueNotifications(tasks, user, 2);
    if (result && result.sent)
      showMessage(`📧 Reminder sent to ${user.email} for ${result.count} upcoming task(s)!`, 'success');
  } catch (err) { console.warn("[Notifications]", err); }
}

async function renderCalendar() {
  const calendarHeader = document.querySelector('.calendar-header');
  const calendarGrid   = document.querySelector('.calendar-grid');
  if (!calendarGrid) return;

  const year  = currentDate.getFullYear();
  const month = currentDate.getMonth();

  calendarHeader.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <button onclick="window.changeMonth(-1)" class="calendar-nav-btn">←</button>
      <span>${currentDate.toLocaleDateString('en-US',{month:'long',year:'numeric'}).toUpperCase()}</span>
      <button onclick="window.changeMonth(1)"  class="calendar-nav-btn">→</button>
    </div>`;

  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const tasks       = await getUserTasksFromFirestore();

  const taskDates = tasks.reduce((acc, task) => {
    if (task.dueDate) {
      const [ty, tm, td] = task.dueDate.split('-').map(Number);
      if (tm - 1 === month && ty === year) acc[td] = (acc[td] || 0) + 1;
    }
    return acc;
  }, {});

  calendarGrid.innerHTML = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
    .map(d => `<div class="calendar-day">${d}</div>`).join('');

  for (let i = 0; i < firstDay; i++)
    calendarGrid.innerHTML += '<div class="calendar-date"></div>';

  const today = new Date();
  for (let day = 1; day <= daysInMonth; day++) {
    const isToday    = today.getDate()===day && today.getMonth()===month && today.getFullYear()===year;
    const hasTask    = taskDates[day];
    const dateString = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    calendarGrid.innerHTML += `
      <div class="calendar-date ${isToday?'highlighted':''}"
           onclick="window.selectDate('${dateString}')" data-date="${dateString}"
           style="cursor:pointer;position:relative;">
        ${day}
        ${hasTask ? `<span class="task-indicator">${hasTask}</span>` : ''}
      </div>`;
  }
}

window.changeMonth = (delta) => { currentDate.setMonth(currentDate.getMonth()+delta); renderCalendar(); };
window.selectDate  = (dateString) => {
  selectedDate = dateString;
  document.querySelectorAll('.calendar-date').forEach(el => el.classList.remove('selected'));
  document.querySelector(`[data-date="${dateString}"]`)?.classList.add('selected');
  showTaskModal(dateString);
};

async function showTaskModal(date) {
  const tasks     = await getUserTasksFromFirestore();
  const dateTasks = tasks.filter(t => t.dueDate === date);
  const modal     = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content">
      <h2>Tasks for ${new Date(date+'T00:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</h2>
      <div class="modal-tasks">
        ${dateTasks.length > 0 ? dateTasks.map(task => `
          <div class="task-item" data-task-id="${task.id}">
            <input type="checkbox" ${task.completed?'checked':''} onchange="window.toggleTask('${task.id}')">
            <span class="${task.completed?'completed':''}">${task.title}</span>
            <span class="priority-badge priority-${task.priority||'medium'}">${task.priority||'medium'}</span>
            <button onclick="window.editTask('${task.id}')"   class="btn-icon">✏️</button>
            <button onclick="window.deleteTask('${task.id}')" class="btn-icon">🗑️</button>
          </div>`).join('')
        : '<p style="color:#6b7280;text-align:center;padding:20px 0;">No tasks for this date.</p>'}
      </div>
      <button onclick="window.showAddTaskForm('${date}')" class="btn-primary" style="margin-top:15px;">+ Add Task</button>
      <button onclick="this.closest('.modal-overlay').remove()" class="btn-secondary">Close</button>
    </div>`;
  document.body.appendChild(modal);
}

window.showAddTaskForm = async function(date = null) {
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
          <label>Task Title</label>
          <input type="text" id="taskTitle" value="${task?task.title:''}" placeholder="e.g. Submit Math Assignment" required>
        </div>
        <div class="form-group">
          <label>Description (Optional)</label>
          <textarea id="taskDescription" rows="3" placeholder="Add any notes...">${task?task.description||'':''}</textarea>
        </div>
        <div class="form-group">
          <label>Due Date</label>
          <input type="date" id="taskDate" value="${task?task.dueDate:date||''}" required>
        </div>
        <div class="form-group">
          <label>Priority</label>
          <select id="taskPriority">
            <option value="low"    ${task?.priority==='low'   ?'selected':''}>🟢 Low</option>
            <option value="medium" ${!task||task?.priority==='medium'?'selected':''}>🟡 Medium</option>
            <option value="high"   ${task?.priority==='high'  ?'selected':''}>🔴 High</option>
          </select>
        </div>
        <button type="submit" class="btn-primary">${task?'Update Task':'Add Task'}</button>
        <button type="button" onclick="window.closeTaskForm()" class="btn-secondary">Cancel</button>
      </form>
    </div>`;
  document.body.appendChild(modal);

  document.getElementById('taskForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) { showMessage('Please log in!','error'); return; }
    const taskData = {
      title:       document.getElementById('taskTitle').value.trim(),
      description: document.getElementById('taskDescription').value.trim(),
      dueDate:     document.getElementById('taskDate').value,
      priority:    document.getElementById('taskPriority').value,
    };
    try {
      if (editingTaskId) {
        await updateDoc(doc(db,"users",user.uid,"tasks",editingTaskId), taskData);
        showMessage('Task updated!','success'); editingTaskId = null;
      } else {
        await addDoc(collection(db,"users",user.uid,"tasks"), {...taskData, completed:false, createdAt:new Date().toISOString()});
        showMessage('Task added!','success');
      }
      closeTaskForm(); await renderCalendar(); await renderTasks();
    } catch (err) { showMessage('Error: '+err.message,'error'); }
  });
};

window.closeTaskForm  = () => { document.querySelector('.modal-overlay')?.remove(); editingTaskId = null; };
window.editTask       = (id) => { editingTaskId = id; showAddTaskForm(); };
window.deleteTask     = async (taskId) => {
  if (!confirm('Delete this task?')) return;
  const user = auth.currentUser; if (!user) return;
  try {
    await deleteDoc(doc(db,"users",user.uid,"tasks",taskId));
    showMessage('Task deleted!','success');
    document.querySelector('.modal-overlay')?.remove();
    await renderCalendar(); await renderTasks();
  } catch (err) { showMessage('Error: '+err.message,'error'); }
};

window.toggleTask = async (taskId) => {
  const user = auth.currentUser; if (!user) return;
  try {
    const tasks = await getUserTasksFromFirestore();
    const task  = tasks.find(t => t.id === taskId);
    if (task) {
      await updateDoc(doc(db,"users",user.uid,"tasks",taskId),{completed:!task.completed});
      await renderTasks(); await renderCalendar();
    }
  } catch (err) { showMessage('Error: '+err.message,'error'); }
};

async function renderTasks() {
  const tasks = await getUserTasksFromFirestore();
  const now   = new Date(); now.setHours(0,0,0,0);

  const upcoming = tasks
    .filter(t => !t.completed && new Date(t.dueDate) >= now)
    .sort((a,b) => new Date(a.dueDate)-new Date(b.dueDate))
    .slice(0,4);

  const upcomingSection = document.querySelector('.task-grid');
  if (upcomingSection) {
    upcomingSection.innerHTML = upcoming.length > 0
      ? upcoming.map(task => {
          const due  = new Date(task.dueDate+'T00:00:00');
          const diff = Math.round((due-now)/(1000*60*60*24));
          return `
            <div class="task-card" onclick="window.editTask('${task.id}')" style="cursor:pointer;">
              <div style="font-weight:600;margin-bottom:4px;">${task.title}</div>
              <div style="font-size:12px;color:#6b7280;">
                📅 ${due.toLocaleDateString('en-US',{month:'short',day:'numeric'})}
                ${diff===0 ? ' <span style="color:#ef4444;font-weight:700;">TODAY</span>'
                  : diff===1 ? ' <span style="color:#f97316;">Tomorrow</span>' : ''}
              </div>
              <span class="priority-badge priority-${task.priority||'medium'}" style="margin-top:4px;display:inline-block;">${task.priority||'medium'}</span>
            </div>`;
        }).join('')
      : '<div class="task-card" style="text-align:center;color:#6b7280;">✅ No upcoming tasks</div>';
  }

  const recent = tasks.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,6);
  document.querySelectorAll('.activity-card').forEach((card, index) => {
    card.querySelectorAll('.activity-item').forEach((item, i) => {
      const task = recent[i + index*3];
      item.innerHTML = task
        ? `<div style="display:flex;justify-content:space-between;align-items:center;">
             <span class="${task.completed?'completed':''}">${task.title}</span>
             <button onclick="window.editTask('${task.id}')" class="btn-icon-small">✏️</button>
           </div>`
        : '<span style="color:#9ca3af;font-size:13px;">—</span>';
    });
  });
}

function setupEventListeners() {
  const addTaskBtn = document.getElementById('addTaskBtn');
  if (addTaskBtn) addTaskBtn.addEventListener('click', () => showAddTaskForm());
}

export function showMessage(message, type) {
  document.querySelector('.message-toast')?.remove();
  const div = document.createElement('div');
  div.className = `message-toast ${type}`;
  div.textContent = message;
  document.body.appendChild(div);
  setTimeout(() => div.classList.add('show'), 100);
  setTimeout(() => { div.classList.remove('show'); setTimeout(()=>div.remove(),300); }, 3500);
}

window.logout      = logout;
window.showMessage = showMessage;
