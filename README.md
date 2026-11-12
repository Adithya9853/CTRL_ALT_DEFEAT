# FINDORA — Every lost thing deserves its way back

**AI VIBEX 1.0 · MITE, Moodbidri · Team CTRL ALT DEFEAT**
Adithya T S · Layshun Fernandes · Vignesh

**Official problem statement:** "Students lose items and have no central place to report or find them. Build a tool where students post lost or found items with photos, and AI matches them by description and location."

FINDORA is a full website with its own server. It has real logins, a database, photo uploads, AI matching, safe claims and a Security Desk dashboard.

---

## 1. Folder structure

```
findora-app/
├── server.js          ← the server: login, database, photos, AI, all permission checks
├── lib/
│   ├── store.js       ← database (saved to data/db.json)
│   ├── ai.js          ← AI connection (Gemini or Claude), key stays on the server
│   └── whatsapp.js    ← WhatsApp alerts (Twilio or Meta Cloud API), with a one-tap fallback
├── public/
│   ├── index.html     ← website pages + design
│   ├── app.js         ← website logic (talks to the server)
│   └── match.js       ← quick-match rules (shared by server and website)
├── scripts/seed.js    ← adds labelled sample reports
├── .env.example       ← settings template (copy to .env)
├── package.json
└── data/              ← created automatically: db.json + uploads/ (photos)
```

The only package is **Express**. There's no frontend framework and no build step.

## 2. Install and run

You need **Node.js 18 or newer** (https://nodejs.org → LTS).

```bash
cd findora-app
npm install
cp .env.example .env        # Windows: copy .env.example .env
npm run seed                # optional: add 8 sample reports (run while the server is STOPPED)
npm start
```

Open **http://localhost:3000**.

The first time it starts, the terminal prints the **Security Desk login**, for example:

```
Security Desk account created  →  ID: SECURITY01   Password: x7Kp2Qa9   (shown once — write it down)
```

To choose the password yourself, set `STAFF_PASSWORD=` in `.env` **before** the first start.

**Use it on phones during the demo:** connect the phones to the same Wi-Fi as the laptop. Find the laptop's IP (`ipconfig` on Windows, `ifconfig` / `ip a` on Mac/Linux), then open `http://<laptop-ip>:3000` on the phone. If it doesn't open, allow Node through the laptop firewall.

## 3. Environment variables (`.env`)

| Name | Needed? | What it does |
|---|---|---|
| `PORT` | no | Port number (default 3000) |
| `STAFF_ID` | no | First Security Desk login ID (default `SECURITY01`) |
| `STAFF_PASSWORD` | no | Its password. If empty, a random one is printed once |
| `GEMINI_API_KEY` | for AI | Free key from https://aistudio.google.com/apikey |
| `GEMINI_MODEL` | no | Default `gemini-flash-latest` |
| `ANTHROPIC_API_KEY` | for AI (alternative) | Claude key from https://console.anthropic.com |
| `ANTHROPIC_MODEL` | no | Default `claude-haiku-5-5` |
| `DATA_DIR` | no | Where the database and photos are saved (default `./data`) |
| `APP_URL` | recommended | Link put in WhatsApp messages, e.g. `http://192.168.1.20:3000` |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` | for automatic WhatsApp | Twilio WhatsApp (sandbox is fine for the demo) |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | alternative | Meta WhatsApp Cloud API (optional `WHATSAPP_TEMPLATE`) |

Set **one** AI key. If both are set, Gemini is used. With no key, the site still works fully using the quick-match rules, and the header shows "AI off · quick match". **Never share `.env` or put keys in the website code.** The browser never sees the key.

## 3b. WhatsApp alerts

**When messages are sent:**

| Event | Who gets it | What it says |
|---|---|---|
| A **strong** possible match (AI score 75+, or quick-check 75+ when AI is off) | Owner of the lost item | Item name, where/when it was found, "open FINDORA and claim". **No phone numbers yet.** |
| Desk **approves** a claim, item is at the desk | Owner | "Approved, collect from the Security Desk with your college ID" |
| Desk **approves** a claim, finder still has it | Owner **and** finder | Each gets the other's **name and phone number** |
| Desk **rejects** a claim | Claimant | Not approved, plus the reason |

Phone numbers are only shared **after the Security Desk verifies the owner**. This stops someone posting a fake "lost" report just to collect finders' numbers. Every message also appears in the student's 🔔 notifications. The same message is never sent twice.

**Three ways to send:**
1. **No setup:** messages are saved, and the Security Desk → **WhatsApp** tab shows a green **Send on WhatsApp** button for each one. It opens WhatsApp with the message and number filled in, so staff just tap send.
2. **Twilio sandbox (automatic, about 10 minutes):**
   - Make a free account at twilio.com, then go to **Messaging → Try it out → Send a WhatsApp message**.
   - Each phone that should receive messages sends the shown `join <code>` message to the sandbox number once.
   - Put the Account SID, Auth Token and `TWILIO_WHATSAPP_FROM=whatsapp:+14155238886` (the sandbox number) in `.env`, then restart.
   - Sandbox only reaches phones that joined. For real use, register a WhatsApp sender with Twilio.
3. **Meta WhatsApp Cloud API (free, automatic):**
   - Create an app at developers.facebook.com → WhatsApp → API Setup, and add your test recipient numbers.
   - Put the token and Phone Number ID in `.env`.
   - Meta only allows free-text messages to people who messaged your number in the last 24 hours. Otherwise, create an approved template with one `{{1}}` variable and set `WHATSAPP_TEMPLATE`.

Failed sends show the error in the WhatsApp tab, with **Retry** and **Send on WhatsApp** buttons.


## 3c. Use the same FINDORA server from two or more laptops

**Important:** `http://localhost:3000` always means "this computer". If two students each start their own copy of FINDORA, they get separate `data/db.json` files and cannot see one another's reports. Refreshing does not merge two databases.

For a classroom demo on the same Wi-Fi:
1. Choose one laptop as the host. Start FINDORA there with `npm start` and leave that terminal running.
2. The server prints one or more `Same Wi-Fi/LAN devices → http://...:3000` addresses. On the host laptop, keep using `http://localhost:3000`.
3. On every other laptop/phone connected to the same Wi-Fi, open the printed LAN address (for example `http://192.168.1.20:3000`) — **not** `localhost`.
4. If Windows Firewall asks, allow Node.js on **Private networks**. Do not expose the server to public networks without proper deployment and security review.
5. All devices now use the host's one database and uploads folder. Back up the host's `data` folder.

For users on different networks, deploy one copy of the Express server to a Node-compatible host with persistent storage, configure HTTPS and `APP_URL`, and have everyone use that same public URL. Do not deploy separate copies if reports must be shared.

## 3d. Matching and alerts reliability

FINDORA now always calculates a local deterministic similarity score from category, item words, colour, campus place and date. AI can improve/explain that score, but a missing, failed or overly conservative AI response no longer hides a strong local match. The browser also compares the local score against the AI score and displays the stronger result.

When a strong possible pair is found, both the lost-item owner and the person who posted the found item receive an in-app notification. The lost-item owner is asked to submit a claim; the finder is asked to keep the item safe. Private phone numbers and secret details are not included in these match alerts.

**Automatic WhatsApp delivery still requires a real provider configuration** (Twilio WhatsApp or Meta WhatsApp Cloud API) in `.env`. Fill in the provider credentials, restart the server, and check the startup line `WhatsApp: on (...)`. With no provider configured, FINDORA saves the in-app notifications and the Security Desk can use the manual WhatsApp link. Never share `.env` or commit credentials. For the Twilio sandbox, each recipient must first join the sandbox from their own WhatsApp account.

## 4. Database

Nothing to install. Everything is saved in `data/db.json`, and photos go in `data/uploads/`. Each change is written to disk straight away, so a page refresh or a server restart doesn't lose data.

| Collection | Holds |
|---|---|
| `users` | name, USN, department, phone, role (`student` / `staff`), hashed password (scrypt) |
| `sessions` | login sessions (httpOnly cookie, 7 days) |
| `reports` | lost/found reports + private secret detail + AI results |
| `claims` | claim proof, status, decision notes |
| `notifications` | in-app + WhatsApp messages and their send status |

- **Back up:** copy the `data` folder.
- **Start fresh:** stop the server and delete the `data` folder.
- **Remove samples:** `npm run seed -- --remove` (server stopped).

## 5. Completed features

- **Login first:** create an account (name, USN like 4MT23CS001, department, phone, password) or log in. Staff log in with their staff ID. "Browse without logging in" is view-only.
- **Lost / found reports:** photo (required for found items), name, category, colour, public description, place, date (no future dates), and a **private secret detail**. Clear error messages, checked in both the browser and the server.
- **AI photo auto-fill:** fills in name, category, colour and description from the photo.
- **AI matching (main feature):**
  - The server runs it automatically after every report.
  - Quick rules pick the best 6 candidates.
  - AI then reviews the text **and up to 4 photos**, and returns a score, ✓ similarities, ✗ differences and a reason.
  - Shown as **Strong / Possible / Weak** (score out of 100) with a "suggestion, not proof" note.
  - "Re-check with AI" button, and staff can "Run AI on all".
- **Browse:** search plus filters for type, category, place and status.
- **Claims:** private proof, plus an optional link to your lost report. No duplicate claims. You can't claim an item you found yourself.
- **My activity:** your profile, your reports with their top match, and your claims with the next step.
- **Security Desk:**
  - Claims side by side: finder's secret vs claimant's proof vs lost report secret, with the claimant's USN and phone.
  - **AI hint** (advisory only).
  - Approve / Reject with a reason → **Handed over** → found and lost reports both marked Returned. Other open claims on that item are closed automatically.
  - Found items list: "Received at desk", "Mark returned", "Remove".
  - Add more staff logins.
- **Security (all on the server):**
  - Every staff action is checked against the staff role.
  - Public data never includes phone numbers, names or secret details.
  - Passwords are hashed.
  - Login is rate-limited (10 tries per 10 minutes).
  - Writes only accept JSON (blocks cross-site form posts).
  - Photo type and size are checked.
  - Uploads folder can't be used to read other files.

## 6. Limits / needs setup

- **AI needs a key** in `.env` (Gemini has a free tier). Without one, quick-match is used. The app never pretends AI ran.
- **The real Gemini and Claude services were not called during our testing** (no internet access to them from the test machine). The AI flow was tested end to end using a stand-in service that answers in Claude's format. **Test with your real key once before presenting.** If the default model name stops working, set `GEMINI_MODEL` / `ANTHROPIC_MODEL` to a current one.
- **Hosting:** runs on any computer with Node. Vercel/Netlify won't work, because the site needs a running server that can save files. Render/Railway work, but their free plans may wipe `data/` on restart unless you add a persistent disk.
- **No password reset by email or SMS.** Staff can create staff logins. A forgotten student password currently needs a new account, or a manual edit of `data/db.json`.
- **WhatsApp automatic sending needs Twilio or Meta set up** (see 3b). Without it, staff send each message with one tap. **The real Twilio/Meta services were not called in our tests.** The sending code was tested with a stand-in service that works like Twilio.
- The JSON-file database is fine for one campus demo (thousands of reports). For long-term use, move to SQLite or PostgreSQL.

## 7. Test results

Tested on Node 22 with automated Chrome tests (desktop 1200px and phone 390px). **0 browser console errors.**

| # | Step | Result |
|---|---|---|
| 1 | Open site → login page first | ✅ |
| 2 | Create account (empty form → 5 errors; duplicate USN rejected; wrong password rejected) | ✅ |
| 3 | Student A: lost report with photo, AI auto-fill filled the fields | ✅ |
| 4 | Student B (separate account): found report with photo | ✅ |
| 5 | Both saved; B can't see A's phone | ✅ |
| 6 | AI match shown to both, "AI review", Strong 91/100, similar/different | ✅ (stand-in AI) |
| 7 | A claims with proof → "Pending" in My activity | ✅ |
| 8 | Staff logs in → lands on desk, sees proof vs secret, AI hint "Consistent" | ✅ |
| 9–10 | Approve → Handed over → A sees claim + lost report **Returned** | ✅ |
| 11 | Page reload **and server restart** → data and photos still there | ✅ |
| 12 | Phone layout + no-AI mode (quick match, AI buttons hidden) | ✅ |
| 13 | WhatsApp on (stand-in Twilio): owner got 2 match alerts + approval message, with the correct +91 number and link | ✅ |
| 14 | Approval when the finder still has the item: owner got the finder's name + phone, finder got the owner's | ✅ |
| 15 | WhatsApp off: message saved, desk shows a working wa.me "Send on WhatsApp" link, 🔔 badge shows unread | ✅ |

**Server permission tests** (direct requests, bypassing the website):
- Student opening the staff overview → 403
- Student changing a report status → 403
- Student approving a claim → 403
- Posting without logging in → 401
- A non-JSON form post → 415
- `/uploads/../db.json` → 404
- Public report list contains no phones or secrets ✅

## 8. Demo script (about 3 minutes)

Before you start: run `npm run seed`, then `npm start`. Have one laptop open as staff, and one phone each for Student A and Student B.

1. **Login (20s):** show the login page and create a student account. "Phone and USN are only visible to the Security Desk."
2. **Lost report (40s):** Student A → *I lost something* → earbuds photo → **✨ Fill from photo with AI** → Library → secret "RS scratched inside lid" → Post.
3. **AI match (40s):** the match appears, marked **Strong**, with ✓ similar and ✗ different. Point to "suggestion, not proof."
4. **Claim (30s):** **This is mine — claim** on the found earbuds → proof → Send. Show "Pending" in My activity.
5. **Security Desk (40s):** laptop logged in as staff → secret vs proof side by side → **AI hint** → **Approve** → **Handed over** → refresh the phone and show it's Returned.
6. **WhatsApp (20s):** show the owner's phone receiving "possible match" and "approved" messages, or tap **Send on WhatsApp** in the desk tab.
7. **Trust (10s):** "Phone numbers are shared only after the desk verifies the owner. Every staff action is checked by the server."

## 9. External services and libraries

- **Express** (MIT): web server
- **Twilio WhatsApp API** or **Meta WhatsApp Cloud API**: automatic alerts (optional), plus **wa.me** links
- **Google Gemini API** or **Anthropic Claude API**: AI matching, photo reading and claim hints (optional, needs your key)
- **Google Fonts**: Plus Jakarta Sans
- Everything else (design, matching rules, claim workflow, security checks) is our own code.


## Inbox notifications (v1.1)

- Match alerts are saved to both the lost-item owner and finder inboxes immediately using local matching; AI enhancement runs separately and does not delay the inbox alert.
- Claim submission alerts are saved for the claimant and the person who reported the found item.
- Claim approval/rejection updates are saved in the claimant's inbox.
- Open **My activity → Inbox & notifications** to see alerts. New messages remain unread until you choose **Mark all as read**.
- WhatsApp is optional. If it is not configured or a provider rejects a message, the FINDORA inbox copy remains available.
- When testing on two laptops, both people must open the same server's LAN URL (not each laptop's own `localhost`) and remain on the same Wi-Fi network.
