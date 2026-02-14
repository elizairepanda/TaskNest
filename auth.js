// Authentication Logic

import { auth } from "./firebase-config.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail
} from
  "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// REGISTER
export async function register(email, password) {
  await createUserWithEmailAndPassword(auth, email, password);
}

// LOGIN
export async function login(email, password) {
  await signInWithEmailAndPassword(auth, email, password);
}

// LOGOUT
export async function logout() {
  await signOut(auth);
  window.location.href = "login.html";
}

// RESET PASSWORD
export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email);
}


// Register Form Handler
const registerForm = document.getElementById('registerForm');
if (registerForm) {
  registerForm.addEventListener('submit', async function (e) {
    e.preventDefault();

    const fullName = document.getElementById('fullname').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const dob = document.getElementById('dob').value;

    // Validation
    if (!fullName || !email || !password || !dob) {
      showMessage('Please fill in all fields.', 'error');
      return;
    }

    if (password.length < 6) {
      showMessage('Password must be at least 6 characters long.', 'error');
      return;
    }

    try {
      await register(email, password);
      showMessage('Account created successfully! Redirecting to login...', 'success');
      setTimeout(() => {
        window.location.href = 'login.html';
      }, 1500);
    } catch (error) {
      showMessage(error.message, 'error');
    }
  });
}

// Forgot Password Form Handler
const forgotForm = document.getElementById('forgotForm');
if (forgotForm) {
  forgotForm.addEventListener('submit', async function (e) {
    e.preventDefault();

    const email = document.getElementById('email').value.trim();

    try {
      await resetPassword(email);
      showMessage("Password reset email sent! Check your inbox.", 'success');
    } catch (error) {
      showMessage(error.message, 'error');
    }
  });
}

// Show Message Helper
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