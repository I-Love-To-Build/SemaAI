import { createServer } from "node:http";
import next from "next";

const port = Number(process.env.PORT || 3002);
const hostname = process.env.HOSTNAME || "localhost";
const dev = process.env.NODE_ENV !== "production";

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

await app.prepare();

createServer((request, response) => {
  handle(request, response);
}).listen(port, () => {
  console.log(`Sema contributor platform ready at http://${hostname}:${port}`);
});
