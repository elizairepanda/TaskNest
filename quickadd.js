// Quick Add from LMS — AI-powered assignment extractor
import { db, auth } from "./firebase-config.js";
import {
  collection, addDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ── Modal Trigger ────────────────────────────────────────────────────────────
export function showQuickAddModal() {
  document.querySelector('.quickadd-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'quickadd-overlay';
  overlay.innerHTML = `
    <div class="quickadd-panel">
      <div class="qa-header">
        <div class="qa-header-left">
          <span class="qa-logo-dot"></span>
          <h2 class="qa-title">Smart Import</h2>
          <span class="qa-badge">AI-Powered</span>
        </div>
        <button class="qa-close" onclick="this.closest('.quickadd-overlay').remove()">✕</button>
      </div>

      <p class="qa-subtitle">Paste any assignment text, course syllabus excerpt, or Blackboard / Google Classroom blurb below — AI will extract the tasks for you.</p>

      <div class="qa-source-tabs">
        <button class="qa-tab active" data-tab="paste">📋 Paste Text</button>
        <button class="qa-tab" data-tab="url">🔗 Paste URL</button>
      </div>

      <div class="qa-input-area" id="qaPasteArea">
        <textarea id="qaTextInput" class="qa-textarea" placeholder="Example:
Assignment 3: Data Structures Report
Due: March 15, 2025 at 11:59 PM
Submit via Blackboard. Cover linked lists, stacks, and queues.
Weight: 20% of final grade

Quiz 4 – Chapter 7 Review
Available: Feb 28 | Closes: March 2
High priority"></textarea>
        <div class="qa-char-count" id="qaCharCount">0 / 3000 characters</div>
      </div>

      <div class="qa-input-area" id="qaUrlArea" style="display:none;">
        <input type="url" id="qaUrlInput" class="qa-url-input" placeholder="https://classroom.google.com/... or any assignment page URL">
        <p class="qa-url-note">⚠️ Note: Only publicly accessible pages can be fetched. Login-protected LMS pages won't work — use Paste Text instead.</p>
      </div>

      <div class="qa-actions">
        <button class="qa-extract-btn" id="qaExtractBtn" onclick="runExtraction()">
          <span class="qa-btn-icon">✨</span>
          <span class="qa-btn-text">Extract Assignments</span>
        </button>
      </div>

      <div id="qaResults" class="qa-results" style="display:none;"></div>

      <div id="qaImportBar" class="qa-import-bar" style="display:none;">
        <span id="qaImportCount"></span>
        <button class="qa-import-btn" id="qaImportBtn">
          <span>⬇ Import Selected to TaskNest</span>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Tab switching
  overlay.querySelectorAll('.qa-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      overlay.querySelectorAll('.qa-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('qaPasteArea').style.display = tab.dataset.tab === 'paste' ? 'block' : 'none';
      document.getElementById('qaUrlArea').style.display   = tab.dataset.tab === 'url'   ? 'block' : 'none';
    });
  });

  // Char counter
  document.getElementById('qaTextInput').addEventListener('input', (e) => {
    const len = e.target.value.length;
    document.getElementById('qaCharCount').textContent = `${len} / 3000 characters`;
    if (len > 3000) e.target.value = e.target.value.slice(0, 3000);
  });

  // Animate in
  requestAnimationFrame(() => overlay.classList.add('visible'));
}

// ── AI Extraction ─────────────────────────────────────────────────────────────
window.runExtraction = async function() {
  const btn       = document.getElementById('qaExtractBtn');
  const resultsEl = document.getElementById('qaResults');
  const importBar = document.getElementById('qaImportBar');
  const activeTab = document.querySelector('.qa-tab.active')?.dataset.tab;

  let inputText = '';

  if (activeTab === 'url') {
    const url = document.getElementById('qaUrlInput').value.trim();
    if (!url) { qaShowError('Please enter a URL.'); return; }
    btn.innerHTML = '<span class="qa-spinner"></span><span class="qa-btn-text">Fetching page...</span>';
    btn.disabled  = true;
    try {
      // Use allorigins CORS proxy for public pages
      const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
      const resp  = await fetch(proxy);
      const data  = await resp.json();
      // Strip HTML tags
      inputText = data.contents.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').slice(0, 3000);
    } catch (err) {
      btn.innerHTML = '<span class="qa-btn-icon">✨</span><span class="qa-btn-text">Extract Assignments</span>';
      btn.disabled  = false;
      qaShowError('Could not fetch that URL. Try copying and pasting the text instead.');
      return;
    }
  } else {
    inputText = document.getElementById('qaTextInput').value.trim();
    if (!inputText) { qaShowError('Please paste some assignment text first.'); return; }
  }

  btn.innerHTML = '<span class="qa-spinner"></span><span class="qa-btn-text">Analyzing with AI...</span>';
  btn.disabled  = true;
  resultsEl.style.display = 'none';
  importBar.style.display = 'none';

  const today = new Date().toISOString().split('T')[0];
  const prompt = `You are an assistant that extracts academic assignments and tasks from student text.

Today's date is ${today}.

Extract ALL assignments, tasks, quizzes, exams, projects, or deadlines from the text below.
Return ONLY a valid JSON array. No markdown, no explanation.

Each item must have:
- "title": string (concise assignment name, max 80 chars)
- "dueDate": string (YYYY-MM-DD format, or "" if not found)
- "description": string (brief extra info, max 120 chars, or "")
- "priority": "low" | "medium" | "high" (infer from weight, urgency, keywords like exam/quiz/final = high; reading/participation = low)
- "source": string (course name or platform if identifiable, else "")

If nothing looks like an assignment, return [].

Text to analyze:
"""
${inputText}
"""`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data    = await response.json();
    const rawText = data.content?.map(c => c.text || '').join('') || '';
    const clean   = rawText.replace(/```json|```/g, '').trim();
    const parsed  = JSON.parse(clean);

    btn.innerHTML = '<span class="qa-btn-icon">✨</span><span class="qa-btn-text">Extract Assignments</span>';
    btn.disabled  = false;

    if (!Array.isArray(parsed) || parsed.length === 0) {
      qaShowError('No assignments found. Try pasting more detailed text with titles and dates.');
      return;
    }

    renderResults(parsed);
  } catch (err) {
    btn.innerHTML = '<span class="qa-btn-icon">✨</span><span class="qa-btn-text">Extract Assignments</span>';
    btn.disabled  = false;
    qaShowError('AI extraction failed. Please try again.');
    console.error(err);
  }
};

// ── Render Extracted Results ────────────────────────────────────────────────
function renderResults(assignments) {
  const resultsEl = document.getElementById('qaResults');
  const importBar = document.getElementById('qaImportBar');

  resultsEl.style.display = 'block';
  resultsEl.innerHTML = `
    <div class="qa-results-header">
      <span class="qa-results-title">✅ Found ${assignments.length} assignment${assignments.length !== 1 ? 's' : ''}</span>
      <div style="display:flex;gap:8px;">
        <button class="qa-sel-btn" onclick="qaSelectAll(true)">Select All</button>
        <button class="qa-sel-btn" onclick="qaSelectAll(false)">Deselect All</button>
      </div>
    </div>
    <div class="qa-cards-grid" id="qaCardsGrid">
      ${assignments.map((a, i) => renderCard(a, i)).join('')}
    </div>`;

  importBar.style.display = 'flex';
  updateImportCount();

  document.getElementById('qaImportBtn').onclick = () => importSelected(assignments);

  // Bind checkboxes
  resultsEl.querySelectorAll('.qa-card-check').forEach(cb => {
    cb.addEventListener('change', updateImportCount);
  });
}

function renderCard(a, i) {
  const priorityColors = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' };
  const color = priorityColors[a.priority] || priorityColors.medium;
  const displayDate = a.dueDate
    ? new Date(a.dueDate + 'T00:00:00').toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' })
    : '— No date found';

  return `
    <div class="qa-card" data-index="${i}">
      <div class="qa-card-top">
        <label class="qa-check-label">
          <input type="checkbox" class="qa-card-check" data-index="${i}" checked>
          <span class="qa-checkmark"></span>
        </label>
        <div class="qa-card-body">
          <div class="qa-card-title">
            <input class="qa-edit-title" data-index="${i}" value="${escHtml(a.title)}" placeholder="Assignment title">
          </div>
          ${a.source ? `<div class="qa-card-source">📚 ${escHtml(a.source)}</div>` : ''}
        </div>
        <span class="qa-priority-dot" style="background:${color};" title="${a.priority} priority"></span>
      </div>
      <div class="qa-card-meta">
        <div class="qa-meta-item">
          <span class="qa-meta-icon">📅</span>
          <input type="date" class="qa-edit-date" data-index="${i}" value="${a.dueDate || ''}">
        </div>
        <div class="qa-meta-item">
          <span class="qa-meta-icon">🚦</span>
          <select class="qa-edit-priority" data-index="${i}">
            <option value="low"    ${a.priority==='low'   ?'selected':''}>Low</option>
            <option value="medium" ${a.priority==='medium'?'selected':''}>Medium</option>
            <option value="high"   ${a.priority==='high'  ?'selected':''}>High</option>
          </select>
        </div>
      </div>
      ${a.description ? `<div class="qa-card-desc">${escHtml(a.description)}</div>` : ''}
    </div>`;
}

// ── Select All / Count ───────────────────────────────────────────────────────
window.qaSelectAll = function(val) {
  document.querySelectorAll('.qa-card-check').forEach(cb => cb.checked = val);
  updateImportCount();
};

function updateImportCount() {
  const checked = document.querySelectorAll('.qa-card-check:checked').length;
  const total   = document.querySelectorAll('.qa-card-check').length;
  document.getElementById('qaImportCount').textContent = `${checked} of ${total} selected`;
}

// ── Import to Firestore ─────────────────────────────────────────────────────
async function importSelected(assignments) {
  const user = auth.currentUser;
  if (!user) { qaShowError('Please log in first.'); return; }

  const btn = document.getElementById('qaImportBtn');
  btn.innerHTML = '<span class="qa-spinner" style="border-color:white;border-top-color:transparent;"></span><span> Importing...</span>';
  btn.disabled = true;

  const checks = document.querySelectorAll('.qa-card-check');
  let imported = 0;

  for (let i = 0; i < assignments.length; i++) {
    if (!checks[i]?.checked) continue;

    // Read any user edits from the card inputs
    const titleEl    = document.querySelector(`.qa-edit-title[data-index="${i}"]`);
    const dateEl     = document.querySelector(`.qa-edit-date[data-index="${i}"]`);
    const priorityEl = document.querySelector(`.qa-edit-priority[data-index="${i}"]`);

    const task = {
      title:       (titleEl?.value || assignments[i].title || 'Untitled').trim(),
      description: assignments[i].description || '',
      dueDate:     dateEl?.value || assignments[i].dueDate || '',
      priority:    priorityEl?.value || assignments[i].priority || 'medium',
      completed:   false,
      createdAt:   new Date().toISOString(),
      source:      assignments[i].source || 'Quick Import',
    };

    try {
      await addDoc(collection(db, "users", user.uid, "tasks"), task);
      imported++;
    } catch (err) {
      console.error('Failed to import task:', err);
    }
  }

  btn.innerHTML = `✅ Imported ${imported} task${imported !== 1 ? 's' : ''}!`;
  setTimeout(() => {
    document.querySelector('.quickadd-overlay')?.remove();
    // Refresh if dashboard functions available
    if (window.renderCalendar) window.renderCalendar();
    if (window.renderTasks)   window.renderTasks();
    if (window.showMessage)   window.showMessage(`✅ ${imported} assignment${imported!==1?'s':''} imported to TaskNest!`, 'success');
  }, 1200);
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function qaShowError(msg) {
  const resultsEl = document.getElementById('qaResults');
  resultsEl.style.display = 'block';
  resultsEl.innerHTML = `<div class="qa-error">⚠️ ${msg}</div>`;
}

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

window.showQuickAddModal = showQuickAddModal;
