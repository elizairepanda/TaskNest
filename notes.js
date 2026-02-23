// Notes Page Logic
import { db, auth } from "./firebase-config.js";
import {
  collection, addDoc, getDocs, updateDoc, deleteDoc, doc, serverTimestamp, orderBy, query
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { logout } from "./auth.js";
import { initTheme } from "./theme.js";

window.logout = logout;
initTheme();

let currentNoteId  = null;
let allNotes       = [];
let pendingAttachments = []; // { name, type, dataUrl, size }

// ── Auth Guard ──────────────────────────────────────────────────────────────
auth.onAuthStateChanged(async (user) => {
  if (!user) { window.location.href = "login.html"; return; }
  await loadNotes();
  setupListeners();
});

// ── Firestore Helpers ───────────────────────────────────────────────────────
async function getRef() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in");
  return collection(db, "users", user.uid, "notes");
}

async function loadNotes() {
  try {
    const ref  = await getRef();
    const snap = await getDocs(query(ref, orderBy("updatedAt", "desc")));
    allNotes   = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderNotesList(allNotes);
  } catch (err) {
    console.error(err);
    renderNotesList([]);
  }
}

// ── Render Sidebar ──────────────────────────────────────────────────────────
function renderNotesList(notes) {
  const list = document.getElementById('notesList');
  if (notes.length === 0) {
    list.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:30px;font-size:13px;">No notes yet.<br>Click <b>+ New</b> to create one!</div>';
    return;
  }
  list.innerHTML = notes.map(n => `
    <div class="note-list-item ${n.id === currentNoteId ? 'active' : ''}"
         onclick="openNote('${n.id}')">
      <div class="note-title-preview">${escHtml(n.title || 'Untitled')}</div>
      <div class="note-date-preview">${formatDate(n.updatedAt)}</div>
      <div class="note-body-preview">${escHtml((n.body || '').replace(/[#*_~`>-]/g,'').slice(0,80))}</div>
    </div>`).join('');
}

// ── Open / New Note ─────────────────────────────────────────────────────────
window.openNote = function(id) {
  const note = allNotes.find(n => n.id === id);
  if (!note) return;
  currentNoteId      = id;
  pendingAttachments = note.attachments ? [...note.attachments] : [];

  document.getElementById('emptyState').style.display    = 'none';
  document.getElementById('editorContent').style.display = 'flex';
  document.getElementById('noteTitle').value  = note.title  || '';
  document.getElementById('noteBody').value   = note.body   || '';
  document.getElementById('noteTimestamp').textContent = 'Saved ' + formatDate(note.updatedAt);

  renderAttachments();
  renderNotesList(allNotes); // refresh active state
};

window.newNote = function() {
  currentNoteId      = null;
  pendingAttachments = [];
  document.getElementById('emptyState').style.display    = 'none';
  document.getElementById('editorContent').style.display = 'flex';
  document.getElementById('noteTitle').value  = '';
  document.getElementById('noteBody').value   = '';
  document.getElementById('noteTimestamp').textContent = 'Unsaved';
  renderAttachments();
  document.getElementById('noteTitle').focus();

  // Clear active
  document.querySelectorAll('.note-list-item').forEach(el => el.classList.remove('active'));
};

// ── Save Note ───────────────────────────────────────────────────────────────
window.saveNote = async function() {
  const title = document.getElementById('noteTitle').value.trim() || 'Untitled';
  const body  = document.getElementById('noteBody').value;
  const user  = auth.currentUser;
  if (!user) return showToast('Please log in!', 'error');

  const data = {
    title,
    body,
    attachments: pendingAttachments,
    updatedAt: new Date().toISOString(),
  };

  try {
    if (currentNoteId) {
      await updateDoc(doc(db, "users", user.uid, "notes", currentNoteId), data);
      showToast('Note saved!', 'success');
    } else {
      data.createdAt = new Date().toISOString();
      const docRef   = await addDoc(collection(db, "users", user.uid, "notes"), data);
      currentNoteId  = docRef.id;
      showToast('Note created!', 'success');
    }
    document.getElementById('noteTimestamp').textContent = 'Saved just now';
    await loadNotes();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
};

// ── Delete Note ─────────────────────────────────────────────────────────────
window.deleteCurrentNote = async function() {
  if (!currentNoteId) return;
  if (!confirm('Delete this note? This cannot be undone.')) return;
  const user = auth.currentUser; if (!user) return;
  try {
    await deleteDoc(doc(db, "users", user.uid, "notes", currentNoteId));
    currentNoteId = null;
    pendingAttachments = [];
    document.getElementById('emptyState').style.display    = 'flex';
    document.getElementById('editorContent').style.display = 'none';
    showToast('Note deleted!', 'success');
    await loadNotes();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
};

// ── Attachments ─────────────────────────────────────────────────────────────
function renderAttachments() {
  const grid  = document.getElementById('attachmentsGrid');
  const count = document.getElementById('attCount');
  count.textContent = pendingAttachments.length ? `(${pendingAttachments.length})` : '';

  if (pendingAttachments.length === 0) { grid.innerHTML = ''; return; }

  grid.innerHTML = pendingAttachments.map((att, i) => {
    const isImage = att.type && att.type.startsWith('image/');
    const icon    = getFileIcon(att.type);
    return `
      <div class="attachment-chip" title="${escHtml(att.name)}">
        ${isImage
          ? `<img class="att-thumb" src="${att.dataUrl}" alt="${escHtml(att.name)}">`
          : `<span>${icon}</span>`}
        <span class="att-name" onclick="viewAttachment(${i})">${escHtml(att.name)}</span>
        <span class="att-remove" onclick="removeAttachment(${i})" title="Remove">✕</span>
      </div>`;
  }).join('');
}

window.removeAttachment = function(index) {
  pendingAttachments.splice(index, 1);
  renderAttachments();
};

window.viewAttachment = function(index) {
  const att = pendingAttachments[index];
  if (!att || !att.dataUrl) return;
  const a = document.createElement('a');
  a.href = att.dataUrl;
  a.download = att.name;
  a.click();
};

function getFileIcon(type) {
  if (!type) return '📎';
  if (type.startsWith('image/'))  return '🖼️';
  if (type.includes('pdf'))       return '📄';
  if (type.includes('word') || type.includes('doc')) return '📝';
  if (type.includes('sheet') || type.includes('xls')) return '📊';
  if (type.includes('presentation') || type.includes('ppt')) return '📊';
  if (type.includes('zip') || type.includes('rar')) return '🗜️';
  if (type.startsWith('text/'))   return '📃';
  return '📎';
}

// ── Toolbar Helpers ─────────────────────────────────────────────────────────
window.insertText = function(before, after) {
  const ta    = document.getElementById('noteBody');
  const start = ta.selectionStart;
  const end   = ta.selectionEnd;
  const sel   = ta.value.slice(start, end);
  ta.value    = ta.value.slice(0, start) + before + sel + after + ta.value.slice(end);
  ta.selectionStart = start + before.length;
  ta.selectionEnd   = start + before.length + sel.length;
  ta.focus();
};

window.insertLine = function(prefix) {
  const ta    = document.getElementById('noteBody');
  const pos   = ta.selectionStart;
  const lineStart = ta.value.lastIndexOf('\n', pos - 1) + 1;
  ta.value = ta.value.slice(0, lineStart) + prefix + ta.value.slice(lineStart);
  const newPos = lineStart + prefix.length + (pos - lineStart);
  ta.selectionStart = ta.selectionEnd = newPos;
  ta.focus();
};

// ── Setup Listeners ─────────────────────────────────────────────────────────
function setupListeners() {
  // Search
  document.getElementById('searchNotes').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = allNotes.filter(n =>
      (n.title || '').toLowerCase().includes(q) ||
      (n.body  || '').toLowerCase().includes(q)
    );
    renderNotesList(filtered);
  });

  // File input
  document.getElementById('fileInput').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) {
        showToast(`"${file.name}" is too large (max 5MB).`, 'error'); continue;
      }
      const dataUrl = await readFile(file);
      pendingAttachments.push({ name: file.name, type: file.type, size: file.size, dataUrl });
    }
    renderAttachments();
    e.target.value = ''; // reset
  });

  // Auto-save on Ctrl+S
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (document.getElementById('editorContent').style.display !== 'none') saveNote();
    }
  });
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Utilities ───────────────────────────────────────────────────────────────
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(message, type) {
  document.querySelector('.message-toast')?.remove();
  const div = document.createElement('div');
  div.className = `message-toast ${type}`;
  div.textContent = message;
  document.body.appendChild(div);
  setTimeout(() => div.classList.add('show'), 100);
  setTimeout(() => { div.classList.remove('show'); setTimeout(() => div.remove(), 300); }, 3500);
}
