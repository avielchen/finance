/**
 * nav.js — Financially shared navigation module
 * Handles: auth guard, sidebar rendering, module show/hide, terminology, user chip
 * Usage: <script type="module" src="nav.js"></script>
 * Add data-page="pageName" to <body> to highlight correct nav item
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBEcPce9nVsnleQ2A76dJUiLm-vyD2jGaU",
  authDomain: "financially-49172.firebaseapp.com",
  projectId: "financially-49172",
  storageBucket: "financially-49172.firebasestorage.app",
  messagingSenderId: "673197823318",
  appId: "1:673197823318:web:d03c5cc42e39d2fad332f7"
};

let _app, _auth;
function getApp() { if (!_app) _app = initializeApp(firebaseConfig); return _app; }
export function getFirebaseAuth() { if (!_auth) _auth = getAuth(getApp()); return _auth; }

// ── DEFAULT SETTINGS (used if nothing saved yet) ──────────────────────────
const DEFAULTS = {
  // Module visibility: true = shown in sidebar
  modules: {
    tuition:   true,
    donations: true,
    payments:  true,
    vendors:   true,
    students:  true,
    parents:   true,
    reports:   true,
  },
  // Terminology: what each menu item is called
  terms: {
    tuition:   'Tuition',
    donations: 'Donations',
    payments:  'Payments',
    vendors:   'Vendors',
    students:  'Students',
    parents:   'Parents',
    reports:   'Reports',
    dashboard: 'Dashboard',
    // Singular forms used in headings
    student:   'Student',
    parent:    'Parent',
    vendor:    'Vendor',
  },
  // Date preference: 'today' | 'last' | 'blank'
  datePref: 'today',
  // Invoice number
  invoicePrefix: 'INV-',
  invoiceNext: 1049,
  // Payment number
  paymentPrefix: 'PAY-',
  paymentNext: 42,
  // Org name
  orgName: 'My Organization',
};

// ── LOAD / SAVE SETTINGS ─────────────────────────────────────────────────
export function loadSettings() {
  try {
    const raw = localStorage.getItem('ft_settings');
    if (!raw) return structuredClone(DEFAULTS);
    const saved = JSON.parse(raw);
    // Deep merge saved over defaults
    return {
      modules: { ...DEFAULTS.modules, ...saved.modules },
      terms:   { ...DEFAULTS.terms,   ...saved.terms   },
      datePref:       saved.datePref       ?? DEFAULTS.datePref,
      invoicePrefix:  saved.invoicePrefix  ?? DEFAULTS.invoicePrefix,
      invoiceNext:    saved.invoiceNext    ?? DEFAULTS.invoiceNext,
      paymentPrefix:  saved.paymentPrefix  ?? DEFAULTS.paymentPrefix,
      paymentNext:    saved.paymentNext    ?? DEFAULTS.paymentNext,
      orgName:        saved.orgName        ?? DEFAULTS.orgName,
    };
  } catch { return structuredClone(DEFAULTS); }
}

export function saveSettings(settings) {
  localStorage.setItem('ft_settings', JSON.stringify(settings));
  // Dispatch event so any open page can react
  window.dispatchEvent(new CustomEvent('ft-settings-changed', { detail: settings }));
}

export function getSetting(key) {
  return loadSettings()[key];
}

// ── NAV DEFINITION ────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { page: 'dashboard', href: 'index.html',    icon: '⊞', moduleKey: null       },
  { page: 'tuition',   href: 'tuition.html',  icon: '📄', moduleKey: 'tuition'  },
  { page: 'donations', href: 'donations.html',icon: '🤝', moduleKey: 'donations'},
  { page: 'payments',  href: 'payments.html', icon: '💳', moduleKey: 'payments' },
  { page: 'vendors',   href: 'vendors.html',  icon: '🏢', moduleKey: 'vendors'  },
  null, // divider
  { page: 'students',  href: 'students.html', icon: '🎓', moduleKey: 'students' },
  { page: 'parents',   href: 'parents.html',  icon: '👨‍👩‍👧', moduleKey: 'parents'  },
  null, // divider
  { page: 'reports',   href: 'reports.html',  icon: '↗',  moduleKey: 'reports'  },
  { page: 'settings',  href: 'settings.html', icon: '⚙',  moduleKey: null       },
];

// ── RENDER SIDEBAR ────────────────────────────────────────────────────────
function renderSidebar(currentPage, settings) {
  const existing = document.getElementById('sidebar');
  if (!existing) return;

  const { modules, terms, orgName } = settings;

  // Group nav items into sections separated by nulls
  let sections = [[]];
  NAV_ITEMS.forEach(item => {
    if (item === null) sections.push([]);
    else sections[sections.length - 1].push(item);
  });

  const sectionsHTML = sections.map(sec => {
    const items = sec.map(item => {
      // Hide if module disabled
      if (item.moduleKey && !modules[item.moduleKey]) return '';
      const isActive = item.page === currentPage;
      const label = terms[item.page] || item.page;
      return `<a class="ni${isActive ? ' active' : ''}" href="${item.href}" data-nav="${item.page}">
        <span class="nic">${item.icon}</span>
        <span class="nl">${label}</span>
      </a>`;
    }).join('');
    if (!items.trim()) return '';
    return `<div class="nav-sec">${items}</div>`;
  }).join('');

  existing.innerHTML = `
    <div class="sidebar-top">
      <button class="hbg" onclick="window._ftToggleSidebar()"><span></span><span></span><span></span></button>
      <div class="s-logo">${orgName}</div>
    </div>
    ${sectionsHTML}
    <div style="margin-top:auto;padding:12px 0;border-top:1px solid var(--border);">
      <div id="user-chip" style="display:flex;align-items:center;justify-content:center;"></div>
    </div>`;
}

// ── SIDEBAR TOGGLE (global) ───────────────────────────────────────────────
let _sidebarOpen = false;
window._ftToggleSidebar = function() {
  _sidebarOpen = !_sidebarOpen;
  const s = document.getElementById('sidebar');
  const m = document.querySelector('.main');
  if (s) s.classList.toggle('open', _sidebarOpen);
  // Update action bar left if it exists
  const ab = document.querySelector('.action-bar');
  if (ab) ab.style.left = _sidebarOpen ? 'var(--se)' : 'var(--sc)';
};

// ── USER CHIP ─────────────────────────────────────────────────────────────
function renderUserChip(user) {
  const chip = document.getElementById('user-chip');
  if (!chip) return;
  const photo = user.photoURL;
  const name = user.displayName || user.email || 'User';
  const initials = name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
  const settings = loadSettings();
  const orgName = settings.orgName || 'My Organization';
  const orgId = localStorage.getItem('ft_orgId') || '';

  chip.innerHTML = `
    <div style="position:relative;width:100%;display:flex;justify-content:center;">
      <div onclick="document.getElementById('user-menu').classList.toggle('hidden')"
        style="cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px;padding:6px;border-radius:8px;transition:background .15s;width:100%;"
        onmouseover="this.style.background='var(--s2)'" onmouseout="this.style.background=''">
        ${photo
          ? `<img src="${photo}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;border:2px solid var(--al);" alt="">`
          : `<div style="width:28px;height:28px;border-radius:50%;background:var(--accent);color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;">${initials}</div>`
        }
      </div>
      <div id="user-menu" class="hidden"
        style="position:fixed;bottom:60px;left:8px;width:240px;background:#fff;border:1px solid var(--border2);border-radius:10px;padding:6px;z-index:300;box-shadow:0 4px 20px rgba(0,0,0,.14);">

        <!-- User info -->
        <div style="padding:8px 10px;border-bottom:1px solid var(--border);margin-bottom:4px;">
          <div style="font-size:12.5px;font-weight:700;">${name}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:1px;word-break:break-all;">${user.email}</div>
        </div>

        <!-- Org block -->
        <div style="padding:7px 10px;border-bottom:1px solid var(--border);margin-bottom:4px;">
          <div style="font-size:10px;font-weight:700;color:var(--muted2);text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px;">Organization</div>
          <div style="font-size:12.5px;font-weight:600;color:var(--accent);display:flex;align-items:center;gap:6px;">
            <span style="width:8px;height:8px;border-radius:50%;background:var(--accent);flex-shrink:0;"></span>
            ${orgName}
          </div>
          <div style="font-size:10px;color:var(--muted2);font-family:var(--mono);margin-top:2px;">${orgId.slice(0,12)}…</div>
        </div>

        <!-- Actions -->
        <a href="settings.html" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:6px;font-size:13px;color:var(--text);text-decoration:none;"
          onmouseover="this.style.background='var(--s2)'" onmouseout="this.style.background=''">⚙ Settings</a>
        <a href="onboarding.html" onclick="localStorage.removeItem('ft_orgId')"
          style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:6px;font-size:13px;color:var(--blue);text-decoration:none;"
          onmouseover="this.style.background='var(--bl)'" onmouseout="this.style.background=''">＋ Create / Switch Org</a>
        <div onclick="window._ftSignOut()"
          style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:6px;font-size:13px;color:var(--red);cursor:pointer;"
          onmouseover="this.style.background='var(--rl)'" onmouseout="this.style.background=''">→ Sign Out</div>
      </div>
    </div>`;
}

window._ftSignOut = async function() {
  await signOut(getFirebaseAuth());
  window.location.href = 'login.html';
};

// Close user menu on outside click
document.addEventListener('click', e => {
  const menu = document.getElementById('user-menu');
  if (menu && !e.target.closest('#user-chip')) menu.classList.add('hidden');
});

// ── TOPBAR USER CHIP (for pages that have #topbar-user-chip) ─────────────
function renderTopbarChip(user) {
  const chip = document.getElementById('topbar-user-chip');
  if (!chip) return;
  const photo = user.photoURL;
  const name = user.displayName || user.email || '';
  const initials = name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
  chip.innerHTML = `
    <div style="position:relative;">
      <div onclick="document.getElementById('topbar-user-menu').classList.toggle('hidden')"
        style="display:flex;align-items:center;gap:7px;padding:4px 10px 4px 4px;background:var(--s2);border:1px solid var(--border);border-radius:20px;cursor:pointer;">
        ${photo
          ? `<img src="${photo}" style="width:22px;height:22px;border-radius:50%;object-fit:cover;" alt="">`
          : `<div style="width:22px;height:22px;border-radius:50%;background:var(--accent);color:#fff;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;">${initials}</div>`
        }
        <span style="font-size:12px;font-weight:600;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name.split(' ')[0]}</span>
      </div>
      <div id="topbar-user-menu" class="hidden"
        style="position:absolute;top:calc(100%+6px);right:0;background:#fff;border:1px solid var(--border2);border-radius:10px;padding:6px;min-width:200px;z-index:300;box-shadow:0 4px 16px rgba(0,0,0,.1);">
        <div style="padding:7px 10px;border-bottom:1px solid var(--border);margin-bottom:4px;">
          <div style="font-size:12px;font-weight:600;">${name}</div>
          <div style="font-size:10.5px;color:var(--muted);word-break:break-all;margin-top:1px;">${user.email}</div>
        </div>
        <a href="settings.html" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:6px;font-size:12.5px;color:var(--text);text-decoration:none;"
          onmouseover="this.style.background='var(--s2)'" onmouseout="this.style.background=''">⚙ Settings</a>
        <div onclick="window._ftSignOut()"
          style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:6px;font-size:12.5px;color:var(--red);cursor:pointer;"
          onmouseover="this.style.background='var(--rl)'" onmouseout="this.style.background=''">→ Sign Out</div>
      </div>
    </div>`;
}

// Close topbar menu on outside click
document.addEventListener('click', e => {
  const menu = document.getElementById('topbar-user-menu');
  if (menu && !e.target.closest('#topbar-user-chip')) menu.classList.add('hidden');
});

// ── APPLY TERMINOLOGY to the page ─────────────────────────────────────────
// Any element with data-term="key" gets its text replaced
function applyTerminology(terms) {
  document.querySelectorAll('[data-term]').forEach(el => {
    const key = el.dataset.term;
    if (terms[key]) el.textContent = terms[key];
  });
  // Also update document title if it contains known terms
  const titleMap = {
    'Students': terms.students,
    'Parents':  terms.parents,
    'Tuition':  terms.tuition,
    'Vendors':  terms.vendors,
    'Donations':terms.donations,
  };
  let title = document.title;
  Object.entries(titleMap).forEach(([from, to]) => {
    if (to && from !== to) title = title.replace(from, to);
  });
  document.title = title;
}

// ── MAIN INIT ─────────────────────────────────────────────────────────────
export async function initNav(options = {}) {
  const {
    requireLogin = true,
    requireOrg = true,      // redirect to onboarding if no org set
    currentPage = document.body.dataset.page || 'dashboard',
    showLoadingScreen = false,
  } = options;

  const settings = loadSettings();

  // Render sidebar immediately with cached settings
  renderSidebar(currentPage, settings);
  applyTerminology(settings.terms);

  if (showLoadingScreen) {
    const ls = document.getElementById('loading-state');
    if (ls) ls.style.display = 'flex';
    const app = document.getElementById('app');
    if (app) app.style.display = 'none';
  }

  return new Promise((resolve) => {
    const auth = getFirebaseAuth();
    onAuthStateChanged(auth, async user => {
      // Not logged in
      if (!user && requireLogin) {
        window.location.href = 'login.html';
        return;
      }

      // Logged in but no org set — go to onboarding
      const orgId = localStorage.getItem('ft_orgId');
      if (user && requireOrg && !orgId) {
        window.location.href = 'onboarding.html';
        return;
      }

      if (showLoadingScreen) {
        const ls = document.getElementById('loading-state');
        if (ls) ls.style.display = 'none';
        const app = document.getElementById('app');
        if (app) app.style.display = 'flex';
      }

      if (user) {
        renderUserChip(user);
        renderTopbarChip(user);

        // Try to load org settings from Firestore if orgId available
        // Falls back silently to localStorage if offline
        if (orgId) {
          try {
            const { getOrgSettings } = await import('./db.js');
            const orgSettings = await getOrgSettings(orgId);
            if (orgSettings) {
              // Merge Firestore settings over localStorage
              const merged = { ...loadSettings(), ...orgSettings };
              saveSettings(merged);
              renderSidebar(currentPage, merged);
              applyTerminology(merged.terms || merged.terms);
            }
          } catch (e) {
            // Offline or permission error — use cached localStorage settings
            console.warn('Could not load org settings from Firestore, using cache:', e.message);
          }
        }
      }

      resolve(user);
    });
  });
}

// ── LISTEN FOR SETTINGS CHANGES (live reload on same tab) ─────────────────
window.addEventListener('ft-settings-changed', (e) => {
  const settings = e.detail;
  renderSidebar(document.body.dataset.page || 'dashboard', settings);
  applyTerminology(settings.terms);
});

// ── EXPORT HELPERS FOR USE IN PAGES ──────────────────────────────────────
export function getNextInvoiceNumber() {
  const s = loadSettings();
  const num = s.invoiceNext;
  const formatted = s.invoicePrefix + String(num).padStart(4, '0');
  return formatted;
}

export function getNextPaymentNumber() {
  const s = loadSettings();
  const num = s.paymentNext;
  const formatted = s.paymentPrefix + String(num).padStart(4, '0');
  return formatted;
}

export function bumpInvoiceNumber() {
  const s = loadSettings();
  s.invoiceNext = (s.invoiceNext || 1049) + 1;
  saveSettings(s);
}

export function bumpPaymentNumber() {
  const s = loadSettings();
  s.paymentNext = (s.paymentNext || 42) + 1;
  saveSettings(s);
}

export function getDateDefault() {
  return loadSettings().datePref || 'today';
}

export function getDefaultDateValue(lastEntered) {
  const pref = getDateDefault();
  if (pref === 'today') return new Date().toISOString().split('T')[0];
  if (pref === 'last' && lastEntered) return lastEntered;
  return '';
}
