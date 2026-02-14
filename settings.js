// Settings Page Logic

if (document.getElementById('settingsPage')) {
  checkAuth();
  loadSettings();
  setupSettingsListeners();
}

function loadSettings() {
  const email = Storage.getCurrentUser();
  const user = Storage.findUser(email);
  const settings = Storage.getSettings();
  
  if (user) {
    document.getElementById('userFullName').textContent = user.fullName;
    document.getElementById('userEmail').textContent = user.email;
    document.getElementById('userDOB').textContent = new Date(user.dob).toLocaleDateString();
  }
  
  // Load theme
  document.getElementById('themeSelect').value = settings.theme || 'pastel';
  document.getElementById('notificationsToggle').textContent = settings.notifications ? 'Enabled' : 'Disabled';
}

function setupSettingsListeners() {
  // Theme change
  document.getElementById('themeSelect').addEventListener('change', function(e) {
    const theme = e.target.value;
    Storage.updateSetting('theme', theme);
    applyThemePreview(theme);
    showMessage('Theme updated successfully!', 'success');
  });
  
  // Edit profile
  document.getElementById('editProfileBtn').addEventListener('click', showEditProfileModal);
  
  // Change password
  document.getElementById('changePasswordBtn').addEventListener('click', showChangePasswordModal);
  
  // Toggle notifications
  document.getElementById('toggleNotificationsBtn').addEventListener('click', function() {
    const settings = Storage.getSettings();
    const newValue = !settings.notifications;
    Storage.updateSetting('notifications', newValue);
    document.getElementById('notificationsToggle').textContent = newValue ? 'Enabled' : 'Disabled';
    showMessage(`Notifications ${newValue ? 'enabled' : 'disabled'}!`, 'success');
  });
  
  // Export data
  document.getElementById('exportDataBtn').addEventListener('click', exportUserData);
  
  // Delete account
  document.getElementById('deleteAccountBtn').addEventListener('click', deleteAccount);
}

function applyThemePreview(theme) {
  document.body.setAttribute('data-theme', theme);
}

function showEditProfileModal() {
  const email = Storage.getCurrentUser();
  const user = Storage.findUser(email);
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content">
      <h2>Edit Profile</h2>
      <form id="editProfileForm">
        <div class="form-group">
          <label for="editFullName">Full Name</label>
          <input type="text" id="editFullName" value="${user.fullName}" required>
        </div>
        <div class="form-group">
          <label for="editDOB">Date of Birth</label>
          <input type="date" id="editDOB" value="${user.dob}" required>
        </div>
        <button type="submit" class="btn-primary">Save Changes</button>
        <button type="button" onclick="this.closest('.modal-overlay').remove()" class="btn-secondary">Cancel</button>
      </form>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  document.getElementById('editProfileForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const users = Storage.getUsers();
    const userIndex = users.findIndex(u => u.email === email);
    
    if (userIndex !== -1) {
      users[userIndex].fullName = document.getElementById('editFullName').value;
      users[userIndex].dob = document.getElementById('editDOB').value;
      localStorage.setItem('users', JSON.stringify(users));
      showMessage('Profile updated successfully!', 'success');
      modal.remove();
      loadSettings();
    }
  });
}

function showChangePasswordModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content">
      <h2>Change Password</h2>
      <form id="changePasswordForm">
        <div class="form-group">
          <label for="currentPassword">Current Password</label>
          <input type="password" id="currentPassword" required>
        </div>
        <div class="form-group">
          <label for="newPassword">New Password</label>
          <input type="password" id="newPassword" required minlength="6">
        </div>
        <div class="form-group">
          <label for="confirmNewPassword">Confirm New Password</label>
          <input type="password" id="confirmNewPassword" required>
        </div>
        <button type="submit" class="btn-primary">Change Password</button>
        <button type="button" onclick="this.closest('.modal-overlay').remove()" class="btn-secondary">Cancel</button>
      </form>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  document.getElementById('changePasswordForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const email = Storage.getCurrentUser();
    const user = Storage.findUser(email);
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmNewPassword').value;
    
    if (user.password !== currentPassword) {
      showMessage('Current password is incorrect!', 'error');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      showMessage('New passwords do not match!', 'error');
      return;
    }
    
    if (Storage.updateUserPassword(email, newPassword)) {
      showMessage('Password changed successfully!', 'success');
      modal.remove();
    }
  });
}

function exportUserData() {
  const email = Storage.getCurrentUser();
  const user = Storage.findUser(email);
  const tasks = Storage.getUserTasks();
  const settings = Storage.getSettings();
  
  const data = {
    user: { ...user, password: '***HIDDEN***' },
    tasks,
    settings,
    exportDate: new Date().toISOString()
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `student-planner-data-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  
  showMessage('Data exported successfully!', 'success');
}

function deleteAccount() {
  if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
    if (confirm('This will permanently delete all your data. Continue?')) {
      const email = Storage.getCurrentUser();
      
      // Delete user
      const users = Storage.getUsers();
      const filtered = users.filter(u => u.email !== email);
      localStorage.setItem('users', JSON.stringify(filtered));
      
      // Delete user tasks
      const tasks = Storage.getTasks();
      const filteredTasks = tasks.filter(t => t.userId !== email);
      Storage.saveTasks(filteredTasks);
      
      showMessage('Account deleted. Redirecting...', 'success');
      setTimeout(() => {
        Storage.logout();
        window.location.href = 'login.html';
      }, 2000);
    }
  }
}