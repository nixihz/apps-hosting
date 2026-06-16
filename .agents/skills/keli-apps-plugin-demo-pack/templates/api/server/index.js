import http from 'node:http';

const port = Number(process.env.PORT || 4301);

http.createServer((req, res) => {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  if (req.url === '/health') return res.end(JSON.stringify({ ok: true }));
  res.end(JSON.stringify({ ok: true, plugin: '__NAME__', path: req.url }));
}).listen(port, () => {
  console.log(`__NAME__ api plugin listening on ${port}`);
});
