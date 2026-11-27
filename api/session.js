const L = require("./_lib");
module.exports = L.handler(["GET"], (req, res) => res.json({ auth: L.authed(req) }));
