/**
 * db.js — Financially shared Firestore module
 *
 * DATA MODEL:
 * /orgs/{orgId}/                          — org settings & metadata
 * /orgs/{orgId}/members/{uid}             — user membership + role
 * /orgs/{orgId}/contacts/{contactId}      — students, parents, patients, payers, vendors, donors
 * /orgs/{orgId}/invoices/{invoiceId}      — invoices (linked to a contact)
 * /orgs/{orgId}/invoices/{id}/items       — line items subcollection
 * /orgs/{orgId}/invoices/{id}/installments— installment plan subcollection
 * /orgs/{orgId}/payments/{paymentId}      — payment records
 * /orgs/{orgId}/donations/{donationId}    — donation records
 * /orgs/{orgId}/funds/{fundId}            — donation funds/campaigns
 * /orgs/{orgId}/settings/main             — org settings document
 *
 * SECURITY RULES (paste into Firebase Console → Firestore → Rules):
 *
 * rules_version = '2';
 * service cloud.firestore {
 *   match /databases/{database}/documents {
 *
 *     // Helper: is user a member of this org?
 *     function isMember(orgId) {
 *       return request.auth != null &&
 *         exists(/databases/$(database)/documents/orgs/$(orgId)/members/$(request.auth.uid));
 *     }
 *
 *     // Helper: get member's role
 *     function role(orgId) {
 *       return get(/databases/$(database)/documents/orgs/$(orgId)/members/$(request.auth.uid)).data.role;
 *     }
 *
 *     // Helper: can write (admin or accountant, not viewer)
 *     function canWrite(orgId) {
 *       return isMember(orgId) && role(orgId) in ['owner', 'admin', 'accountant'];
 *     }
 *
 *     // Org metadata — members can read, only owners can write
 *     match /orgs/{orgId} {
 *       allow read: if isMember(orgId);
 *       allow write: if isMember(orgId) && role(orgId) == 'owner';
 *     }
 *
 *     // Members subcollection — members can read their own, owners manage all
 *     match /orgs/{orgId}/members/{uid} {
 *       allow read: if isMember(orgId);
 *       allow write: if isMember(orgId) && (role(orgId) == 'owner' || request.auth.uid == uid);
 *       allow create: if isMember(orgId) && role(orgId) in ['owner', 'admin'];
 *     }
 *
 *     // All other org data — members can read, accountants+ can write
 *     match /orgs/{orgId}/{collection}/{docId} {
 *       allow read: if isMember(orgId);
 *       allow write: if canWrite(orgId);
 *     }
 *
 *     match /orgs/{orgId}/{collection}/{docId}/{sub}/{subId} {
 *       allow read: if isMember(orgId);
 *       allow write: if canWrite(orgId);
 *     }
 *   }
 * }
 */

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  collection, query, where, orderBy, limit, serverTimestamp, writeBatch, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBEcPce9nVsnleQ2A76dJUiLm-vyD2jGaU",
  authDomain: "financially-49172.firebaseapp.com",
  projectId: "financially-49172",
  storageBucket: "financially-49172.firebasestorage.app",
  messagingSenderId: "673197823318",
  appId: "1:673197823318:web:d03c5cc42e39d2fad332f7"
};

let _app, _db;
function getApp() {
  if (!_app) {
    _app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  }
  return _app;
}
export function getDB() {
  if (!_db) _db = getFirestore(getApp());
  return _db;
}
export function getFirebaseAuth() {
  return getAuth(getApp());
}

// ── ORG CONTEXT ───────────────────────────────────────────────────────────
// Current org is stored in localStorage so it persists across pages
// In the future this could be per-session for multi-org users

export function getCurrentOrgId() {
  return localStorage.getItem('ft_orgId') || null;
}

export function setCurrentOrgId(orgId) {
  localStorage.setItem('ft_orgId', orgId);
  window.dispatchEvent(new CustomEvent('ft-org-changed', { detail: { orgId } }));
}

export function clearCurrentOrg() {
  localStorage.removeItem('ft_orgId');
}

// ── ORG HELPERS ───────────────────────────────────────────────────────────

export async function getOrg(orgId) {
  const snap = await getDoc(doc(getDB(), 'orgs', orgId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function updateOrg(orgId, data) {
  await updateDoc(doc(getDB(), 'orgs', orgId), {
    ...data,
    updatedAt: serverTimestamp()
  });
}

/**
 * Create a new org. Returns the new orgId.
 * Also adds the creator as 'owner' in the members subcollection.
 */
export async function createOrg({ name, template, uid, displayName, email }) {
  const db = getDB();
  const orgRef = doc(collection(db, 'orgs'));
  const orgId = orgRef.id;

  const batch = writeBatch(db);

  // Org document
  batch.set(orgRef, {
    name,
    template,           // 'school' | 'dental' | 'gym' | 'nonprofit' | 'other'
    createdAt: serverTimestamp(),
    createdBy: uid,
  });

  // Creator as owner
  batch.set(doc(db, 'orgs', orgId, 'members', uid), {
    uid,
    displayName: displayName || '',
    email: email || '',
    role: 'owner',
    joinedAt: serverTimestamp(),
  });

  // Default settings from template
  const defaultSettings = getTemplateSettings(template);
  batch.set(doc(db, 'orgs', orgId, 'settings', 'main'), defaultSettings);

  await batch.commit();
  return orgId;
}

/**
 * Get all orgs the current user belongs to.
 * Returns array of { orgId, orgName, role }
 */
export async function getUserOrgs(uid) {
  const db = getDB();
  // Query all orgs where this uid is a member
  // Note: Firestore doesn't support collection group queries without an index
  // We store a /users/{uid}/orgs/{orgId} mirror for efficient lookup
  const snap = await getDocs(collection(db, 'users', uid, 'orgs'));
  if (snap.empty) return [];
  return snap.docs.map(d => ({ orgId: d.id, ...d.data() }));
}

/**
 * Add user org membership mirror (called when joining/creating an org)
 */
export async function addUserOrgMirror(uid, orgId, orgName, role) {
  const db = getDB();
  await setDoc(doc(db, 'users', uid, 'orgs', orgId), {
    orgName,
    role,
    joinedAt: serverTimestamp(),
  });
}

/**
 * Get a member's role in an org
 */
export async function getMemberRole(orgId, uid) {
  const snap = await getDoc(doc(getDB(), 'orgs', orgId, 'members', uid));
  return snap.exists() ? snap.data().role : null;
}

/**
 * List all members of an org
 */
export async function getOrgMembers(orgId) {
  const snap = await getDocs(collection(getDB(), 'orgs', orgId, 'members'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Invite a user to an org (creates a pending invite document)
 */
export async function inviteMember(orgId, email, role = 'accountant', invitedBy) {
  const ref = doc(collection(getDB(), 'orgs', orgId, 'invites'));
  await setDoc(ref, {
    email,
    role,
    invitedBy,
    invitedAt: serverTimestamp(),
    status: 'pending',
  });
  return ref.id;
}

// ── TEMPLATE SETTINGS ─────────────────────────────────────────────────────

export function getTemplateSettings(template) {
  const base = {
    modules: {
      tuition: true, donations: true, payments: true,
      vendors: true, students: true, parents: true, reports: true,
    },
    datePref: 'today',
    invoicePrefix: 'INV-',
    invoiceNext: 1001,
    paymentPrefix: 'PAY-',
    paymentNext: 1,
    chargeTypes: [],
    creditTypes: [],
    paymentFees: [
      { method: 'Credit Card', flat: 0, pct: 2.5 },
      { method: 'Bank Transfer', flat: 0, pct: 0 },
      { method: 'Check', flat: 0, pct: 0 },
      { method: 'Cash', flat: 0, pct: 0 },
    ],
    instTypes: ['Deposit', 'Registration Fee', 'Installment', 'Final Payment'],
    funds: [],
  };

  const templates = {
    school: {
      terms: {
        dashboard: 'Dashboard', tuition: 'Tuition', donations: 'Donations',
        payments: 'Payments', vendors: 'Vendors', students: 'Students',
        parents: 'Parents', reports: 'Reports',
        student: 'Student', parent: 'Parent', vendor: 'Vendor',
        payer: 'Parent',
      },
      chargeTypes: [
        { name: 'Tuition', amount: 0, active: true },
        { name: 'Meal Plan', amount: 0, active: true },
        { name: 'Dorm / Housing', amount: 0, active: true },
        { name: 'Technology Fee', amount: 0, active: true },
        { name: 'Registration', amount: 0, active: true },
        { name: 'Activity Fee', amount: 0, active: true },
      ],
      creditTypes: [
        { name: 'Merit Scholarship', amount: null, active: true },
        { name: 'Financial Aid', amount: null, active: true },
        { name: 'Sibling Discount', amount: null, active: true },
      ],
    },
    dental: {
      terms: {
        dashboard: 'Dashboard', tuition: 'Billing', donations: 'Donations',
        payments: 'Payments', vendors: 'Vendors', students: 'Patients',
        parents: 'Payers', reports: 'Reports',
        student: 'Patient', parent: 'Payer', vendor: 'Vendor',
        payer: 'Payer',
      },
      modules: { ...base.modules, donations: false },
      chargeTypes: [
        { name: 'Consultation', amount: 0, active: true },
        { name: 'Cleaning', amount: 0, active: true },
        { name: 'X-Ray', amount: 0, active: true },
        { name: 'Filling', amount: 0, active: true },
        { name: 'Crown', amount: 0, active: true },
        { name: 'Orthodontics', amount: 0, active: true },
      ],
      creditTypes: [
        { name: 'Insurance Credit', amount: null, active: true },
        { name: 'Courtesy Discount', amount: null, active: true },
      ],
    },
    gym: {
      terms: {
        dashboard: 'Dashboard', tuition: 'Billing', donations: 'Donations',
        payments: 'Payments', vendors: 'Vendors', students: 'Members',
        parents: 'Contacts', reports: 'Reports',
        student: 'Member', parent: 'Contact', vendor: 'Vendor',
        payer: 'Contact',
      },
      modules: { ...base.modules, donations: false },
      chargeTypes: [
        { name: 'Monthly Membership', amount: 0, active: true },
        { name: 'Annual Membership', amount: 0, active: true },
        { name: 'Personal Training', amount: 0, active: true },
        { name: 'Group Class', amount: 0, active: true },
        { name: 'Locker Rental', amount: 0, active: true },
      ],
      creditTypes: [
        { name: 'Promo Credit', amount: null, active: true },
        { name: 'Referral Discount', amount: null, active: true },
      ],
    },
    nonprofit: {
      terms: {
        dashboard: 'Dashboard', tuition: 'Billing', donations: 'Donations',
        payments: 'Payments', vendors: 'Vendors', students: 'Members',
        parents: 'Contacts', reports: 'Reports',
        student: 'Member', parent: 'Contact', vendor: 'Vendor',
        payer: 'Contact',
      },
      chargeTypes: [
        { name: 'Membership Dues', amount: 0, active: true },
        { name: 'Program Fee', amount: 0, active: true },
        { name: 'Event Registration', amount: 0, active: true },
      ],
      creditTypes: [
        { name: 'Grant Credit', amount: null, active: true },
        { name: 'Scholarship', amount: null, active: true },
      ],
    },
    other: {
      terms: {
        dashboard: 'Dashboard', tuition: 'Invoices', donations: 'Donations',
        payments: 'Payments', vendors: 'Vendors', students: 'Contacts',
        parents: 'Payers', reports: 'Reports',
        student: 'Contact', parent: 'Payer', vendor: 'Vendor',
        payer: 'Payer',
      },
      chargeTypes: [],
      creditTypes: [],
    },
  };

  const tpl = templates[template] || templates.other;
  return {
    ...base,
    terms: tpl.terms,
    modules: { ...base.modules, ...(tpl.modules || {}) },
    chargeTypes: tpl.chargeTypes || base.chargeTypes,
    creditTypes: tpl.creditTypes || base.creditTypes,
  };
}

// ── ORG SETTINGS ─────────────────────────────────────────────────────────

export async function getOrgSettings(orgId) {
  const snap = await getDoc(doc(getDB(), 'orgs', orgId, 'settings', 'main'));
  return snap.exists() ? snap.data() : getTemplateSettings('other');
}

export async function saveOrgSettings(orgId, settings) {
  await setDoc(
    doc(getDB(), 'orgs', orgId, 'settings', 'main'),
    { ...settings, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

// ── CONTACTS ─────────────────────────────────────────────────────────────

export async function getContacts(orgId, { type, familyId, search } = {}) {
  const db = getDB();
  let q = collection(db, 'orgs', orgId, 'contacts');
  const filters = [];
  if (type) filters.push(where('type', '==', type));
  if (familyId) filters.push(where('familyId', '==', familyId));
  if (filters.length) q = query(q, ...filters, orderBy('lastName'));
  else q = query(q, orderBy('lastName'));
  const snap = await getDocs(q);
  let results = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (search) {
    const s = search.toLowerCase();
    results = results.filter(c =>
      (c.firstName + ' ' + c.lastName).toLowerCase().includes(s) ||
      c.email?.toLowerCase().includes(s)
    );
  }
  return results;
}

export async function getContact(orgId, contactId) {
  const snap = await getDoc(doc(getDB(), 'orgs', orgId, 'contacts', contactId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function saveContact(orgId, contactId, data) {
  const ref = contactId
    ? doc(getDB(), 'orgs', orgId, 'contacts', contactId)
    : doc(collection(getDB(), 'orgs', orgId, 'contacts'));
  await setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true });
  return ref.id;
}

export async function deleteContact(orgId, contactId) {
  await deleteDoc(doc(getDB(), 'orgs', orgId, 'contacts', contactId));
}

// ── INVOICES ─────────────────────────────────────────────────────────────

export async function getInvoices(orgId, { contactId, status, schoolYear } = {}) {
  const db = getDB();
  let q = collection(db, 'orgs', orgId, 'invoices');
  const filters = [];
  if (contactId) filters.push(where('contactId', '==', contactId));
  if (status) filters.push(where('status', '==', status));
  if (schoolYear) filters.push(where('schoolYear', '==', schoolYear));
  filters.push(orderBy('createdAt', 'desc'));
  q = query(q, ...filters);
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getInvoice(orgId, invoiceId) {
  const snap = await getDoc(doc(getDB(), 'orgs', orgId, 'invoices', invoiceId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function saveInvoice(orgId, invoiceId, data) {
  const ref = invoiceId
    ? doc(getDB(), 'orgs', orgId, 'invoices', invoiceId)
    : doc(collection(getDB(), 'orgs', orgId, 'invoices'));
  await setDoc(ref, {
    ...data,
    updatedAt: serverTimestamp(),
    createdAt: data.createdAt || serverTimestamp(),
  }, { merge: true });
  return ref.id;
}

export async function deleteInvoice(orgId, invoiceId) {
  await deleteDoc(doc(getDB(), 'orgs', orgId, 'invoices', invoiceId));
}

// ── PAYMENTS ─────────────────────────────────────────────────────────────

export async function getPayments(orgId, { invoiceId, contactId } = {}) {
  const db = getDB();
  let q = collection(db, 'orgs', orgId, 'payments');
  const filters = [orderBy('date', 'desc')];
  if (invoiceId) filters.unshift(where('invoiceId', '==', invoiceId));
  if (contactId) filters.unshift(where('contactId', '==', contactId));
  q = query(q, ...filters);
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function savePayment(orgId, data) {
  const db = getDB();
  const ref = doc(collection(db, 'orgs', orgId, 'payments'));
  await setDoc(ref, {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

// ── DONATIONS ────────────────────────────────────────────────────────────

export async function getFunds(orgId) {
  const snap = await getDocs(collection(getDB(), 'orgs', orgId, 'funds'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function saveFund(orgId, fundId, data) {
  const ref = fundId
    ? doc(getDB(), 'orgs', orgId, 'funds', fundId)
    : doc(collection(getDB(), 'orgs', orgId, 'funds'));
  await setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true });
  return ref.id;
}

export async function getDonations(orgId, { fundId, contactId } = {}) {
  const db = getDB();
  let q = collection(db, 'orgs', orgId, 'donations');
  const filters = [orderBy('date', 'desc')];
  if (fundId) filters.unshift(where('fundId', '==', fundId));
  if (contactId) filters.unshift(where('contactId', '==', contactId));
  q = query(q, ...filters);
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function saveDonation(orgId, data) {
  const ref = doc(collection(getDB(), 'orgs', orgId, 'donations'));
  await setDoc(ref, { ...data, createdAt: serverTimestamp() });
  return ref.id;
}

// ── DASHBOARD STATS ───────────────────────────────────────────────────────

export async function getDashboardStats(orgId) {
  const db = getDB();
  // Get all invoices
  const invoicesSnap = await getDocs(
    query(collection(db, 'orgs', orgId, 'invoices'), orderBy('createdAt', 'desc'), limit(100))
  );
  const invoices = invoicesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  let totalOutstanding = 0;
  let totalOverdue = 0;
  const today = new Date();

  invoices.forEach(inv => {
    const bal = (inv.totalAmount || 0) - (inv.totalPaid || 0);
    if (bal > 0) {
      totalOutstanding += bal;
      if (inv.dueDate && new Date(inv.dueDate) < today) {
        totalOverdue += bal;
      }
    }
  });

  // Recent payments this month
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
  const paymentsSnap = await getDocs(
    query(
      collection(db, 'orgs', orgId, 'payments'),
      where('date', '>=', monthStart),
      orderBy('date', 'desc')
    )
  );
  const collectedThisMonth = paymentsSnap.docs.reduce((s, d) => s + (d.data().amount || 0), 0);

  return {
    totalOutstanding,
    totalOverdue,
    collectedThisMonth,
    recentInvoices: invoices.slice(0, 5),
    openInvoiceCount: invoices.filter(i => i.status !== 'paid').length,
    overdueCount: invoices.filter(i => {
      const bal = (i.totalAmount || 0) - (i.totalPaid || 0);
      return bal > 0 && i.dueDate && new Date(i.dueDate) < today;
    }).length,
  };
}

// ── REAL-TIME LISTENER ────────────────────────────────────────────────────

export function listenToOrgSettings(orgId, callback) {
  return onSnapshot(
    doc(getDB(), 'orgs', orgId, 'settings', 'main'),
    snap => { if (snap.exists()) callback(snap.data()); }
  );
}

// ── UTILS ─────────────────────────────────────────────────────────────────

export function fmt(n) {
  return (parseFloat(n) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function fmtDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T12:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  });
}

export function generateId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
