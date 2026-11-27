const L = require("./_lib");
module.exports = L.handler(["GET"], async (req, res) => {
  const id = String((req.query && req.query.id) || "");
  if (!/^[a-f0-9]{16}$/.test(id)) return res.status(404).end();
  const [v] = await L.redis([["GET", "img:" + id]]);
  if (!v) return res.status(404).end();
  const i = v.indexOf("|");
  res.setHeader("Content-Type", v.slice(0, i));
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.status(200).send(Buffer.from(v.slice(i + 1), "base64"));
});
