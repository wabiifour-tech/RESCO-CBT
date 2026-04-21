---
Task ID: 1
Agent: Main Agent
Task: Thorough scan and fix ALL non-working buttons/features in RESCO-CBT app

Work Log:
- Cloned repo from GitHub to /home/z/my-project/RESCO-CBT/
- Read and analyzed all component files (StudentDashboard.jsx, TeacherDashboard.jsx, AdminPanel.jsx, LoginPage.jsx, App.jsx, etc.)
- Analyzed all backend route files (auth, exam, question, result, admin routes)
- Mapped ALL 37 frontend API calls to backend routes - found 1 critical mismatch
- Identified and fixed 8 issues total

Stage Summary:
## BROKEN BUTTONS FIXED:

### 🔴 CRITICAL (3 fixes):
1. **Admin Logout button** (AdminPanel.jsx:238) — `handleLogout()` was calling `logout()` but NOT navigating to `'/'`. User stayed on admin page after logout. Fixed by importing `useNavigate` and adding `navigate('/')`.

2. **Admin "Save All" questions button** (AdminPanel.jsx:1615) — `handleManualSubmit` function was fully defined (line 416) but NEVER called. The "Save All" button had a massive duplicate inline function instead. Fixed by connecting the button to the defined function and adding blank-question filtering.

3. **Teacher Export CSV/PDF button** (TeacherDashboard.jsx:102) — Used `window.open()` which opens a new tab WITHOUT the `Authorization: Bearer` token. Backend `GET /results/export/:examId` requires authentication → always returned 401 Unauthorized. Fixed by replacing with `api.get()` + blob download approach.

### 🟡 MEDIUM (3 fixes):
4. **Admin Upload CSV modal** — No backdrop click-to-close. Added `onClick` handler on overlay div.
5. **Admin Manual Add modal** — No backdrop click-to-close. Added `onClick` handler on overlay div.
6. **Admin Create Exam modal** — No backdrop click-to-close. Added `onClick` handler on overlay div.

### 🟢 UX IMPROVEMENT (1 fix):
7. **Student login name field** — Placeholder said "Enter your full name" but backend requires at least 2 words. Changed to "Enter your first and last name (e.g. John Doe)".

### ✨ NEW FEATURE (1 addition):
8. **Admin Create Assignment button + modal** — Backend `POST /admin/assignments` endpoint existed but had NO frontend UI. Added "Create Assignment" button in the Assignments tab header + a modal with teacher dropdown, subject input, and class selector.

## FILES MODIFIED:
- frontend/src/components/AdminPanel.jsx (6 fixes)
- frontend/src/components/TeacherDashboard.jsx (1 fix)
- frontend/src/components/LoginPage.jsx (1 fix)

## BUILD VERIFICATION:
- `vite build` succeeded with 0 errors
- All changes pushed to GitHub (commit 104497c)
