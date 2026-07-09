import { createReadStream } from "node:fs";
import { createServer } from "node:http";

const port = 3000;
const host = "127.0.0.1";
const file = "sema_contributor_portal (2).html";

createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  createReadStream(file).pipe(res);
}).listen(port, host, () => {
  console.log(`Sema contributor portal: http://localhost:${port}/`);
});

