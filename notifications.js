
const EMAILJS_PUBLIC_KEY  = "QLn0wX-XqVlgkRjsO";   
const EMAILJS_SERVICE_ID  = "service_8e11tg6";            
const EMAILJS_TEMPLATE_ID = "template_8e74m67";           

// Load EmailJS SDK dynamically
function loadEmailJS() {
  return new Promise((resolve) => {
    if (window.emailjs) { resolve(); return; }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js";
    script.onload = () => {
      emailjs.init(EMAILJS_PUBLIC_KEY);
      resolve();
    };
    document.head.appendChild(script);
  });
}

/**
 * Check tasks and send email if any are due within `daysAhead` days.
 * @param {Array}  tasks     - array of task objects from Firestore
 * @param {Object} user      - Firebase user object (has .email, .displayName)
 * @param {number} daysAhead - how many days ahead to warn (default 2)
 */
export async function checkAndSendDueNotifications(tasks, user, daysAhead = 2) {
  if (!user) return;

  // Check if notifications are enabled in settings (stored in localStorage)
  const settings = JSON.parse(localStorage.getItem(`settings_${user.uid}`) || "{}");
  if (settings.notifications === false) return;

  // Find tasks due within daysAhead days that are NOT completed
  const now   = new Date();
  now.setHours(0, 0, 0, 0);
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() + daysAhead);

  const dueSoon = tasks.filter(task => {
    if (task.completed || !task.dueDate) return false;
    const due = new Date(task.dueDate);
    due.setHours(0, 0, 0, 0);
    return due >= now && due <= cutoff;
  });

  if (dueSoon.length === 0) return;

  // Avoid spamming: only send once per day
  const lastSentKey = `lastNotifSent_${user.uid}`;
  const lastSent    = localStorage.getItem(lastSentKey);
  const today       = now.toISOString().split("T")[0];
  if (lastSent === today) return;

  // Format task list for the email
  const taskList = dueSoon
    .map(t => {
      const due  = new Date(t.dueDate);
      const diff = Math.round((due - now) / (1000 * 60 * 60 * 24));
      const when = diff === 0 ? "TODAY" : diff === 1 ? "Tomorrow" : `in ${diff} days`;
      return `• ${t.title} — Due ${when} (${due.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}) [${t.priority || "medium"} priority]`;
    })
    .join("\n");

  try {
    await loadEmailJS();
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_email:  user.email,
      to_name:   user.displayName || user.email.split("@")[0],
      task_list: taskList,
      app_name:  "TaskNest",
      days_ahead: daysAhead,
    });

    localStorage.setItem(lastSentKey, today);
    console.log(`[Notifications] Sent due-soon email to ${user.email} for ${dueSoon.length} task(s).`);
    return { sent: true, count: dueSoon.length };
  } catch (err) {
    console.error("[Notifications] EmailJS error:", err);
    // Show in-app toast if email fails but tasks are due
    return { sent: false, count: dueSoon.length, error: err };
  }
}

/**
 * Send a test notification email.
 * Useful to verify EmailJS is configured correctly.
 */
export async function sendTestNotification(user) {
  if (!user) throw new Error("No user logged in.");
  await loadEmailJS();
  return emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
    to_email:  user.email,
    to_name:   user.displayName || user.email.split("@")[0],
    task_list: "• Example Task — Due Tomorrow (High priority)\n• Another Task — Due TODAY (Medium priority)",
    app_name:  "TaskNest",
    days_ahead: 2,
  });
}
