// Shared UI helpers used across search / recommendation / dashboard pages
// so "Open Note", star ratings, and bookmarks behave the same everywhere.
window.SSAIUI = {
  starsHtml: function (note, userRating) {
    var filled = userRating || 0;
    var html = '<span class="star-rating" data-note-id="' + note.id + '" title="Rate this note">';
    for (var i = 1; i <= 5; i++) {
      html += '<span data-star="' + i + '" class="' + (i <= filled ? 'filled' : '') + '">★</span>';
    }
    html += '</span>';
    return html;
  },
  // `bookmarked` must be resolved ahead of time (isBookmarked/getBookmarkedNotes are
  // async against the backend) — see SSAIUI.getBookmarkedIdSet below.
  bookmarkBtnHtml: function (note, session, bookmarked) {
    var on = !!(session && bookmarked);
    return '<button type="button" class="bookmark-btn' + (on ? ' active' : '') + '" data-bookmark-id="' + note.id + '">' + (on ? '★ Saved' : '☆ Save') + '</button>';
  },
  // Fetches the current user's bookmarks once and returns a Set of note IDs,
  // so bookmarkBtnHtml can be called synchronously while building a list of cards.
  getBookmarkedIdSet: async function () {
    try {
      var saved = await window.SSAI.getBookmarkedNotes();
      return new Set(saved.map(function (n) { return n.id; }));
    } catch (e) { return new Set(); }
  },
  openBtnHtml: function (note, label) {
    var text = label || (note.hasFile ? '📄 Open PDF' : '👁 Preview');
    return '<button type="button" class="primary-btn" data-open-id="' + note.id + '">' + text + '</button>';
  },
  // Delegates open/bookmark/rate clicks for any cards rendered inside `root`.
  wireCardEvents: function (root, session, opts) {
    opts = opts || {};
    var SSAI = window.SSAI;
    root.querySelectorAll('[data-open-id]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var id = btn.getAttribute('data-open-id');
        var notes = await SSAI.getNotes();
        var note = notes.find(function (n) { return n.id === id; });
        if (!note) return;
        await SSAI.recordDownload(id);
        window.SSAIUI.openNoteFile(note);
        if (opts.onOpen) opts.onOpen(id);
      });
    });
    if (session) {
      root.querySelectorAll('[data-bookmark-id]').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          var id = btn.getAttribute('data-bookmark-id');
          var on = await SSAI.toggleBookmark(session.email, id);
          btn.textContent = on ? '★ Saved' : '☆ Save';
          btn.classList.toggle('active', on);
          if (opts.onBookmark) opts.onBookmark(id, on);
        });
      });
      root.querySelectorAll('.star-rating').forEach(function (wrap) {
        var id = wrap.getAttribute('data-note-id');
        wrap.querySelectorAll('span[data-star]').forEach(function (star) {
          star.addEventListener('click', async function () {
            var val = parseInt(star.getAttribute('data-star'), 10);
            await SSAI.rateNote(id, val, session.email);
            wrap.querySelectorAll('span[data-star]').forEach(function (s) {
              s.classList.toggle('filled', parseInt(s.getAttribute('data-star'), 10) <= val);
            });
            if (opts.onRate) opts.onRate(id, val);
          });
        });
      });
    }
  },
  // Wires a standard "Account Settings" form (#accName, #accCurrentPassword, #accNewPassword)
  // to SSAI.updateUserProfile, used identically on the student/faculty/admin dashboards.
  wireAccountForm: function (formEl, msgEl, session) {
    if (!formEl) return;
    formEl.addEventListener('submit', async function (e) {
      e.preventDefault();
      var nameEl = formEl.querySelector('#accName');
      var name = nameEl ? nameEl.value.trim() : '';
      var currentPassword = formEl.querySelector('#accCurrentPassword') ? formEl.querySelector('#accCurrentPassword').value : '';
      var newPassword = formEl.querySelector('#accNewPassword') ? formEl.querySelector('#accNewPassword').value : '';
      
      var changes = { name: name };
      
      var rollEl = formEl.querySelector('#accRoll');
      if (rollEl) changes.roll = rollEl.value.trim();
      
      var semEl = formEl.querySelector('#accSemester');
      if (semEl) changes.semester = semEl.value;

      if (newPassword) {
        if (!currentPassword) {
          msgEl.className = 'form-msg show error';
          msgEl.textContent = 'Enter your current password to set a new one.';
          return;
        }
        changes.currentPassword = currentPassword;
        changes.newPassword = newPassword;
      }
      var result = await window.SSAI.updateUserProfile(session.email, changes);
      msgEl.className = 'form-msg show ' + (result.ok ? 'success' : 'error');
      msgEl.textContent = result.ok ? 'Account details updated.' : result.error;
      if (result.ok) {
        if (formEl.querySelector('#accCurrentPassword')) formEl.querySelector('#accCurrentPassword').value = '';
        if (formEl.querySelector('#accNewPassword')) formEl.querySelector('#accNewPassword').value = '';
        document.querySelectorAll('[data-user-name]').forEach(function (el) { el.textContent = result.user.name; });
      }
    });
  },
  openNoteFile: function (note) {
    function fallback() {
      var w = window.open('', '_blank');
      if (!w) { alert('Please allow pop-ups to preview this note.'); return; }
      w.document.write(
        '<!DOCTYPE html><html><head><title>' + note.title + '</title>' +
        '<meta charset="UTF-8">' +
        '<style>body{font-family:Georgia,serif;max-width:640px;margin:60px auto;padding:0 24px;color:#2b2b28;line-height:1.6;}' +
        'h1{font-size:1.6rem;margin-bottom:0.4rem;} .meta{font-family:monospace;font-size:0.8rem;color:#8a8a80;margin-bottom:1.4rem;}' +
        '.note{background:#f6f1e4;border:1px solid #e2dbc8;border-radius:8px;padding:1.4rem 1.6rem;margin-top:1.6rem;font-size:0.9rem;color:#6b6b60;}</style>' +
        '</head><body>' +
        '<h1>' + note.title + '</h1>' +
        '<div class="meta">' + note.subject + ' &middot; ' + note.semester + ' &middot; ' + note.unit + '</div>' +
        '<p>' + (note.description || 'No description provided.') + '</p>' +
        '<div class="note">No PDF file is attached to this note yet — it was added as demo/seed data. When a student or faculty member uploads a real PDF on the Upload Notes page, it will open directly here instead of this preview.</div>' +
        '</body></html>'
      );
      w.document.close();
    }
    if (!note.hasFile) { fallback(); return; }
    window.SSAI.getNoteFile(note.id).then(function (rec) {
      if (!rec || !rec.blob) { fallback(); return; }
      var url = URL.createObjectURL(rec.blob);
      window.open(url, '_blank');
    }).catch(fallback);
  }
};

// --- GOOGLE SIGN-IN ---
// Decodes the JWT ID token Google's client library hands back. This is a client-side
// demo (no server), so we only read the payload for display/session purposes — a real
// production backend should verify the token's signature before trusting it.
window.SSAIGoogle = {
  decodeCredential: function (token) {
    try {
      var base64Url = token.split('.')[1];
      var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      var jsonPayload = decodeURIComponent(
        atob(base64).split('').map(function (c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join('')
      );
      return JSON.parse(jsonPayload);
    } catch (e) {
      return null;
    }
  },
  // Renders the "Sign in with Google" button into `elId` and calls `onProfile({name,email,picture})`
  // once someone completes the Google prompt. `getRole` lets the caller supply the
  // currently-selected role (student/faculty/admin) at click time.
  init: function (elId, onProfile, opts) {
    opts = opts || {};
    var el = document.getElementById(elId);
    if (!el) return;

    function ready() {
      return window.google && google.accounts && google.accounts.id;
    }

    function setup() {
      if (!ready()) return;
      google.accounts.id.initialize({
        client_id: window.SSAI_GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
        callback: function (response) {
          var payload = window.SSAIGoogle.decodeCredential(response.credential);
          if (!payload || !payload.email) {
            if (opts.onError) opts.onError('Could not read your Google account details. Please try again.');
            return;
          }
          onProfile({ name: payload.name, email: payload.email, picture: payload.picture });
        },
        auto_select: false
      });
      google.accounts.id.renderButton(el, {
        theme: 'outline',
        size: 'large',
        width: opts.width || 320,
        text: opts.text || 'continue_with'
      });
    }

    if (ready()) {
      setup();
    } else {
      // The GIS script loads with `async defer`; poll briefly until it's available.
      var tries = 0;
      var timer = setInterval(function () {
        tries++;
        if (ready()) { clearInterval(timer); setup(); }
        else if (tries > 40) { clearInterval(timer); }
      }, 100);
    }
  }
};

// Scroll reveal & Nav activation
document.addEventListener('DOMContentLoaded', () => {
  const revealEls = document.querySelectorAll('.reveal');
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.1 });
  revealEls.forEach(el => io.observe(el));

  // Highlight current page in top nav
  const path = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.tabs a').forEach(a => {
    const href = a.getAttribute('href');
    if (href === path || (path === '' && href === 'index.html')) {
      a.classList.add('active');
    }
  });
});


// --- DARK MODE THEME CONTROLLER ---
(function initThemeController() {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    // Apply initial theme
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
        document.body.classList.add('dark-theme');
    }

    // Attach listener when DOM content is ready
    document.addEventListener('DOMContentLoaded', function () {
        const themeBtn = document.getElementById('themeToggle');
        const themeIcon = document.getElementById('themeIcon');
        const themeText = document.getElementById('themeText');

        function updateUI() {
            const isDark = document.body.classList.contains('dark-theme');
            if (themeIcon) themeIcon.textContent = isDark ? '☀️' : '🌙';
            if (themeText) themeText.textContent = isDark ? 'Light Mode' : 'Dark Mode';
        }

        updateUI();

        if (themeBtn) {
            themeBtn.addEventListener('click', function () {
                document.body.classList.toggle('dark-theme');
                const isDark = document.body.classList.contains('dark-theme');
                
                localStorage.setItem('theme', isDark ? 'dark' : 'light');
                updateUI();
            });
        }
    });
})();
