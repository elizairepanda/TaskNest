// Theme Manager — persists user theme to Firestore & applies on every page load

import { db, auth } from "./firebase-config.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export const THEMES = {
  pastel:   { label: "Pastel Gradient",  bg: "linear-gradient(135deg, #fef3c7 0%, #fce7f3 50%, #e9d5ff 100%)",   accent: "#a78bfa" },
  ocean:    { label: "Ocean Blue",        bg: "linear-gradient(135deg, #dbeafe 0%, #bfdbfe 50%, #93c5fd 100%)",   accent: "#3b82f6" },
  forest:   { label: "Forest Green",      bg: "linear-gradient(135deg, #d1fae5 0%, #a7f3d0 50%, #6ee7b7 100%)",   accent: "#10b981" },
  sunset:   { label: "Sunset Orange",     bg: "linear-gradient(135deg, #fed7aa 0%, #fdba74 50%, #fb923c 100%)",   accent: "#f97316" },
  lavender: { label: "Lavender Purple",   bg: "linear-gradient(135deg, #e9d5ff 0%, #d8b4fe 50%, #c084fc 100%)",   accent: "#9333ea" },
  mint:     { label: "Mint Fresh",        bg: "linear-gradient(135deg, #ccfbf1 0%, #99f6e4 50%, #5eead4 100%)",   accent: "#14b8a6" },
};

/** Apply theme visually to the current page */
export function applyTheme(themeName) {
  const theme = THEMES[themeName] || THEMES["pastel"];
  document.body.setAttribute("data-theme", themeName);
  document.body.style.background = theme.bg;

  // Update CSS variable for accent color so buttons etc. match
  document.documentElement.style.setProperty("--accent", theme.accent);

  // Tint primary buttons & profile icon to match accent
  const style = document.getElementById("__themeAccent") || (() => {
    const s = document.createElement("style");
    s.id = "__themeAccent";
    document.head.appendChild(s);
    return s;
  })();

  style.textContent = `
    .btn-primary, .settings-button, .fab-button, .profile-icon { background: ${theme.accent} !important; }
    .btn-primary:hover, .settings-button:hover { background: ${theme.accent}cc !important; }
    .form-group input:focus, .form-group select:focus, .form-group textarea:focus { border-color: ${theme.accent} !important; }
    .nav-tabs a:hover { color: ${theme.accent} !important; }
    .auth-links a, .forgot-link:hover { color: ${theme.accent} !important; }
    .calendar-date.selected { background: ${theme.accent} !important; }
  `;
}

/** Save theme to Firestore for the logged-in user */
export async function saveTheme(themeName) {
  const user = auth.currentUser;
  if (!user) {
    // Fallback: save to localStorage if not logged in
    localStorage.setItem("theme", themeName);
    return;
  }
  try {
    await setDoc(
      doc(db, "users", user.uid, "settings", "preferences"),
      { theme: themeName },
      { merge: true }
    );
    // Also cache locally for instant load next time
    localStorage.setItem(`theme_${user.uid}`, themeName);
  } catch (err) {
    console.warn("[Theme] Firestore save failed, using localStorage:", err);
    localStorage.setItem("theme", themeName);
  }
}

/** Load theme from Firestore (or localStorage fallback) and apply it */
export async function loadAndApplyTheme() {
  const user = auth.currentUser;

  // First apply cached theme instantly (avoids flash)
  const cacheKey   = user ? `theme_${user.uid}` : "theme";
  const cachedTheme = localStorage.getItem(cacheKey) || "pastel";
  applyTheme(cachedTheme);

  if (!user) return cachedTheme;

  // Then fetch from Firestore for accuracy
  try {
    const snap = await getDoc(doc(db, "users", user.uid, "settings", "preferences"));
    if (snap.exists()) {
      const firestoreTheme = snap.data().theme || "pastel";
      applyTheme(firestoreTheme);
      localStorage.setItem(cacheKey, firestoreTheme); // update cache
      return firestoreTheme;
    }
  } catch (err) {
    console.warn("[Theme] Could not load from Firestore:", err);
  }

  return cachedTheme;
}

/** Call this early on every dashboard page to apply theme with no flash */
export function initTheme() {
  auth.onAuthStateChanged(async (user) => {
    await loadAndApplyTheme();
  });

  // Apply cached theme immediately before auth resolves
  const cacheKey = "theme"; // fallback key before uid is known
  const cached   = localStorage.getItem(cacheKey) || "pastel";
  applyTheme(cached);
}
