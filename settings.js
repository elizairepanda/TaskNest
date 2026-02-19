// Settings Page Logic
import { db, auth } from "./firebase-config.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { applyTheme, saveTheme, loadAndApplyTheme, THEMES } from "./theme.js";
import { sendTestNotification } from "./notifications.js";
import { logout } from "./auth.js";

window.logout = logout;

auth.onAuthStateChanged(async (user) => {
  if (!user) { window.location.href = "login.html"; return; }
  await loadAndApplyTheme();
  await loadSettings(user);
  setupSettingsListeners(user);
});

async function loadSettings(user) {
  // Load user profile
  try {
    const snap = await getDoc(doc(db, "users", user.uid, "profile", "info"));
    if (snap.exists()) {
      const data = snap.data();
      document.getElementById('userFullName').textContent = data.fullName || user.displayName || '—';
      document.getElementById('userEmail').textContent    = user.email;
      document.getElementById('userDOB').textContent      = data.dob
        ? new Date(data.dob).toLocaleDateString() : '—';
    } else {
      document.getElementById('userFullName').textContent = user.displayName || '—';
      document.getElementById('userEmail').textContent    = user.email;
      document.getElementById('userDOB').textContent      = '—';
    }
  } catch (err) {
    document.getElementById('userEmail').textContent = user.email;
  }

  // Load preferences (theme + notifications)
  try {
    const prefSnap = await getDoc(doc(db, "users", user.uid, "settings", "preferences"));
    const prefs    = prefSnap.exists() ? prefSnap.data() : {};

    const theme = prefs.theme || localStorage.getItem(`theme_${user.uid}`) || 'pastel';
    document.getElementById('themeSelect').value = theme;
    applyTheme(theme);

    const notificationsEnabled = prefs.notifications !== false; // default true
    document.getElementById('notificationsToggle').textContent = notificationsEnabled ? 'Enabled' : 'Disabled';
    document.getElementById('notificationsToggle').style.color = notificationsEnabled ? '#10b981' : '#ef4444';

    // Store in localStorage for offline use
    localStorage.setItem(`settings_${user.uid}`, JSON.stringify(prefs));
  } catch (err) {
    console.warn("Could not load prefs:", err);
  }
}

async function savePreference(user, key, value) {
  try {
    await setDoc(
      doc(db, "users", user.uid, "settings", "preferences"),
      { [key]: value },
      { merge: true }
    );
    // Update local cache too
    const cached = JSON.parse(localStorage.getItem(`settings_${user.uid}`) || '{}');
    cached[key]  = value;
    localStorage.setItem(`settings_${user.uid}`, JSON.stringify(cached));
  } catch (err) {
    console.warn("Could not save preference:", err);
  }
}

function setupSettingsListeners(user) {
  // ── Theme Change ─────────────────────────────────────────────────────────
  document.getElementById('themeSelect').addEventListener('change', async (e) => {
    const theme = e.target.value;
    applyTheme(theme);
    await saveTheme(theme);           // saves to Firestore + localStorage
    await savePreference(user, 'theme', theme);
    showMessage('Theme updated!', 'success');
  });

  // ── Edit Profile ──────────────────────────────────────────────────────────
  document.getElementById('editProfileBtn').addEventListener('click', () => showEditProfileModal(user));

  // ── Change Password ───────────────────────────────────────────────────────
  document.getElementById('changePasswordBtn').addEventListener('click', showChangePasswordModal);

  // ── Notifications Toggle ─────────────────────────────────────────────────
  document.getElementById('toggleNotificationsBtn').addEventListener('click', async () => {
    const cached   = JSON.parse(localStorage.getItem(`settings_${user.uid}`) || '{}');
    const newValue = !(cached.notifications !== false);
    await savePreference(user, 'notifications', newValue);
    document.getElementById('notificationsToggle').textContent = newValue ? 'Enabled' : 'Disabled';
    document.getElementById('notificationsToggle').style.color = newValue ? '#10b981' : '#ef4444';
    showMessage(`Notifications ${newValue ? 'enabled' : 'disabled'}!`, 'success');
  });

  // ── Test Notification ─────────────────────────────────────────────────────
  const testBtn = document.getElementById('testNotificationBtn');
  if (testBtn) {
    testBtn.addEventListener('click', async () => {
      testBtn.textContent = 'Sending...';
      testBtn.disabled    = true;
      try {
        await sendTestNotification(user);
        showMessage(`✅ Test email sent to ${user.email}!`, 'success');
      } catch (err) {
        showMessage('⚠️ Email failed — check EmailJS setup in notifications.js', 'error');
        console.error(err);
      } finally {
        testBtn.textContent = 'Send Test Email';
        testBtn.disabled    = false;
      }
    });
  }

  // ── Export Data ───────────────────────────────────────────────────────────
  document.getElementById('exportDataBtn').addEventListener('click', () => exportUserData(user));

  // ── Delete Account ────────────────────────────────────────────────────────
  document.getElementById('deleteAccountBtn').addEventListener('click', () => deleteAccount(user));
}

// ── Modals ─────────────────────────────────────────────────────────────────

function showEditProfileModal(user) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content">
      <h2>Edit Profile</h2>
      <form id="editProfileForm">
        <div class="form-group">
          <label>Full Name</label>
          <input type="text" id="editFullName" placeholder="Full Name" required>
        </div>
        <div class="form-group">
          <label>Date of Birth</label>
          <input type="date" id="editDOB">
        </div>
        <button type="submit" class="btn-primary">Save Changes</button>
        <button type="button" onclick="this.closest('.modal-overlay').remove()" class="btn-secondary">Cancel</button>
      </form>
    </div>`;
  document.body.appendChild(modal);

  document.getElementById('editProfileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fullName = document.getElementById('editFullName').value.trim();
    const dob      = document.getElementById('editDOB').value;
    try {
      await setDoc(doc(db, "users", user.uid, "profile", "info"), { fullName, dob }, { merge: true });
      document.getElementById('userFullName').textContent = fullName;
      if (dob) document.getElementById('userDOB').textContent = new Date(dob).toLocaleDateString();
      showMessage('Profile updated!', 'success');
      modal.remove();
    } catch (err) {
      showMessage('Error: ' + err.message, 'error');
    }
  });
}

function showChangePasswordModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content">
      <h2>Change Password</h2>
      <p style="color:#6b7280;margin-bottom:20px;font-size:14px;">
        A password reset email will be sent to your inbox.
      </p>
      <button id="sendResetBtn" class="btn-primary">Send Reset Email</button>
      <button onclick="this.closest('.modal-overlay').remove()" class="btn-secondary">Cancel</button>
    </div>`;
  document.body.appendChild(modal);

  document.getElementById('sendResetBtn').addEventListener('click', async () => {
    const { sendPasswordResetEmail } = await import(
      "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js"
    );
    try {
      await sendPasswordResetEmail(auth, auth.currentUser.email);
      showMessage('Password reset email sent!', 'success');
      modal.remove();
    } catch (err) {
      showMessage('Error: ' + err.message, 'error');
    }
  });
}

async function exportUserData(user) {
  try {
    const { getDocs, collection } = await import(
      "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
    );
    const snap  = await getDocs(collection(db, "users", user.uid, "tasks"));
    const tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const data  = { email: user.email, tasks, exportDate: new Date().toISOString() };
    const blob  = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url   = URL.createObjectURL(blob);
    const a     = document.createElement('a');
    a.href = url; a.download = `student-planner-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
    showMessage('Data exported!', 'success');
  } catch (err) {
    showMessage('Export failed: ' + err.message, 'error');
  }
}

async function deleteAccount(user) {
  if (!confirm('Delete your account? This cannot be undone.')) return;
  if (!confirm('All your tasks will be permanently deleted. Continue?')) return;
  try {
    await user.delete();
    showMessage('Account deleted. Redirecting...', 'success');
    setTimeout(() => { window.location.href = 'login.html'; }, 2000);
  } catch (err) {
    showMessage('Error: ' + err.message + ' — Please re-login and try again.', 'error');
  }
}

function showMessage(message, type) {
  document.querySelector('.message-toast')?.remove();
  const div = document.createElement('div');
  div.className = `message-toast ${type}`;
  div.textContent = message;
  document.body.appendChild(div);
  setTimeout(() => div.classList.add('show'), 100);
  setTimeout(() => { div.classList.remove('show'); setTimeout(() => div.remove(), 300); }, 3500);
}
