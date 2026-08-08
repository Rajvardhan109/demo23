// Lightweight AI assistant widget shared across the Student, Faculty, and Admin
// dashboards. It's a rule-based helper (no external API) that answers common
// questions using data already available on the client via SSAI, and offers
// role-specific quick actions.
window.SSAIChatbot = {
  init: function (session) {
    if (document.getElementById('ssaiChatbotRoot')) return; // avoid double-init

    var role = (session && session.role) || 'student';

    var root = document.createElement('div');
    root.id = 'ssaiChatbotRoot';
    root.innerHTML =
      '<button type="button" class="chatbot-toggle" id="cbToggle" aria-label="Open AI assistant">' +
        '💬<span class="cb-badge"></span>' +
      '</button>' +
      '<div class="chatbot-panel" id="cbPanel">' +
        '<div class="chatbot-header">' +
          '<div>' +
            '<div class="cb-title"><span class="cb-dot"></span> Study AI Assistant</div>' +
            '<div class="cb-sub">' + role + ' mode</div>' +
          '</div>' +
          '<button type="button" class="chatbot-close" id="cbClose" aria-label="Close">✕</button>' +
        '</div>' +
        '<div class="chatbot-messages" id="cbMessages"></div>' +
        '<div class="chatbot-quick" id="cbQuick"></div>' +
        '<div class="chatbot-inputrow">' +
          '<input type="text" id="cbInput" placeholder="Ask about notes, uploads, ratings…">' +
          '<button type="button" id="cbSend">Send</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(root);

    var toggle = document.getElementById('cbToggle');
    var panel = document.getElementById('cbPanel');
    var closeBtn = document.getElementById('cbClose');
    var messages = document.getElementById('cbMessages');
    var quick = document.getElementById('cbQuick');
    var input = document.getElementById('cbInput');
    var sendBtn = document.getElementById('cbSend');

    function open() { panel.classList.add('open'); input.focus(); }
    function close() { panel.classList.remove('open'); }
    toggle.addEventListener('click', function () {
      panel.classList.contains('open') ? close() : open();
    });
    closeBtn.addEventListener('click', close);

    function addMsg(text, who) {
      var div = document.createElement('div');
      div.className = 'cb-msg ' + (who === 'user' ? 'user' : 'bot');
      div.textContent = text;
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
    }

    // --- Role-specific quick prompts ---
    var quickPrompts = {
      admin: ['User stats', 'Notes overview', 'Top subject', 'How do I add a user?'],
      faculty: ['Pending review', 'Approved notes', 'Notes by subject', 'How do I reject a note?'],
      student: ['Recommended for me', 'My uploads', 'How do I bookmark a note?', 'How do I upload notes?']
    };
    (quickPrompts[role] || quickPrompts.student).forEach(function (label) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('click', function () { handleUserMessage(label); });
      quick.appendChild(b);
    });

    // --- Rule-based response engine ---
    async function safeGetNotes() {
      try { return window.SSAI ? await window.SSAI.getNotes() : []; } catch (e) { return []; }
    }

    async function respond(text) {
      var q = text.toLowerCase();
      var notes = await safeGetNotes();

      if (/pending|review/.test(q) && (role === 'faculty' || role === 'admin')) {
        var pending = notes.filter(function (n) { return n.status === 'pending'; });
        return pending.length
          ? pending.length + ' note(s) are waiting for your review: ' + pending.slice(0, 5).map(function (n) { return n.title; }).join(', ') + (pending.length > 5 ? '…' : '') + '.'
          : 'Nothing pending right now — the queue is clear.';
      }
      if (/approved/.test(q)) {
        var approved = notes.filter(function (n) { return n.status === 'approved'; });
        return approved.length + ' note(s) are currently approved and visible in Smart Search.';
      }
      if (/user stat|how many user|total user/.test(q) && role === 'admin') {
        var users = (window.SSAI && window.SSAI.getUsers) ? await window.SSAI.getUsers() : [];
        return 'There are ' + users.length + ' user account(s): ' +
          users.filter(function (u) { return u.role === 'student'; }).length + ' students, ' +
          users.filter(function (u) { return u.role === 'faculty'; }).length + ' faculty, and ' +
          users.filter(function (u) { return u.role === 'admin'; }).length + ' admins.';
      }
      if (/notes overview|how many notes|total notes/.test(q)) {
        return 'There are ' + notes.length + ' note(s) in the catalog, with ' +
          notes.reduce(function (s, n) { return s + n.downloads; }, 0) + ' total downloads.';
      }
      if (/top subject|by subject|subject breakdown/.test(q)) {
        var counts = {};
        notes.forEach(function (n) { counts[n.subject] = (counts[n.subject] || 0) + 1; });
        var top = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })[0];
        return top ? 'The most active subject right now is "' + top + '" with ' + counts[top] + ' note(s).' : 'No notes have been uploaded yet.';
      }
      if (/add a user|create user/.test(q) && role === 'admin') {
        return 'Use the "Add User" form at the top of the Users card — enter a name, email, temporary password, and role, then submit.';
      }
      if (/reject/.test(q) && role === 'faculty') {
        return 'On the Pending Review table, click "Reject" next to a note. You can optionally add a short note explaining why, which the student will see.';
      }
      if (/recommended for me|recommendation/.test(q) && role === 'student') {
        var recs = (window.SSAI && window.SSAI.getRecommendations) ? await window.SSAI.getRecommendations(3) : [];
        return recs.length
          ? 'Top pick for you right now: "' + recs[0].title + '" (' + recs[0].matchScore + '% match). Check the AI Recommendations page for the full list.'
          : 'No recommendations yet — once notes are approved, they will start appearing here.';
      }
      if (/my upload/.test(q) && role === 'student') {
        var mine = notes.filter(function (n) { return session && n.uploadedBy === session.email; });
        return mine.length ? 'You have uploaded ' + mine.length + ' note(s). Check "My Library" on the dashboard for details.' : 'You haven\'t uploaded any notes yet — try the Upload Notes page.';
      }
      if (/bookmark/.test(q)) {
        return 'Tap the "☆ Save" button on any note card to bookmark it. Saved notes show up when you filter by "Show only my bookmarked notes" on Smart Search.';
      }
      if (/upload notes|how do i upload/.test(q)) {
        return 'Go to "Upload Notes" from the top navigation, fill in the subject, unit, title, and description, attach a PDF or image, and submit for faculty review.';
      }
      if (/hi|hello|hey/.test(q)) {
        return 'Hi! I can help you with notes, uploads, ratings, and using this dashboard. What would you like to know?';
      }
      return 'I\'m a simple built-in assistant for now, so I can only help with notes, uploads, reviews, and dashboard questions. Try one of the quick prompts above, or rephrase your question.';
    }

    function handleUserMessage(text) {
      text = (text || '').trim();
      if (!text) return;
      addMsg(text, 'user');
      input.value = '';
      setTimeout(async function () { addMsg(await respond(text), 'bot'); }, 250);
    }

    sendBtn.addEventListener('click', function () { handleUserMessage(input.value); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') handleUserMessage(input.value); });

    addMsg('Hi ' + ((session && session.name) ? session.name.split(' ')[0] : 'there') + '! I\'m your Study AI assistant. Ask me about notes, uploads, or use a quick prompt below.', 'bot');
  }
};
