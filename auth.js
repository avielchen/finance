// auth.js — include this on every page to enforce login
// Usage: <script type="module" src="auth.js"></script>

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBEcPce9nVsnleQ2A76dJUiLm-vyD2jGaU",
  authDomain: "financially-49172.firebaseapp.com",
  projectId: "financially-49172",
  storageBucket: "financially-49172.firebasestorage.app",
  messagingSenderId: "673197823318",
  appId: "1:673197823318:web:d03c5cc42e39d2fad332f7",
  measurementId: "G-J2SVT6L9ZE"
};

let _app, _auth, _db;

function getFirebaseApp() {
  if (!_app) _app = initializeApp(firebaseConfig);
  return _app;
}

export function getFirebaseAuth() {
  if (!_auth) _auth = getAuth(getFirebaseApp());
  return _auth;
}

export function getFirebaseDB() {
  if (!_db) _db = getFirestore(getFirebaseApp());
  return _db;
}

// Call this on every protected page.
// Returns a promise that resolves with the user, or redirects to login.
export function requireAuth() {
  return new Promise((resolve) => {
    const auth = getFirebaseAuth();
    onAuthStateChanged(auth, user => {
      if (user) {
        resolve(user);
        renderUserChip(user);
      } else {
        window.location.href = 'login.html';
      }
    });
  });
}

// Renders the user avatar/name into #user-chip if it exists on the page
function renderUserChip(user) {
  const chip = document.getElementById('user-chip');
  if (!chip) return;
  const photo = user.photoURL;
  const name = user.displayName || user.email;
  const initials = name.split(' ').map(p => p[0]).join('').slice(0,2).toUpperCase();
  chip.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:4px 10px;border-radius:20px;background:var(--s2);border:1px solid var(--border);transition:all .15s;" onclick="document.getElementById('user-menu').classList.toggle('hidden')">
      ${photo
        ? `<img src="${photo}" style="width:24px;height:24px;border-radius:50%;object-fit:cover;" alt="">`
        : `<div style="width:24px;height:24px;border-radius:50%;background:var(--accent);color:#fff;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;">${initials}</div>`
      }
      <span style="font-size:12px;font-weight:600;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name}</span>
    </div>
    <div id="user-menu" class="hidden" style="position:absolute;top:calc(100%+6px);right:0;background:#fff;border:1px solid var(--border2);border-radius:8px;padding:5px;min-width:180px;z-index:200;box-shadow:0 4px 16px rgba(0,0,0,.1);">
      <div style="padding:8px 10px;font-size:12px;color:var(--muted);border-bottom:1px solid var(--border);margin-bottom:4px;word-break:break-all;">${user.email}</div>
      <div onclick="signOutUser()" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:5px;font-size:13px;cursor:pointer;color:var(--red);" onmouseover="this.style.background='var(--rl)'" onmouseout="this.style.background=''">
        <span>→</span> Sign Out
      </div>
    </div>`;
  chip.style.position = 'relative';
}

window.signOutUser = async function() {
  const auth = getFirebaseAuth();
  await signOut(auth);
  window.location.href = 'login.html';
};

// Close user menu on outside click
document.addEventListener('click', e => {
  const menu = document.getElementById('user-menu');
  const chip = document.getElementById('user-chip');
  if (menu && chip && !chip.contains(e.target)) menu.classList.add('hidden');
});
