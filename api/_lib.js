const crypto = require("crypto");
const SEED = require("./_seed.json");
const RURL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const RTOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const PASS = process.env.ADMIN_PASSWORD, SECRET = process.env.SESSION_SECRET;
const CONF_MSG = "Server not configured: set ADMIN_PASSWORD, SESSION_SECRET (16+ chars), connect an Upstash Redis database, then redeploy.";
const configured = () => !!(PASS && SECRET && SECRET.length >= 16 && RURL && RTOK);

// Redis over Upstash REST (pipeline), no SDK needed
async function redis(cmds) {
  const r = await fetch(RURL + "/pipeline", { method: "POST", headers: { Authorization: "Bearer " + RTOK, "Content-Type": "application/json" }, body: JSON.stringify(cmds) });
  if (!r.ok) throw new Error("redis " + r.status);
  return (await r.json()).map(x => { if (x.error) throw new Error(x.error); return x.result; });
}

// stateless auth: HMAC-signed expiring cookie, constant-time compare
const sign = v => crypto.createHmac("sha256", SECRET || "x").update(v).digest("hex");
const hash = v => crypto.createHash("sha256").update(v).digest();
const eq = (a, b) => crypto.timingSafeEqual(hash(a), hash(b));
const token = () => { const e = String(Date.now() + 12 * 3600e3); return e + "." + sign(e); };
const sid = q => (q.headers.cookie || "").split(";").map(c => c.trim()).find(c => c.startsWith("sid="))?.slice(4);
const authed = q => { const t = sid(q); if (!t) return false; const [e, s] = t.split("."); return !!s && Number(e) > Date.now() && eq(s, sign(e)); };
const cookie = v => `sid=${v}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${v ? 43200 : 0}`;
const ip = q => String(q.headers["x-real-ip"] || (q.headers["x-forwarded-for"] || "").split(",")[0] || "unknown").replace(/[^\w.:-]/g, "").slice(0, 64);

const handler = (methods, fn) => async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!methods.includes(req.method)) return res.status(405).json({ error: "method not allowed" });
  if (!configured()) return res.status(500).json({ error: CONF_MSG });
  try { await fn(req, res); } catch (e) { console.error(e); if (!res.headersSent) res.status(500).json({ error: "server error" }); }
};

// validation / sanitising
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
  return {
    settings: { lead: T(s.lead, 400), openToWork: !!s.openToWork, openText: T(s.openText, 80), about: T(s.about, 1200) },
    projects: arr(b.projects, 30).map(p => ({ date: T(p.date, 40), title: T(p.title, 100), desc: T(p.desc, 500), tags: arr(p.tags, 8).map(t => T(t, 30)) })),
    books: arr(b.books, 30).map(k => ({ type: ["nf", "sf", "f"].includes(k.type) ? k.type : "nf", title: T(k.title, 120), author: T(k.author, 80), line: T(k.line, 300),
      cover: /^(\/covers\/[\w.-]+|\/api\/img\?id=[a-f0-9]{16})$/.test(k.cover || "") ? k.cover : "" })),
    experience: arr(b.experience, 20).map(e => ({ role: T(e.role, 100), company: T(e.company, 100), dates: T(e.dates, 60), bullets: arr(e.bullets, 12).map(x => T(x, 300)) })),
    skills: arr(b.skills, 20).map(k => ({ category: T(k.category, 60), items: arr(k.items, 30).map(x => T(x, 40)) })),
    certs: arr(b.certs, 30).map(c => ({ date: T(c.date, 40), title: T(c.title, 120), issuer: T(c.issuer, 100) })),
    education: arr(b.education, 10).map(c => ({ date: T(c.date, 40), title: T(c.title, 120), issuer: T(c.issuer, 100) })),
    stats: arr(b.stats, 6).map(x => ({ value: T(x.value, 20), label: T(x.label, 60) })),
    contact: cleanContact(b.contact)
  };
}
async function read() {
  const [v] = await redis([["GET", "portfolio:content"]]);
  const c = v ? JSON.parse(v) : {};
  for (const k of Object.keys(SEED)) if (c[k] === undefined) c[k] = SEED[k];
  c.settings = { ...SEED.settings, ...(c.settings || {}) };
  return c;
}
module.exports = { PASS, CONF_MSG, configured, redis, eq, token, authed, cookie, ip, handler, clean, read };
