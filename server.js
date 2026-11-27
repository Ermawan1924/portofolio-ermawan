const express = require("express"), fs = require("fs"), path = require("path"), crypto = require("crypto");
const PORT = process.env.PORT || 3000, DATA = process.env.DATA_DIR || path.join(__dirname, "data");
const PASS = process.env.ADMIN_PASSWORD, SECRET = process.env.SESSION_SECRET;
if (!PASS || !SECRET || SECRET.length < 16) { console.error("Set ADMIN_PASSWORD and SESSION_SECRET (16+ chars)"); process.exit(1); }
const FILE = path.join(DATA, "content.json"), UP = path.join(DATA, "uploads");
fs.mkdirSync(UP, { recursive: true });
if (!fs.existsSync(FILE)) fs.copyFileSync(path.join(__dirname, "seed", "content.json"), FILE);

const app = express();
app.disable("x-powered-by");
if (process.env.TRUST_PROXY === "true") app.set("trust proxy", 1);
app.use((q, s, n) => { s.set({ "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "same-origin" }); n(); });

// --- auth: HMAC-signed expiring cookie, constant-time compare, login rate limit
const sign = v => crypto.createHmac("sha256", SECRET).update(v).digest("hex");
const h = v => crypto.createHash("sha256").update(v).digest();
const eq = (a, b) => crypto.timingSafeEqual(h(a), h(b));
const token = () => { const e = String(Date.now() + 12 * 3600e3); return e + "." + sign(e); };
const valid = t => { if (!t) return false; const [e, s] = t.split("."); return !!s && Number(e) > Date.now() && eq(s, sign(e)); };
const sid = q => (q.headers.cookie || "").split(";").map(c => c.trim()).find(c => c.startsWith("sid="))?.slice(4);
const auth = (q, s, n) => valid(sid(q)) ? n() : s.status(401).json({ error: "unauthorized" });
const tries = new Map();

app.post("/api/login", express.json({ limit: "2kb" }), (q, s) => {
  const t = tries.get(q.ip) || { n: 0, r: Date.now() + 6e4 };
  if (Date.now() > t.r) { t.n = 0; t.r = Date.now() + 6e4; }
  if (t.n >= 5) return s.status(429).json({ error: "too many attempts, wait a minute" });
  t.n++; tries.set(q.ip, t);
  if (typeof q.body.password !== "string" || !eq(q.body.password, PASS)) return s.status(401).json({ error: "wrong password" });
  tries.delete(q.ip);
  s.set("Set-Cookie", `sid=${token()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${process.env.COOKIE_SECURE === "true" ? "; Secure" : ""}`);
  s.json({ ok: true });
});
app.post("/api/logout", (q, s) => { s.set("Set-Cookie", "sid=; HttpOnly; Path=/; Max-Age=0"); s.json({ ok: true }); });
app.get("/api/session", (q, s) => s.json({ auth: valid(sid(q)) }));

// --- content
const T = (v, n) => String(v ?? "").slice(0, n);
const arr = (a, n) => (Array.isArray(a) ? a : []).slice(0, n);
function cleanContact(c) {
  c = c || {};
  const ok = (v, re) => { const t = String(v ?? "").trim().slice(0, 200); return re.test(t) ? t : ""; };
  return { email: ok(c.email, /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/), phone: ok(c.phone, /^\+?\d[\d\s()-]{5,24}$/),
    linkedin: ok(c.linkedin, /^https?:\/\/[^\s"'<>]+$/), website: ok(c.website, /^https?:\/\/[^\s"'<>]+$/) };
}
function clean(b) {
  if (!b || typeof b !== "object") throw "invalid body";
  const s = b.settings || {};
  const o = { settings: { lead: T(s.lead, 400), openToWork: !!s.openToWork, openText: T(s.openText, 80), about: T(s.about, 1200) }, projects: [], books: [],
    experience: arr(b.experience, 20).map(e => ({ role: T(e.role, 100), company: T(e.company, 100), dates: T(e.dates, 60), bullets: arr(e.bullets, 12).map(x => T(x, 300)) })),
    skills: arr(b.skills, 20).map(k => ({ category: T(k.category, 60), items: arr(k.items, 30).map(x => T(x, 40)) })),
    certs: arr(b.certs, 30).map(c => ({ date: T(c.date, 40), title: T(c.title, 120), issuer: T(c.issuer, 100) })),
    education: arr(b.education, 10).map(c => ({ date: T(c.date, 40), title: T(c.title, 120), issuer: T(c.issuer, 100) })),
    stats: arr(b.stats, 6).map(x => ({ value: T(x.value, 20), label: T(x.label, 60) })),
    contact: cleanContact(b.contact) };
  for (const p of (Array.isArray(b.projects) ? b.projects : []).slice(0, 30))
    o.projects.push({ date: T(p.date, 40), title: T(p.title, 100), desc: T(p.desc, 500), tags: (Array.isArray(p.tags) ? p.tags : []).slice(0, 8).map(t => T(t, 30)) });
  for (const k of (Array.isArray(b.books) ? b.books : []).slice(0, 30))
    o.books.push({ type: ["nf", "sf", "f"].includes(k.type) ? k.type : "nf", title: T(k.title, 120), author: T(k.author, 80), line: T(k.line, 300), cover: /^\/(covers|uploads)\/[\w.-]+$/.test(k.cover || "") ? k.cover : "" });
  return o;
}
const SEED = JSON.parse(fs.readFileSync(path.join(__dirname, "seed", "content.json"), "utf8"));
function read() { const c = JSON.parse(fs.readFileSync(FILE, "utf8")); for (const k of Object.keys(SEED)) if (c[k] === undefined) c[k] = SEED[k]; c.settings = { ...SEED.settings, ...(c.settings || {}) }; return c; }
app.get("/api/content", (q, s) => { s.set("Cache-Control", "no-store"); s.json(read()); });
app.put("/api/content", auth, express.json({ limit: "200kb" }), (q, s) => {
  let o; try { o = clean(q.body); } catch (e) { return s.status(400).json({ error: String(e) }); }
  fs.writeFileSync(FILE + ".tmp", JSON.stringify(o, null, 2)); fs.renameSync(FILE + ".tmp", FILE);
  s.json({ ok: true });
});

// --- cover uploads (jpeg/png/webp, 2 MB)
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
app.post("/api/upload", auth, express.raw({ type: Object.keys(EXT), limit: "2mb" }), (q, s) => {
  const e = EXT[q.headers["content-type"]];
  if (!e || !Buffer.isBuffer(q.body) || !q.body.length) return s.status(400).json({ error: "jpeg, png or webp up to 2 MB" });
  const n = crypto.randomBytes(8).toString("hex") + "." + e;
  fs.writeFileSync(path.join(UP, n), q.body); s.json({ url: "/uploads/" + n });
});

app.get("/healthz", (q, s) => s.send("ok"));
app.use("/uploads", express.static(UP, { maxAge: "7d" }));
app.get("/admin", (q, s) => s.sendFile(path.join(__dirname, "public", "admin.html")));
app.use(express.static(path.join(__dirname, "public")));
app.use((e, q, s, n) => s.status(400).json({ error: "bad request" }));
app.listen(PORT, () => console.log("portfolio listening on :" + PORT));
