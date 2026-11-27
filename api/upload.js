const crypto = require("crypto"), L = require("./_lib");
const MAGIC = {
  "image/jpeg": b => b[0] === 0xff && b[1] === 0xd8,
  "image/png": b => b.slice(0, 4).toString("hex") === "89504e47",
  "image/webp": b => b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP"
};
module.exports = L.handler(["POST"], async (req, res) => {
  if (!L.authed(req)) return res.status(401).json({ error: "unauthorized" });
  const { type, data } = req.body || {};
  if (!MAGIC[type] || typeof data !== "string" || data.length > 400000 || !/^[A-Za-z0-9+/=]+$/.test(data)) return res.status(400).json({ error: "jpeg, png or webp, about 300 KB max" });
  const buf = Buffer.from(data, "base64");
  if (!buf.length || !MAGIC[type](buf)) return res.status(400).json({ error: "not a valid image" });
  const id = crypto.randomBytes(8).toString("hex");
  await L.redis([["SET", "img:" + id, type + "|" + data]]);
  res.json({ url: "/api/img?id=" + id });
});
