/* FINDORA — browser app. Talks to the FINDORA server (server.js) through /api.
   All permission checks happen on the server; the page only hides buttons for convenience. */
"use strict";
const { CATS, COLORS, PLACES, DEPTS, ALL_PLACES, zoneOf, ACTIVE, tokens, quickCompare } = window.FM;

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const arg = v => esc(JSON.stringify(String(v)));
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const fmtDate = d => { const x = new Date(d); return isNaN(x) ? "" : x.toLocaleDateString("en-IN", { day: "numeric", month: "short" }); };
const okImg = p => typeof p === "string" && /^\/uploads\/[a-f0-9]{24}\.(jpg|png|webp)$/.test(p);
const thumb = r => okImg(r.photo) ? `<img src="${esc(r.photo)}" alt="" loading="lazy">` : (CATS[r.cat] || "📦");
const typeTag = r => `<span class="tag ${r.type === "found" ? "found" : "lost"}">${r.type === "found" ? "Found" : "Lost"}</span>`;
const statusTag = s => `<span class="tag ${s === "Returned" ? "ret" : s === "Claim approved" ? "ai" : "st"}">${esc(s === "Returned" ? "Returned ✓" : s)}</span>`;
const claimTag = s => `<span class="tag ${s === "Pending" ? "pend" : s === "Rejected" ? "rej" : s === "Returned" ? "ret" : "ai"}">${esc(s)}</span>`;
const cleanPhone = s => String(s || "").replace(/[\s-]/g, "").replace(/^(\+91|0091|0)/, "");
const validPhone = s => /^[6-9]\d{9}$/.test(cleanPhone(s));
const USN_RE = /^[1-4][A-Z]{2}\d{2}[A-Z]{2,3}\d{3}$/;

function toast(msg, bad) { const t = $("#toast"); t.textContent = msg; t.className = "toast" + (bad ? " err" : ""); t.style.display = "block"; clearTimeout(t._h); t._h = setTimeout(() => t.style.display = "none", 3600); }
function banner(text, kind) { const b = $("#banner"); b.textContent = text; b.className = "banner " + (kind || "info"); b.style.display = text ? "block" : "none"; }
function setBad(form, f, msg) { const el = form.querySelector(`[data-f="${f}"]`); if (el) { el.classList.toggle("bad", !!msg); const e = el.querySelector(".err"); if (e && msg && typeof msg === "string") e.textContent = msg; } return !msg; }
function showServerErrors(form, err) { let shown = false; Object.entries((err && err.errors) || {}).forEach(([f, m]) => { if (setBad(form, f, m) === false) shown = true; }); return shown; }

async function api(path, body) {
  let res;
  try {
    res = await fetch("/api" + path, body === undefined ? { credentials: "same-origin" } :
      { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch (e) { throw { error: "Can't reach the FINDORA server. Check your connection." }; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw { status: res.status, ...data, error: data.error || "Something went wrong (" + res.status + ")." };
  return data;
}

/* ---------- state ---------- */
let me = null, guest = false, config = { ai: false };
let reports = [], my = { reports: [], claims: [] }, staff = { reports: [], claims: [] }, notes = [], staffNotes = [], loaded = false;
let view = "login", openId = null, claimFor = null, deskTab = "claims";
const aiBusy = {}, aiVerdict = {}, rejectOpen = {};
const isStaff = () => !!(me && me.role === "staff");
const findR = id => reports.find(r => r.id === id) || staff.reports.find(r => r.id === id);
const privOf = id => (staff.reports.find(r => r.id === id) || my.reports.find(r => r.id === id) || null);
const visible = () => reports;

let lastSig = "";
async function refresh(force) {
  try {
    const tasks = [api("/reports").then(d => reports = d.reports)];
    if (me) tasks.push(api("/my").then(d => my = d), api("/notifications").then(d => notes = d.notifications));
    if (isStaff()) tasks.push(api("/staff/notifications").then(d => staffNotes = d.notifications));
    if (isStaff()) tasks.push(api("/staff/overview").then(d => staff = d));
    await Promise.all(tasks);
    const sig = JSON.stringify([reports, my, staff, notes, staffNotes, !!me]);
    if (loaded && sig === lastSig && !force) return;   // nothing changed: don't redraw
    lastSig = sig;
    loaded = true;
    if ($("#banner").dataset.net) { banner(""); delete $("#banner").dataset.net; }
  } catch (e) {
    if (e.status === 401 || e.status === 403) { me = null; my = { reports: [], claims: [] }; staff = { reports: [], claims: [] }; notes = []; staffNotes = []; }
    else { banner(e.error, "warn"); $("#banner").dataset.net = "1"; }
  }
  render();
}
// keep data fresh: every 8 s, or every 3 s while AI is still checking something
let pollT;
function schedule() {
  clearTimeout(pollT);
  const pending = reports.some(r => r.aiStatus === "pending");
  const wait = pending ? 2500 : document.hidden ? 30000 : 8000;
  pollT = setTimeout(async () => { await refresh(); schedule(); }, wait);
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) { refresh(); schedule(); } });

/* ============================================================
   MATCHING (display): AI results saved by the server, else quick rules
   ============================================================ */
function aiEntries(r) {
  const m = {};
  ((r.ai && r.ai.matches) || []).forEach(x => m[x.id] = x);
  reports.forEach(o => ((o.ai && o.ai.matches) || []).forEach(x => { if (x.id === r.id && !m[o.id]) m[o.id] = { ...x, id: o.id }; }));
  return m;
}
function matchesFor(r, limit = 5) {
  if (!ACTIVE(r.status)) return [];
  const ai = aiEntries(r);
  return reports.filter(o => o.type !== r.type && ACTIVE(o.status)).map(o => {
    const a = ai[o.id];
    const quick = quickCompare(r, o);
    if (!a) return { other: o, ...quick };
    // AI may return a conservative/zero score. Keep the stronger local score visible.
    const useAI = (+a.score || 0) >= quick.score;
    return {
      other: o,
      score: Math.max(+a.score || 0, quick.score),
      same: useAI && a.same && a.same.length ? a.same : quick.same,
      diff: useAI && a.diff && a.diff.length ? a.diff : quick.diff,
      reason: useAI && a.reason ? a.reason : (quick.same.length ? "Strong overlap in the reported item details." : "Compared using item details, place and date."),
      ai: a.ai === false ? false : useAI
    };
  }).filter(m => m.score >= 35).sort((x, y) => y.score - x.score).slice(0, limit);
}
const level = s => s >= 75 ? ["Strong", "s3"] : s >= 50 ? ["Possible", "s2"] : ["Weak", "s1"];
function strengthHTML(score) {
  const [lab, cls] = level(score);
  return `<div class="strength ${cls}"><b>${lab}</b><span class="meta">${score}/100</span><div class="bar"><i style="width:${score}%"></i></div></div>`;
}

/* ============================================================
   NAVIGATION
   ============================================================ */
function go(v) {
  if (!me && !guest) v = "login";
  else if (!me && ["report", "mine", "desk"].includes(v)) { toast("Please log in first"); v = "login"; }
  else if (me && v === "login") v = "home";
  if (v === "desk" && !isStaff()) v = "home";
  view = v;
  document.body.classList.toggle("locked", v === "login");
  $$(".view").forEach(s => s.classList.toggle("active", s.id === "v-" + v));
  $$("#nav button").forEach(b => b.classList.toggle("active", b.dataset.v === v));
  render(); window.scrollTo(0, 0);
  if (loaded && v !== "login") refresh();
}
$$("#nav button").forEach(b => b.onclick = () => go(b.dataset.v));

/* ============================================================
   LOGIN / REGISTER
   ============================================================ */
let loginTab = "login";
function renderLogin() {
  const el = $("#loginBody");
  const tabs = `<div class="tabs" style="margin-bottom:6px"><button class="${loginTab === "login" ? "on" : ""}" onclick="loginTab='login';renderLogin()">Log in</button><button class="${loginTab === "register" ? "on" : ""}" onclick="loginTab='register';renderLogin()">Create account</button></div>`;
  if (loginTab === "login") {
    el.innerHTML = `${tabs}<h2>Welcome back</h2><div class="meta">Students log in with their USN. Security Desk staff use their staff ID.</div>
      <form id="lForm" novalidate>
        <div class="field" data-f="usn"><label for="lUsn">USN / Staff ID</label><input id="lUsn" maxlength="20" autocomplete="username" placeholder="e.g. 4MT23CS001" style="text-transform:uppercase"><div class="err">Enter your USN or staff ID.</div></div>
        <div class="field" data-f="password"><label for="lPw">Password</label><input id="lPw" type="password" autocomplete="current-password"><div class="err">Enter your password.</div></div>
        <div class="row" style="margin-top:16px"><button class="btn teal" type="submit" id="lSubmit">Log in</button>
          <button type="button" class="btn ghost" onclick="guest=true;go('home')">Browse without logging in</button></div>
        <div id="lErr" class="meta" style="color:var(--err);font-weight:600;margin-top:10px"></div>
      </form>`;
    $("#lForm").onsubmit = doLogin;
  } else {
    el.innerHTML = `${tabs}<h2>Create your account</h2><div class="meta">One time only. Your phone and USN are only shown to the Security Desk.</div>
      <form id="lForm" novalidate>
        <div class="field" data-f="name"><label for="rgName">Full name *</label><input id="rgName" maxlength="60" autocomplete="name"><div class="err">Enter your full name.</div></div>
        <div class="two">
          <div class="field" data-f="usn"><label for="rgUsn">USN *</label><input id="rgUsn" maxlength="12" placeholder="e.g. 4MT23CS001" style="text-transform:uppercase" autocomplete="username"><div class="err">Enter a valid USN, like 4MT23CS001.</div></div>
          <div class="field" data-f="dept"><label for="rgDept">Department *</label><select id="rgDept"><option value="">Choose…</option>${DEPTS.filter(d => d !== "Staff").map(d => `<option>${esc(d)}</option>`).join("")}</select><div class="err">Choose your department.</div></div>
        </div>
        <div class="field" data-f="phone"><label for="rgPhone">Phone / WhatsApp *</label><input id="rgPhone" inputmode="tel" maxlength="15" autocomplete="tel"><div class="err">Enter a valid 10-digit Indian mobile number.</div></div>
        <div class="two">
          <div class="field" data-f="password"><label for="rgPw">Password *</label><input id="rgPw" type="password" autocomplete="new-password"><div class="err">Use at least 8 characters.</div></div>
          <div class="field" data-f="password2"><label for="rgPw2">Confirm password *</label><input id="rgPw2" type="password" autocomplete="new-password"><div class="err">Passwords don't match.</div></div>
        </div>
        <div class="row" style="margin-top:16px"><button class="btn teal" type="submit" id="lSubmit">Create account</button></div>
        <div id="lErr" class="meta" style="color:var(--err);font-weight:600;margin-top:10px"></div>
      </form>`;
    $("#lForm").onsubmit = doRegister;
  }
}
async function afterLogin(user) {
  me = user; guest = false;
  setPills(); await refresh(); schedule();
  go(isStaff() ? "desk" : "home");
  toast("Welcome, " + user.name.split(" ")[0] + "!");
}
async function doLogin(e) {
  e.preventDefault(); const form = e.target;
  const usn = $("#lUsn").value.trim(), pw = $("#lPw").value;
  let ok = setBad(form, "usn", usn.length < 3); ok = setBad(form, "password", !pw) && ok;
  if (!ok) return;
  const btn = $("#lSubmit"); btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Logging in…'; $("#lErr").textContent = "";
  try { const d = await api("/login", { usn, password: pw }); await afterLogin(d.user); }
  catch (err) { $("#lErr").textContent = err.error; btn.disabled = false; btn.textContent = "Log in"; }
}
async function doRegister(e) {
  e.preventDefault(); const form = e.target;
  const v = { name: $("#rgName").value.trim(), usn: $("#rgUsn").value.trim().toUpperCase().replace(/\s/g, ""), dept: $("#rgDept").value, phone: $("#rgPhone").value, password: $("#rgPw").value };
  let ok = setBad(form, "name", v.name.length < 2 && "Enter your full name.");
  ok = setBad(form, "usn", !USN_RE.test(v.usn) && "Enter a valid USN, like 4MT23CS001.") && ok;
  ok = setBad(form, "dept", !v.dept && "Choose your department.") && ok;
  ok = setBad(form, "phone", !validPhone(v.phone) && "Enter a valid 10-digit Indian mobile number.") && ok;
  ok = setBad(form, "password", v.password.length < 8 && "Use at least 8 characters.") && ok;
  ok = setBad(form, "password2", v.password !== $("#rgPw2").value && "Passwords don't match.") && ok;
  if (!ok) return;
  const btn = $("#lSubmit"); btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Creating…'; $("#lErr").textContent = "";
  try { const d = await api("/register", v); await afterLogin(d.user); }
  catch (err) { showServerErrors(form, err); $("#lErr").textContent = err.error; btn.disabled = false; btn.textContent = "Create account"; }
}
async function logout() {
  try { await api("/logout", {}); } catch (e) {}
  me = null; guest = false; my = { reports: [], claims: [] }; staff = { reports: [], claims: [] }; notes = []; staffNotes = [];
  closeModal(); setPills(); loginTab = "login"; go("login");
}
function renderBell() {
  const unread = notes.filter(n => !n.read).length;
  $("#bell").hidden = !me;
  $("#bellCount").hidden = !unread; $("#bellCount").textContent = unread > 9 ? "9+" : unread;
}
$("#bell").onclick = () => { go("mine"); setTimeout(() => { const el = $("#notifs"); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 50); };
async function markRead() {
  if (!notes.some(n => !n.read)) return;
  try {
    await api("/notifications/read", {});
    notes = notes.map(n => ({ ...n, read: true })); renderBell(); renderMine();
    toast("Inbox marked as read.");
  } catch (e) { toast(e.error || "Could not update inbox.", true); }
}
const noteIcon = k => ({ match: "✨", approved: "✅", owner_found: "🙌", rejected: "ℹ️", claim_submitted: "📩", claim_received: "🛡️" }[k] || "🔔");
const waLabel = s => ({ sent: "WhatsApp delivered to provider", sending: "WhatsApp sending…", failed: "WhatsApp delivery failed · saved in inbox", not_configured: "Saved in FINDORA inbox · WhatsApp not configured", sent_manually: "WhatsApp opened manually", no_phone: "Saved in inbox · no phone number" }[s] || "Saved in FINDORA inbox");
function renderUserChip() {
  $("#userChip").hidden = !(me || guest);
  $("#userName").textContent = me ? me.name + (isStaff() ? " · Staff" : "") : "Guest";
  $("#userChip button").textContent = me ? "Log out" : "Log in";
}
function setPills() {
  const a = $("#aiPill");
  a.textContent = config.ai ? "AI matching on" : "AI off · quick match";
  a.className = "pill" + (config.ai ? " on" : "");
  a.title = config.ai ? "AI provider: " + config.provider : "Add an AI key on the server to turn on AI";
  $("#rolePill").hidden = true;
}

/* ============================================================
   HOME + BROWSE
   ============================================================ */
function card(r) {
  const m = matchesFor(r, 1)[0];
  return `<button class="item" onclick="openItem(${arg(r.id)})">
    <div class="thumb">${thumb(r)}</div>
    <div class="body">
      <div class="row" style="gap:6px">${typeTag(r)} ${!ACTIVE(r.status) ? statusTag(r.status) : ""} ${m && m.score >= 75 ? '<span class="tag ai">Possible match</span>' : ""} ${r.sample ? '<span class="tag sample">Sample</span>' : ""}</div>
      <div class="title">${esc(r.title)}</div>
      <div class="meta">📍 ${esc(r.loc)} · ${fmtDate(r.date)}${ACTIVE(r.status) && r.type === "found" ? " · " + esc(r.status) : ""}</div>
    </div></button>`;
}
const loadingHTML = `<div class="card empty"><span class="spin"></span> Loading reports…</div>`;
function renderHome() {
  const v = reports;
  const set = (id, n) => $(id).textContent = loaded ? n : "–";
  const pairs = v.filter(r => r.type === "lost" && ACTIVE(r.status)).map(r => ({ lost: r, m: matchesFor(r, 1)[0] }))
    .filter(p => p.m && p.m.score >= 75).sort((a, b) => b.m.score - a.m.score);
  set("#sLost", v.filter(r => r.type === "lost" && ACTIVE(r.status)).length);
  set("#sFound", v.filter(r => r.type === "found" && ACTIVE(r.status)).length);
  set("#sMatch", pairs.length);
  set("#sRet", v.filter(r => r.status === "Returned").length);
  if (!loaded) { $("#homeMatches").innerHTML = loadingHTML; $("#homeRecent").innerHTML = ""; return; }
  $("#homeMatches").innerHTML = pairs.length ? pairs.slice(0, 3).map(p => `
    <div class="match" style="cursor:pointer" onclick="openItem(${arg(p.lost.id)})">
      <div class="top"><div class="thumb">${thumb(p.lost)}</div>
        <div><b>${esc(p.lost.title)}</b> <span class="meta">↔</span> <b>${esc(p.m.other.title)}</b>
          <div class="meta">${p.m.ai ? '<span class="tag ai">AI</span> ' : '<span class="tag st">Quick check</span> '}${esc(p.m.reason || p.m.same.slice(0, 2).join(" · "))}</div></div>
        ${strengthHTML(p.m.score)}</div></div>`).join("")
    : `<div class="card empty">No strong suggestions right now. New reports are checked automatically.</div>`;
  const recent = [...v].sort((a, b) => b.created - a.created).slice(0, 8);
  $("#homeRecent").innerHTML = recent.length ? recent.map(card).join("") : `<div class="card empty" style="grid-column:1/-1">No reports yet. Be the first to post one.</div>`;
}
function renderBrowse() {
  if (!loaded) { $("#browseList").innerHTML = loadingHTML; return; }
  const q = tokens($("#q").value), t = $("#fType").value, c = $("#fCat").value, l = $("#fLoc").value, s = $("#fStatus").value;
  const list = reports.filter(r =>
    (!t || r.type === t) && (!c || r.cat === c) && (!l || r.loc === l) &&
    (s === "active" ? ACTIVE(r.status) : !s || r.status === s) &&
    (!q.length || (() => { const tk = tokens(r.title + " " + r.desc + " " + r.cat); return q.every(w => tk.some(x => x.startsWith(w))); })())
  ).sort((a, b) => b.created - a.created);
  $("#browseList").innerHTML = list.length ? list.map(card).join("") : `<div class="card empty" style="grid-column:1/-1">No reports match these filters.</div>`;
}

/* ============================================================
   ITEM DETAILS + MATCHES
   ============================================================ */
function openItem(id) { openId = id; claimFor = null; drawModal(); $("#mBg").classList.add("open"); if (loaded) refresh(); }
function closeModal() { openId = null; claimFor = null; $("#mBg").classList.remove("open"); }
$("#mBg").addEventListener("click", e => { if (e.target.id === "mBg") closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
const myClaimOn = id => my.claims.find(c => c.itemId === id && ["Pending", "Approved"].includes(c.status));
const canClaim = r => r && r.type === "found" && ACTIVE(r.status) && (!r.mine || isStaff());

function drawModal() {
  if (claimFor) { drawClaimForm(); return; }
  const r = findR(openId);
  if (!r) { closeModal(); return; }
  const ms = matchesFor(r), busy = aiBusy[r.id] || r.aiStatus === "pending", p = privOf(r.id);
  const myClaim = myClaimOn(r.id);
  let actions = "";
  if (canClaim(r)) actions += myClaim ? `<span class="tag pend">Your claim: ${esc(myClaim.status)}</span>` : `<button class="btn teal sm" onclick="startClaim(${arg(r.id)})">This is mine — start a claim</button>`;
  if (r.type === "lost" && ACTIVE(r.status) && !r.mine) actions += `<button class="btn found sm" onclick="closeModal();openReport('found',${arg(r.id)})">I found this item</button>`;
  if (r.type === "lost" && ACTIVE(r.status) && r.mine) actions += `<button class="btn ghost sm" onclick="closeOwn(${arg(r.id)})">I got it back — close report</button>`;
  if (config.ai && me && ACTIVE(r.status)) actions += `<button class="btn violet sm" ${busy ? "disabled" : ""} onclick="runAI(${arg(r.id)})">${busy ? '<span class="spin"></span> AI checking…' : (r.ai ? "Re-check with AI" : "Check matches with AI")}</button>`;
  const privHTML = p && p.hidden ? `<div class="box priv"><h5>🔒 Private (${r.mine ? "you" : "staff"} only)</h5>${esc(p.hidden)}${p.reporter ? `<div class="meta">${esc(p.reporter.name)}${p.reporter.usn ? " · " + esc(p.reporter.usn) : ""}${p.reporter.phone ? " · " + esc(p.reporter.phone) : ""}</div>` : ""}</div>`
    : `<div class="meta">🔒 Contact details are private. Claims go through the Security Desk.</div>`;
  $("#modal").innerHTML = `<button class="x" onclick="closeModal()" aria-label="Close">✕</button>
    <div class="detail">
      <div class="thumb">${thumb(r)}</div>
      <div>
        <div class="row" style="gap:6px">${typeTag(r)} ${statusTag(r.status)} ${r.sample ? '<span class="tag sample">Sample</span>' : ""} ${r.mine ? '<span class="tag ai">Your report</span>' : ""}</div>
        <h2 style="margin:8px 0 6px">${esc(r.title)}</h2>
        <div class="meta">${CATS[r.cat] || "📦"} ${esc(r.cat)} · 🎨 ${esc(r.color)} · 📍 ${esc(r.loc)} · 📅 ${r.type === "lost" ? "Lost" : "Found"} ${fmtDate(r.date)}</div>
        <p style="margin:10px 0">${esc(r.desc)}</p>
        ${privHTML}
        <div class="row" style="margin-top:12px">${actions}</div>
      </div>
    </div>
    ${ACTIVE(r.status) ? `<h3 style="margin:20px 0 6px">Possible matches (${ms.length})</h3>
    <div class="note">These are suggestions to check, not proof. The score shows how similar the reports are, not a guarantee. Ownership is always confirmed by the Security Desk.</div>
    ${busy ? `<div class="note"><span class="spin"></span> AI is comparing this report with every ${r.type === "lost" ? "found" : "lost"} report…</div>` : ""}
    ${r.aiStatus === "failed" && !busy ? `<div class="note">AI check didn't finish, so these are quick-check results.</div>` : ""}
    ${ms.length ? ms.map(m => matchHTML(r, m)).join("") : (busy ? "" : `<div class="empty">No likely matches yet. We'll show them here when a similar report is posted.</div>`)}` : `<div class="note">This report is closed (${esc(r.status)}).</div>`}`;
}
function matchHTML(r, m) {
  const o = m.other, myClaim = myClaimOn(o.id);
  let act = "";
  if (canClaim(o)) act = myClaim ? `<span class="tag pend">Your claim: ${esc(myClaim.status)}</span>` : `<button class="btn teal sm" onclick="event.stopPropagation();startClaim(${arg(o.id)}, ${arg(r.id)})">This is mine — claim</button>`;
  return `<div class="match">
    <div class="top" style="cursor:pointer" onclick="openItem(${arg(o.id)})">
      <div class="thumb">${thumb(o)}</div>
      <div><b>${esc(o.title)}</b> ${typeTag(o)} ${m.ai ? '<span class="tag ai">AI review</span>' : '<span class="tag st">Quick check</span>'}
        <div class="meta">📍 ${esc(o.loc)} · ${fmtDate(o.date)} · ${esc(o.status)}</div>
        ${m.reason ? `<div class="meta" style="margin-top:2px">${esc(m.reason)}</div>` : ""}</div>
      ${strengthHTML(m.score)}
    </div>
    <div class="sd">
      <div><b class="s">✓ Similar</b><ul>${m.same.length ? m.same.map(x => `<li>${esc(x)}</li>`).join("") : "<li>—</li>"}</ul></div>
      <div><b class="d">✗ Different</b><ul>${m.diff.length ? m.diff.map(x => `<li>${esc(x)}</li>`).join("") : "<li>No clear differences</li>"}</ul></div>
    </div>
    ${act ? `<div class="row" style="margin-top:10px">${act}</div>` : ""}
  </div>`;
}
async function runAI(id) {
  const r = findR(id); if (!r || aiBusy[id]) return;
  aiBusy[id] = true; render();
  try { await api("/reports/" + encodeURIComponent(id) + "/ai", {}); await refresh(); toast("AI check done"); }
  catch (e) { toast(e.error, true); }
  aiBusy[id] = false; render(); schedule();
}
async function closeOwn(id) {
  try { await api("/reports/" + encodeURIComponent(id) + "/close", {}); await refresh(); toast("Report closed. Glad you got it back!"); }
  catch (e) { toast(e.error, true); }
}

/* ---------- claims ---------- */
function startClaim(foundId, lostId) {
  if (!me) { closeModal(); go("login"); toast("Log in to make a claim"); return; }
  claimFor = { foundId, lostId: lostId || "" };
  if (!$("#mBg").classList.contains("open")) { openId = foundId; $("#mBg").classList.add("open"); }
  drawClaimForm();
}
function drawClaimForm() {
  const f = findR(claimFor.foundId); if (!f) { closeModal(); return; }
  const myLost = my.reports.filter(r => r.type === "lost" && ACTIVE(r.status));
  $("#modal").innerHTML = `<button class="x" onclick="claimFor=null;drawModal()" aria-label="Back">✕</button>
    <h2 style="margin:0 0 4px">Claim: ${esc(f.title)}</h2>
    <div class="meta">Found at ${esc(f.loc)} on ${fmtDate(f.date)}</div>
    <div class="note">🔒 What you write here is private. Only the Security Desk sees it. They compare it with the secret detail the finder gave. AI never approves a claim.</div>
    <form id="cForm" novalidate>
      <div class="field" data-f="proof"><label for="cProof">Proof that it's yours *</label>
        <textarea id="cProof" maxlength="500" placeholder="A detail that is NOT in the public description: a scratch, a name written inside, what's inside it, lock-screen photo, serial number…"></textarea>
        <div class="err">Describe your proof (at least 15 letters).</div></div>
      ${myLost.length ? `<div class="field"><label for="cLost">Link to my lost report (optional)</label>
        <select id="cLost"><option value="">— none —</option>${myLost.map(r => `<option value="${esc(r.id)}" ${r.id === claimFor.lostId ? "selected" : ""}>${esc(r.title)}</option>`).join("")}</select></div>` : ""}
      <div class="meta" style="margin-top:8px">The desk will contact you on the phone number in your account.</div>
      <div class="row" style="margin-top:16px"><button class="btn teal" type="submit" id="cSubmit">Send claim to Security Desk</button><button type="button" class="btn ghost" onclick="claimFor=null;drawModal()">Cancel</button></div>
    </form>`;
  $("#cForm").onsubmit = submitClaim;
}
async function submitClaim(e) {
  e.preventDefault(); const form = e.target;
  const proof = $("#cProof").value.trim();
  if (!setBad(form, "proof", proof.length < 15)) return;
  const btn = $("#cSubmit"); btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Sending…';
  try {
    await api("/claims", { itemId: claimFor.foundId, lostId: ($("#cLost") && $("#cLost").value) || "", proof });
    closeModal(); await refresh(); toast("Claim sent. Check its status in My activity."); go("mine");
  } catch (err) { showServerErrors(form, err); toast(err.error, true); btn.disabled = false; btn.textContent = "Send claim to Security Desk"; }
}

/* ============================================================
   MY ACTIVITY
   ============================================================ */
function renderMine() {
  const el = $("#mineBody");
  if (!me) { el.innerHTML = `<div class="card empty">Log in to see your reports and claims.</div>`; return; }
  const myR = [...my.reports].sort((a, b) => b.created - a.created);
  const myC = [...my.claims].sort((a, b) => b.created - a.created);
  const next = s => s === "Pending" ? "Security Desk is checking your proof." : s === "Approved" ? "Approved! Collect it from the Security Desk with your college ID." : s === "Returned" ? "Handed over to you." : "Not approved.";
  el.innerHTML = `<div class="card" style="margin-bottom:6px"><b>${esc(me.name)}</b> <span class="meta">${esc(me.usn)} · ${esc(me.dept)} · inbox alerts are enabled</span></div>
    <div class="row" style="justify-content:space-between;align-items:center;margin-top:26px"><h2 class="sec" id="notifs" style="margin:0">Inbox & notifications</h2>${notes.some(n => !n.read) ? '<button class="btn ghost sm" onclick="markRead()">Mark all as read</button>' : '<span class="tag ret">All caught up</span>'}</div>
    <div class="card" style="padding:0;margin-top:12px">${notes.length ? notes.map(n => `
      <div class="notif ${n.read ? "" : "unread"}"><div class="ic">${noteIcon(n.kind)}</div>
        <div><div style="white-space:pre-line">${esc(n.text.replace(/\nOpen FINDORA.*$/s, ""))}</div><div class="meta">${new Date(n.created).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · 💬 ${esc(waLabel(n.whatsapp))}</div></div>
        <div>${n.read ? "" : '<span class="tag ai">New</span>'}</div></div>`).join("") : `<div class="empty">Your inbox is ready. When a possible lost/found match or claim update appears, it will be saved here—even if WhatsApp is unavailable.</div>`}</div>
    <h2 class="sec">My claims</h2>
    <div class="card" style="padding:0">${myC.length ? myC.map(c => { const it = findR(c.itemId); return `
      <div class="list-row"><div class="thumb">${it ? thumb(it) : "📦"}</div>
        <div><b>${esc(c.itemTitle)}</b> ${claimTag(c.status)}<div class="meta">${esc(next(c.status))}${c.note ? " Note: " + esc(c.note) : ""}</div></div>
        <div>${it ? `<button class="btn ghost sm" onclick="openItem(${arg(it.id)})">View</button>` : ""}</div></div>`; }).join("")
      : `<div class="empty">No claims yet.</div>`}</div>
    <h2 class="sec">My reports</h2>
    <div class="card" style="padding:0">${myR.length ? myR.map(r => { const pr = findR(r.id) || r; const m = matchesFor(pr, 1)[0]; return `
      <div class="list-row"><div class="thumb">${thumb(r)}</div>
        <div><b>${esc(r.title)}</b> ${typeTag(r)} ${statusTag(r.status)}
          <div class="meta">📍 ${esc(r.loc)} · ${fmtDate(r.date)}${m ? " · Top match: " + level(m.score)[0].toLowerCase() + " (" + esc(m.other.title) + ")" : ""}</div></div>
        <div><button class="btn ghost sm" onclick="openItem(${arg(r.id)})">Open</button></div></div>`; }).join("")
      : `<div class="empty">You haven't posted any reports.<div class="row" style="justify-content:center;margin-top:10px"><button class="btn lost sm" onclick="openReport('lost')">Report lost item</button><button class="btn found sm" onclick="openReport('found')">Report found item</button></div></div>`}</div>`;
}

/* ============================================================
   SECURITY DESK
   ============================================================ */
$$("#deskTabs button").forEach(b => b.onclick = () => { deskTab = b.dataset.t; $$("#deskTabs button").forEach(x => x.classList.toggle("on", x === b)); renderDesk(); });
function renderDesk() {
  const el = $("#deskBody");
  if (!isStaff()) { el.innerHTML = `<div class="card empty">Staff only.</div>`; return; }
  if (deskTab === "claims") {
    const order = { Pending: 0, Approved: 1, Returned: 2, Rejected: 3 };
    const list = [...staff.claims].sort((a, b) => (order[a.status] - order[b.status]) || b.created - a.created);
    el.innerHTML = list.length ? list.map(claimCard).join("") : `<div class="card empty">No claims yet.</div>`;
  } else if (deskTab === "found" || deskTab === "all") {
    const list = staff.reports.filter(r => deskTab === "all" || r.type === "found").sort((a, b) => (ACTIVE(b.status) - ACTIVE(a.status)) || b.created - a.created);
    el.innerHTML = (deskTab === "found" && config.ai ? `<div class="row" style="margin-bottom:10px"><button class="btn violet sm" id="aiAll" onclick="aiAll()">Run AI matching on all open lost reports</button><span id="aiAllMsg" class="meta"></span></div>` : "")
      + `<div class="card" style="padding:0">${list.length ? list.map(deskRow).join("") : `<div class="empty">No reports.</div>`}</div>`;
  } else if (deskTab === "wa") {
    el.innerHTML = `<div class="card" style="margin-bottom:12px"><b>WhatsApp messages</b><div class="meta">${config.whatsapp
        ? "Automatic sending is ON (" + esc(config.whatsapp) + "). Failed messages can be retried or sent by hand."
        : "Automatic sending is OFF (no WhatsApp API set up). Tap “Send on WhatsApp” to open WhatsApp with the message ready, then tap send."}</div></div>
      <div class="card" style="padding:0">${staffNotes.length ? staffNotes.map(n => `
        <div class="notif"><div class="ic">${noteIcon(n.kind)}</div>
          <div><b>To ${esc(n.to.name || "?")}</b> <span class="meta">${esc(n.to.usn || "")} · ${esc(n.to.phone || "no phone")}</span>
            <div style="white-space:pre-line;font-size:14px;margin-top:4px">${esc(n.text)}</div>
            <div class="meta">${new Date(n.created).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · <b>${esc(waLabel(n.status))}</b>${n.error ? " — " + esc(n.error) : ""}</div></div>
          <div class="row" style="gap:6px;justify-content:flex-end;flex-direction:column;align-items:stretch">
            ${n.waLink && !["sent", "sent_manually"].includes(n.status) ? `<a class="btn sm wa-btn" href="${esc(n.waLink)}" target="_blank" rel="noopener" onclick="markManual(${arg(n.id)})">💬 Send on WhatsApp</a>` : ""}
            ${config.whatsapp && n.status === "failed" ? `<button class="btn ghost sm" onclick="retryWA(${arg(n.id)})">Retry</button>` : ""}
          </div></div>`).join("") : `<div class="empty">No messages yet. They appear here when a match is found or a claim is decided.</div>`}</div>`;
  } else {
    el.innerHTML = `<div class="card form" style="margin:0;max-width:560px"><b>Add a Security Desk login</b><div class="meta">For other staff members. They log in with this ID and password.</div>
      <form id="sForm" novalidate>
        <div class="two"><div class="field"><label for="sId">Staff ID</label><input id="sId" maxlength="20" placeholder="e.g. SECURITY02" style="text-transform:uppercase"></div>
        <div class="field"><label for="sName">Name</label><input id="sName" maxlength="60"></div></div>
        <div class="field"><label for="sPw">Password (8+ characters)</label><input id="sPw" type="password" autocomplete="new-password"></div>
        <div class="row" style="margin-top:14px"><button class="btn navy" type="submit">Add staff login</button><span id="sMsg" class="meta"></span></div>
      </form></div>`;
    $("#sForm").onsubmit = async e => {
      e.preventDefault();
      try { await api("/staff/users", { usn: $("#sId").value.trim(), name: $("#sName").value.trim(), password: $("#sPw").value }); e.target.reset(); $("#sMsg").textContent = "✅ Staff login added."; }
      catch (err) { $("#sMsg").textContent = err.error; }
    };
  }
}
function deskRow(r) {
  const pend = staff.claims.filter(c => c.itemId === r.id && c.status === "Pending").length, p = r.reporter;
  return `<div class="list-row"><div class="thumb">${thumb(r)}</div>
    <div><b style="cursor:pointer" onclick="openItem(${arg(r.id)})">${esc(r.title)}</b> ${typeTag(r)} ${statusTag(r.status)} ${pend ? `<span class="tag pend">${pend} claim${pend > 1 ? "s" : ""}</span>` : ""} ${r.sample ? '<span class="tag sample">Sample</span>' : ""}
      <div class="meta">📍 ${esc(r.loc)} · ${fmtDate(r.date)} · ${p ? "🔒 " + esc(p.name) + (p.usn ? " · " + esc(p.usn) : "") + (p.phone ? " · " + esc(p.phone) : "") : "unknown reporter"}</div></div>
    <div class="row" style="gap:6px;justify-content:flex-end">
      ${r.type === "found" && r.status === "With finder" ? `<button class="btn ghost sm" onclick="setStatus(${arg(r.id)},'At Security Desk')">Received at desk</button>` : ""}
      ${ACTIVE(r.status) ? `<button class="btn found sm" onclick="setStatus(${arg(r.id)},'Returned')">Mark returned</button>` : ""}
      <button class="btn danger sm" onclick="removeReport(${arg(r.id)})">Remove</button>
    </div></div>`;
}
function claimCard(c) {
  const f = c.item, lost = c.lost, u = c.claimant || {}, v = aiVerdict[c.id];
  return `<div class="card" style="margin-bottom:12px">
    <div class="row" style="justify-content:space-between"><div><b>${esc(c.itemTitle)}</b> ${claimTag(c.status)}</div><span class="meta">${new Date(c.created).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span></div>
    <div class="claim" style="margin-top:10px">
      <div class="box"><h5>Found item (public)</h5>${f ? `${esc(f.desc)}<div class="meta">📍 ${esc(f.loc)} · ${fmtDate(f.date)} · ${esc(f.status)}</div>` : "Report no longer exists."}</div>
      <div class="box priv"><h5>🔒 Finder's secret detail</h5>${f && f.hidden ? esc(f.hidden) : "Not on file."}${f && f.reporter ? `<div class="meta">Finder: ${esc(f.reporter.name)}${f.reporter.phone ? " · " + esc(f.reporter.phone) : ""}</div>` : ""}</div>
      <div class="box priv"><h5>🔒 Claimant's proof</h5>${esc(c.proof)}<div class="meta">Claimant: ${esc(u.name)} · USN ${esc(u.usn)} · ${esc(u.dept)} · ${esc(u.phone)}</div></div>
      <div class="box priv"><h5>🔒 Claimant's lost report</h5>${lost ? `<b>${esc(lost.title)}</b> — ${esc(lost.desc)}${lost.hidden ? `<div style="margin-top:4px">Secret: ${esc(lost.hidden)}</div>` : ""}` : "Not linked."}</div>
    </div>
    ${v && v !== "busy" ? `<div class="note"><b>AI hint (advisory only — staff decide): ${esc(v.verdict)}</b><br>${esc(v.reason)}</div>` : ""}
    ${c.status === "Pending" ? `<div class="row" style="margin-top:12px">
        <button class="btn teal sm" onclick="decide(${arg(c.id)},'Approved')">Approve claim</button>
        ${rejectOpen[c.id] ? `<input id="rej-${esc(c.id)}" placeholder="Reason (optional)" style="max-width:240px;padding:7px 10px"><button class="btn danger sm" onclick="decide(${arg(c.id)},'Rejected')">Confirm reject</button>`
          : `<button class="btn danger sm" onclick="rejectOpen[${arg(c.id)}]=true;renderDesk()">Reject</button>`}
        ${config.ai ? `<button class="btn violet sm" ${v === "busy" ? "disabled" : ""} onclick="aiVerify(${arg(c.id)})">${v === "busy" ? '<span class="spin"></span> Checking…' : "AI hint: compare proof"}</button>` : ""}
      </div>` : ""}
    ${c.status === "Approved" ? `<div class="row" style="margin-top:12px"><button class="btn found sm" onclick="handOver(${arg(c.id)})">Handed over — mark returned</button><span class="meta">Check the student's college ID before handing over.</span></div>` : ""}
    ${c.note ? `<div class="meta" style="margin-top:8px">Note: ${esc(c.note)}</div>` : ""}
  </div>`;
}
async function markManual(id) { try { await api("/staff/notifications/" + encodeURIComponent(id) + "/manual", {}); await refresh(); } catch (e) {} }
async function retryWA(id) {
  try { await api("/staff/notifications/" + encodeURIComponent(id) + "/retry", {}); await refresh(); toast("Sent on WhatsApp"); }
  catch (e) { toast(e.error, true); }
}
async function decide(id, status) {
  const note = status === "Rejected" ? (($("#rej-" + id) || {}).value || "").trim() : "";
  try { await api("/staff/claims/" + encodeURIComponent(id) + "/decide", { status, note }); delete rejectOpen[id]; await refresh(); toast(status === "Approved" ? "Claim approved. Hand over after checking ID." : "Claim rejected."); }
  catch (e) { toast(e.error, true); }
}
async function handOver(id) {
  try { await api("/staff/claims/" + encodeURIComponent(id) + "/handover", {}); await refresh(); toast("Recorded as returned 🎉"); }
  catch (e) { toast(e.error, true); }
}
async function setStatus(id, status) {
  try { await api("/reports/" + encodeURIComponent(id) + "/status", { status }); await refresh(); toast("Status updated: " + status); }
  catch (e) { toast(e.error, true); }
}
const removeAsk = {};
async function removeReport(id) {
  if (!removeAsk[id]) { removeAsk[id] = true; toast("Tap Remove again to confirm"); setTimeout(() => delete removeAsk[id], 3500); return; }
  delete removeAsk[id]; await setStatus(id, "Removed");
}
async function aiVerify(id) {
  aiVerdict[id] = "busy"; renderDesk();
  try { aiVerdict[id] = await api("/staff/claims/" + encodeURIComponent(id) + "/ai-hint", {}); }
  catch (e) { aiVerdict[id] = { verdict: "Not available", reason: e.error }; }
  renderDesk();
}
async function aiAll() {
  const btn = $("#aiAll"); if (btn) btn.disabled = true;
  const todo = reports.filter(r => r.type === "lost" && ACTIVE(r.status));
  for (let k = 0; k < todo.length; k++) {
    if ($("#aiAllMsg")) $("#aiAllMsg").innerHTML = `<span class="spin"></span> Checking ${k + 1} of ${todo.length}…`;
    try { await api("/reports/" + encodeURIComponent(todo[k].id) + "/ai", {}); }
    catch (e) { if ($("#aiAllMsg")) $("#aiAllMsg").textContent = "Stopped: " + e.error; if ($("#aiAll")) $("#aiAll").disabled = false; await refresh(); return; }
  }
  await refresh(); if ($("#aiAllMsg")) $("#aiAllMsg").textContent = "Done — AI checked " + todo.length + " lost reports.";
}

/* ============================================================
   REPORT FORM
   ============================================================ */
let rType = "lost", photoData = "";
const opts = (arr, first) => (first ? `<option value="">${first}</option>` : "") + arr.map(x => `<option>${esc(x)}</option>`).join("");
$("#rCat").innerHTML = opts(Object.keys(CATS), "Choose…");
$("#rColor").innerHTML = opts(COLORS, "Choose…");
$("#rLoc").innerHTML = `<option value="">Choose…</option>` + Object.entries(PLACES).map(([z, ps]) => `<optgroup label="${esc(z)}">${ps.map(p => `<option>${esc(p)}</option>`).join("")}</optgroup>`).join("");
$("#fCat").innerHTML = opts(Object.keys(CATS), "All categories");
$("#fLoc").innerHTML = opts(ALL_PLACES, "All places");
$("#rDate").max = today(); $("#rDate").value = today();
["#q", "#fType", "#fCat", "#fLoc", "#fStatus"].forEach(s => $(s).addEventListener("input", renderBrowse));
$$(".toggle button").forEach(b => b.onclick = () => setType(b.dataset.type));

function setType(t) {
  rType = t;
  $$(".toggle button").forEach(b => b.classList.toggle("on", b.dataset.type === t));
  const lost = t === "lost";
  $("#heldWrap").hidden = lost;
  $("#photoReq").textContent = lost ? "(optional, but helps a lot)" : "* (required for found items)";
  $("#locLabel").textContent = lost ? "Where did you last have it? *" : "Where did you find it? *";
  $("#dateLabel").textContent = lost ? "When did you lose it? *" : "When did you find it? *";
  $("#hiddenLabel").textContent = lost ? "A detail only the owner knows *" : "A detail to test claimants *";
  $("#rHidden").placeholder = lost ? "e.g. 'RS' scratched inside the case, lock screen is a cat photo" : "e.g. what's inside the wallet, name written under the cap";
  $("#rSubmit").className = "btn " + (lost ? "lost" : "found");
  $$("#rForm .field").forEach(f => f.classList.remove("bad"));
}
function openReport(t, fromLostId) {
  if (!me) { go("login"); toast("Log in to post a report"); return; }
  go("report"); setType(t);
  const l = fromLostId && findR(fromLostId);
  if (l) { $("#rCat").value = l.cat; $("#rColor").value = l.color; $("#rTitle").value = l.title; }
}

$("#rPhoto").onchange = e => {
  const file = e.target.files[0]; if (!file) return;
  if (!/^image\//.test(file.type)) { toast("Please choose an image file", true); e.target.value = ""; return; }
  const img = new Image(), fr = new FileReader();
  fr.onload = () => { img.src = fr.result; };
  img.onerror = () => toast("This image couldn't be opened. Try a JPG or PNG.", true);
  img.onload = () => {
    const c = document.createElement("canvas"), max = 900, k = Math.min(1, max / Math.max(img.width, img.height));
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    photoData = c.toDataURL("image/jpeg", 0.8);
    $("#rPreview").src = photoData; $("#rPreview").style.display = "block";
    $("#aiFill").hidden = !config.ai; $("#aiFillMsg").textContent = "";
    $('#rForm [data-f="photo"]').classList.remove("bad");
  };
  fr.readAsDataURL(file);
};
$("#aiFill").onclick = async () => {
  if (!photoData) return;
  const btn = $("#aiFill"), msg = $("#aiFillMsg");
  btn.disabled = true; msg.innerHTML = '<span class="spin"></span> AI is looking at the photo…';
  try {
    const out = await api("/ai/autofill", { photo: photoData });
    if (out.title) $("#rTitle").value = out.title;
    if (out.cat) $("#rCat").value = out.cat;
    if (out.color) $("#rColor").value = out.color;
    if (out.desc) $("#rDesc").value = out.desc;
    msg.textContent = "Filled by AI. Please check and edit.";
  } catch (e) { msg.textContent = e.error; }
  btn.disabled = false;
};

$("#rForm").onsubmit = async e => {
  e.preventDefault(); const form = e.target;
  if (!me) { go("login"); return; }
  const v = { type: rType, title: $("#rTitle").value.trim(), cat: $("#rCat").value, color: $("#rColor").value, desc: $("#rDesc").value.trim(),
    loc: $("#rLoc").value, date: $("#rDate").value, hidden: $("#rHidden").value.trim(), held: $("#rHeld").value, photo: photoData };
  let ok = setBad(form, "photo", rType === "found" && !photoData && "Please add a photo of the found item. It helps the owner recognise it.");
  ok = setBad(form, "title", v.title.length < 3) && ok;
  ok = setBad(form, "cat", !CATS[v.cat]) && ok;
  ok = setBad(form, "color", !COLORS.includes(v.color)) && ok;
  ok = setBad(form, "desc", v.desc.length < 10) && ok;
  ok = setBad(form, "loc", !ALL_PLACES.includes(v.loc)) && ok;
  ok = setBad(form, "date", !v.date || v.date > today()) && ok;
  ok = setBad(form, "hidden", v.hidden.length < 5) && ok;
  if (!ok) { const first = form.querySelector(".field.bad"); if (first) first.scrollIntoView({ behavior: "smooth", block: "center" }); toast("Please fix the highlighted fields", true); return; }
  const btn = $("#rSubmit"); btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Posting…';
  try {
    const d = await api("/reports", v);
    form.reset(); photoData = ""; $("#rPreview").style.display = "none"; $("#aiFill").hidden = true; $("#aiFillMsg").textContent = "";
    $("#rDate").value = today(); setType("lost");
    await refresh(); schedule();
    toast(config.ai ? "Report posted. AI is checking for matches…" : "Report posted.");
    go("browse"); openItem(d.report.id);
  } catch (err) {
    if (!showServerErrors(form, err)) toast(err.error, true); else toast(err.error, true);
  }
  btn.disabled = false; btn.textContent = "Post report & find matches";
};

/* ============================================================
   RENDER + START
   ============================================================ */
function render() {
  $$("#nav button[data-v=desk]").forEach(b => b.hidden = !isStaff());
  $$("#nav button[data-v=report], #nav button[data-v=mine]").forEach(b => b.hidden = !me);
  renderUserChip(); renderBell();
  if (view === "login") renderLogin();
  if (view === "home") renderHome();
  if (view === "browse") renderBrowse();
  if (view === "mine") renderMine();
  if (view === "desk") renderDesk();
  if (openId && $("#mBg").classList.contains("open") && !claimFor) drawModal();
}
// header button: Log out (logged in) or Log in (guest)
$("#userChip button").onclick = () => me ? logout() : (guest = false, go("login"));

(async function start() {
  go("login");
  try {
    const [c, m] = await Promise.all([api("/config"), api("/me")]);
    config = c; me = m.user;
  } catch (e) { banner(e.error, "warn"); }
  setPills();
  await refresh(); schedule();
  go(me ? (isStaff() ? "desk" : "home") : "login");
})();
