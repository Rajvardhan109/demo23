# SSAI: localStorage → Express + MongoDB Migration

## What changed
- `data.js` used to read/write `localStorage` directly (synchronous).
- The new backend (this folder) stores users, notes, ratings, and bookmarks in MongoDB, with JWT auth and bcrypt-hashed passwords.
- PDF files **stay exactly where they were** — in the browser's IndexedDB — since Mongo isn't a great fit for binary blobs and your existing upload/preview flow already works.
- The new `frontend-data.js` (rename to `data.js` when you drop it in) keeps the **same `window.SSAI.*` function names**, but every function that touches the server now returns a **Promise** instead of a plain value. This is the one real breaking change across your HTML files.

## Setup (run once)

```bash
cd ssai-backend
npm install
cp .env.example .env
```

Edit `.env`:
- `MONGODB_URI` — get this from [MongoDB Atlas](https://mongodb.com/atlas) (free M0 cluster) or a local Mongo instance
- `JWT_SECRET` — generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- `CORS_ORIGIN` — the origin(s) your frontend runs on (e.g. `http://localhost:5500` if using VS Code Live Server)

Run it:
```bash
npm start
```
You should see `MongoDB connected` and `SSAI backend running on port 4000`.

## Frontend changes needed

1. Replace `data.js` with `frontend-data.js` (rename it `data.js`).
2. Add this line **before** `<script src="data.js"></script>` on every page, so it knows where the API lives:
   ```html
   <script>window.SSAI_API_BASE = 'http://localhost:4000/api';</script>
   ```
3. Update every inline `<script>` block that calls `SSAI.*` to use `async`/`await` (or `.then()`), since those calls now hit the network.

### Example 1 — `login.html`

**Before:**
```js
document.getElementById('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var email = document.getElementById('loginEmail').value;
    var password = document.getElementById('loginPassword').value;
    var result = SSAI.login(email, password, selectedRole);
    if (!result.ok) {
        showMsg(result.error, 'error');
        return;
    }
    ...
});
```

**After:**
```js
document.getElementById('loginForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var email = document.getElementById('loginEmail').value;
    var password = document.getElementById('loginPassword').value;
    var result = await SSAI.login(email, password, selectedRole);
    if (!result.ok) {
        showMsg(result.error, 'error');
        return;
    }
    ...
});
```
Same pattern for the Google sign-in callback and the `SSAIGoogle.init(...)` handler in `login.html`/`signup.html` — just add `async` to the callback function and `await` in front of `SSAI.loginWithGoogle(...)`.

### Example 2 — `admin-dashboard.html` (multiple render functions)

**Before:**
```js
function renderUsers() {
    var users = SSAI.getUsers();
    ...
}
function renderNotes() {
    var notes = SSAI.getNotes();
    ...
}
```

**After:**
```js
async function renderUsers() {
    var users = await SSAI.getUsers();
    ...
}
async function renderNotes() {
    var notes = await SSAI.getNotes();
    ...
}
```
Anywhere these are *called* (e.g. `renderUsers();` at the bottom of the script, or inside a button's click handler like `SSAI.setUserRole(...); renderUsers();`), also add `await`:
```js
sel.addEventListener('change', async function () {
    await SSAI.setUserRole(sel.getAttribute('data-role-email'), sel.value);
    renderUsers();
});
```

## Checklist — every file with an `SSAI.*` call that needs `async`/`await`

| File | Functions to wrap |
|---|---|
| `login.html` | `SSAI.login`, `SSAI.loginWithGoogle` |
| `signup.html` | `SSAI.signup`, `SSAI.loginWithGoogle` |
| `forgot-password.html` | `SSAI.requestPasswordResetOtp`, `SSAI.verifyPasswordResetOtp`, `SSAI.resetPasswordWithOtp` (these already live inside `.then()` chains — just add `await` or wrap in `async function`) |
| `dashboard.html` | `SSAI.getNotes`, `SSAI.getRecommendations`, `SSAI.rateNote`, `SSAI.toggleBookmark`, `SSAI.recordDownload`, `SSAI.updateUserProfile`, etc. — same render-function pattern as the admin dashboard example above |
| `admin-dashboard.html` | `SSAI.getUsers`, `SSAI.getNotes`, `SSAI.setUserRole`, `SSAI.deleteUser`, `SSAI.deleteNote`, `SSAI.createUser`, `SSAI.getAnalytics`, `SSAI.updateUserProfile` |
| `faculty-dashboard.html` | `SSAI.getNotes`, `SSAI.approveNote`, `SSAI.deleteNote`, `SSAI.updateUserProfile` |
| `upload.html` | `SSAI.addNote`, `SSAI.storeNoteFile` (unchanged — IndexedDB) |
| `search.html` | `SSAI.getNotes`, `SSAI.searchNotes`, `SSAI.isBookmarked`, `SSAI.toggleBookmark`, `SSAI.rateNote` |
| `recommendation.html` | `SSAI.getRecommendations`, `SSAI.getUserRating`, `SSAI.toggleBookmark`, `SSAI.rateNote` |
| `script.js` (`SSAIUI.wireCardEvents`) | `SSAI.getNotes`, `SSAI.recordDownload`, `SSAI.toggleBookmark`, `SSAI.rateNote` — these are inside click handlers, so just make the handler `async` |

`script.js`'s `wireCardEvents` is shared across almost every page, so fixing it once fixes the rating/bookmark/open buttons everywhere. The relevant handlers are already inside `addEventListener('click', function () {...})` — just change `function ()` to `async function ()` and add `await` in front of the `SSAI.*` calls inside.

## Why this is worth explaining to your examiner
This is the real answer to "how would this scale to the whole university": localStorage is per-browser and per-device, so two students never see the same data and nothing survives a cleared cache. Moving to a real server + database means every student, faculty member, and admin shares one source of truth — which is what "college-level deployment across all departments," a line already on your roadmap page, actually requires under the hood.

## What this fixes from your known issues list
- **Plaintext passwords** → bcrypt hash, applied automatically on every save (`models/User.js`)
- **Hardcoded JWT secret** → moved to `.env`, never committed
- **Fully open CORS** → restricted to `CORS_ORIGIN` in `.env`
