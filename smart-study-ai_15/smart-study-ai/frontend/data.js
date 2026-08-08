// Smart Study AI — client data layer, v2 (talks to the Express + MongoDB backend)
//
// IMPORTANT: every function that used to be synchronous (e.g. `var r = SSAI.login(...)`)
// is now ASYNC and returns a Promise. Every page's inline <script> needs small edits —
// see MIGRATION_NOTES.md for the exact before/after for each page.
//
// PDF files still live in the browser's IndexedDB exactly as before — only
// users/notes/ratings/bookmarks/OTP moved to the server.
(function () {
  const API_BASE = window.SSAI_API_BASE || 'http://localhost:4000/api';
  const TOKEN_KEY = 'ssai_token';
  const SESSION_KEY = 'ssai_session';
  const FILE_DB_NAME = 'ssai_files_db';
  const FILE_STORE = 'files';

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
  function clearToken() { localStorage.removeItem(TOKEN_KEY); }

  async function api(path, options) {
    options = options || {};
    const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    const token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;

    const res = await fetch(API_BASE + path, Object.assign({}, options, { headers }));
    let data;
    try { data = await res.json(); } catch (e) { data = { ok: false, error: 'Server returned an invalid response.' }; }
    if (!res.ok && data.ok === undefined) data.ok = false;
    return data;
  }

  // ---------- Session (unchanged shape — still a synchronous local cache) ----------
  function getSession() {
    try { const raw = localStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  }
  function setSession(u) { localStorage.setItem(SESSION_KEY, JSON.stringify(u)); }
  function clearSession() { localStorage.removeItem(SESSION_KEY); clearToken(); }

  function requireRole(roles, loginPage) {
    loginPage = loginPage || 'login.html';
    const session = getSession();
    if (!session || (roles && roles.indexOf(session.role) === -1)) {
      window.location.href = loginPage;
      return null;
    }
    return session;
  }

  // ---------- Auth ----------
  async function login(email, password, role) {
    const result = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password, role }) });
    if (result.ok) { setToken(result.token); setSession(result.user); }
    return result;
  }

  async function signup(name, email, roll, semester, password, confirmPassword, role) {
    return api('/auth/signup', { method: 'POST', body: JSON.stringify({ name, email, roll, semester, password, confirmPassword, role }) });
  }

  async function loginWithGoogle(profile, role) {
    const result = await api('/auth/google', { method: 'POST', body: JSON.stringify({ name: profile.name, email: profile.email, picture: profile.picture, role }) });
    if (result.ok) { setToken(result.token); setSession(result.user); }
    return result;
  }

  async function findUser(email) {
    // Only used for admin-side lookups in the old code; route via getUsers() + filter if needed elsewhere.
    const result = await api('/users');
    if (!result.ok) return null;
    return result.users.find(u => u.email.toLowerCase() === String(email).toLowerCase());
  }

  // ---------- Forgot password / OTP ----------
  async function requestPasswordResetOtp(email) {
    return api('/auth/request-otp', { method: 'POST', body: JSON.stringify({ email }) });
  }
  async function verifyPasswordResetOtp(email, otp) {
    return api('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ email, otp }) });
  }
  async function resetPasswordWithOtp(email, otp, newPassword) {
    return api('/auth/reset-password', { method: 'POST', body: JSON.stringify({ email, otp, newPassword }) });
  }

  // ---------- Notes ----------
  async function getNotes() {
    const result = await api('/notes');
    return result.ok ? result.notes : [];
  }
  async function addNote(note) {
    const result = await api('/notes', { method: 'POST', body: JSON.stringify(note) });
    return result.ok ? result.note : null;
  }
  async function approveNote(id, status, feedback) {
    const result = await api('/notes/' + id + '/approve', { method: 'PATCH', body: JSON.stringify({ status, feedback }) });
    return result.ok ? result.note : null;
  }
  async function updateNote(id, changes) {
    const result = await api('/notes/' + id, { method: 'PATCH', body: JSON.stringify(changes) });
    return result.ok ? result.note : null;
  }
  async function deleteNote(id) {
    await api('/notes/' + id, { method: 'DELETE' });
    await deleteNoteFile(id).catch(function () {});
  }
  async function searchNotes(query) {
    const result = await api('/notes/search?q=' + encodeURIComponent(query || ''));
    return result.ok ? result.notes : [];
  }
  async function getRecommendations(limit) {
    const result = await api('/notes/recommendations' + (limit ? '?limit=' + limit : ''));
    return result.ok ? result.notes : [];
  }
  function ratingAvg(n) { return n.ratingCount ? (n.ratingSum / n.ratingCount) : 0; }
  async function rateNote(id, stars) {
    const result = await api('/notes/' + id + '/rate', { method: 'POST', body: JSON.stringify({ stars }) });
    return result.ok ? result.note : null;
  }
  function getUserRating(note, email) {
    // `note` objects returned from the API already include a `ratings` map: { email: stars }
    return (note && note.ratings && note.ratings[email]) || 0;
  }
  async function recordDownload(id) {
    const result = await api('/notes/' + id + '/download', { method: 'POST' });
    return result.ok ? result.note : null;
  }

  // ---------- Bookmarks ----------
  async function toggleBookmark(email, noteId) {
    const result = await api('/notes/' + noteId + '/bookmark', { method: 'POST' });
    return result.ok ? result.bookmarked : false;
  }
  async function getBookmarkedNotes() {
    const result = await api('/notes/bookmarks');
    return result.ok ? result.notes : [];
  }
  async function isBookmarked(email, noteId) {
    const bookmarked = await getBookmarkedNotes();
    return bookmarked.some(n => n.id === noteId);
  }

  // ---------- Users (admin) ----------
  async function getUsers() {
    const result = await api('/users');
    return result.ok ? result.users : [];
  }
  async function setUserRole(email, role) {
    return api('/users/' + encodeURIComponent(email) + '/role', { method: 'PATCH', body: JSON.stringify({ role }) });
  }
  async function deleteUser(email) {
    return api('/users/' + encodeURIComponent(email), { method: 'DELETE' });
  }
  async function createUser(user) {
    const result = await api('/users', { method: 'POST', body: JSON.stringify(user) });
    return result;
  }
  async function updateUserProfile(email, changes) {
    const result = await api('/users/me', { method: 'PATCH', body: JSON.stringify(changes) });
    if (result.ok) setSession(result.user);
    return result;
  }

  // ---------- Analytics ----------
  async function getAnalytics() {
    const result = await api('/analytics');
    return result.ok ? result : {};
  }

  // ---------- File storage (IndexedDB) — UNCHANGED from the old data.js ----------
  let dbPromise = null;
  function openFileDB() {
    if (!window.indexedDB) return Promise.reject(new Error('IndexedDB not supported in this browser.'));
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(FILE_DB_NAME, 1);
      req.onupgradeneeded = function (e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(FILE_STORE)) db.createObjectStore(FILE_STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }
  function storeNoteFile(id, file) {
    return openFileDB().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(FILE_STORE, 'readwrite');
      tx.objectStore(FILE_STORE).put({ blob: file, name: file.name, type: file.type, size: file.size }, id);
      tx.oncomplete = function () { resolve(true); };
      tx.onerror = function () { reject(tx.error); };
    }));
  }
  function getNoteFile(id) {
    return openFileDB().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(FILE_STORE, 'readonly');
      const req = tx.objectStore(FILE_STORE).get(id);
      req.onsuccess = function () { resolve(req.result || null); };
      req.onerror = function () { reject(req.error); };
    }));
  }
  function deleteNoteFile(id) {
    return openFileDB().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(FILE_STORE, 'readwrite');
      tx.objectStore(FILE_STORE).delete(id);
      tx.oncomplete = function () { resolve(true); };
      tx.onerror = function () { reject(tx.error); };
    })).catch(function () { return false; });
  }

  window.SSAI = {
    getSession, setSession, clearSession, login, signup, loginWithGoogle, requireRole, findUser,
    requestPasswordResetOtp, verifyPasswordResetOtp, resetPasswordWithOtp,
    getNotes, addNote, approveNote, updateNote, deleteNote, searchNotes,
    getRecommendations, rateNote, getUserRating, recordDownload, ratingAvg,
    getUsers, setUserRole, deleteUser, createUser, updateUserProfile,
    getBookmarks: getBookmarkedNotes, isBookmarked, toggleBookmark, getBookmarkedNotes,
    getAnalytics,
    storeNoteFile, getNoteFile, deleteNoteFile
  };

  document.addEventListener('DOMContentLoaded', function () {
    const s = getSession();
    document.querySelectorAll('.tabs a[href="login.html"]').forEach(function (a) {
      if (s) {
        a.textContent = 'Logout';
        a.addEventListener('click', function (e) {
          e.preventDefault();
          clearSession();
          window.location.href = 'login.html';
        });
      } else {
        a.textContent = 'Sign In';
      }
    });
    if (s) {
      document.querySelectorAll('[data-user-name]').forEach(el => el.textContent = s.name);
      document.querySelectorAll('[data-user-role]').forEach(el => el.textContent = s.role);
    }
  });
})();
