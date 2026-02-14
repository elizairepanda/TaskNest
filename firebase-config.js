// Import the functions you need from the CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyB_tp3Aaa23H2WUdjFLjIVakKJd9XYxUr0",
  authDomain: "tasknest-e6743.firebaseapp.com",
  databaseURL: "https://tasknest-e6743-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "tasknest-e6743",
  storageBucket: "tasknest-e6743.firebasestorage.app",
  messagingSenderId: "908569766358",
  appId: "1:908569766358:web:8e2d7d9a30fd7da07f1c77",
  measurementId: "G-2GX2EFM3PT"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);