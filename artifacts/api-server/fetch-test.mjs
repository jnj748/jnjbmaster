import express from "express";
const app = express();
app.use((req, res, next) => { console.log("[srv]", req.method, req.url); next(); });
app.post("/foo", (req, res) => res.json({ ok: true, method: req.method }));
app.use((req, res) => res.status(599).json({ url: req.url, method: req.method }));
const srv = app.listen(0, async () => {
  const port = srv.address().port;
  const r = await fetch(`http://127.0.0.1:${port}/foo`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ a: 1 }),
  });
  console.log("client status:", r.status, "body:", await r.text());
  srv.close();
});
