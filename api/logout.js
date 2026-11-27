const L = require("./_lib");
module.exports = L.handler(["POST"], (req, res) => { res.setHeader("Set-Cookie", L.cookie("")); res.json({ ok: true }); });
