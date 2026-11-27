const L = require("./_lib");
module.exports = L.handler(["POST"], async (req, res) => {
  const key = "rl:" + L.ip(req);
  const [n] = await L.redis([["INCR", key], ["EXPIRE", key, 60]]);
  if (n > 5) return res.status(429).json({ error: "too many attempts, wait a minute" });
  const p = req.body && req.body.password;
  if (typeof p !== "string" || !L.eq(p, L.PASS)) return res.status(401).json({ error: "wrong password" });
  await L.redis([["DEL", key]]);
  res.setHeader("Set-Cookie", L.cookie(L.token()));
  res.json({ ok: true });
});
