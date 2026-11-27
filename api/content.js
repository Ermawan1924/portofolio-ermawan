const L = require("./_lib");
module.exports = L.handler(["GET", "PUT"], async (req, res) => {
  if (req.method === "GET") return res.json(await L.read());
  if (!L.authed(req)) return res.status(401).json({ error: "unauthorized" });
  let o; try { o = L.clean(req.body); } catch (e) { return res.status(400).json({ error: String(e) }); }
  await L.redis([["SET", "portfolio:content", JSON.stringify(o)]]);
  res.json({ ok: true });
});
