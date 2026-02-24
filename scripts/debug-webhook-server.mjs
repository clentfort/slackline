import { createServer } from "node:http";

const argPort = Number.parseInt(process.argv[2] ?? "", 10);
const envPort = Number.parseInt(process.env.PORT ?? "", 10);
const port = Number.isFinite(argPort) ? argPort : Number.isFinite(envPort) ? envPort : 8080;
const host = process.env.HOST || "127.0.0.1";

const server = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  let parsedBody = rawBody;
  if (rawBody.length > 0) {
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      parsedBody = rawBody;
    }
  }

  const timestamp = new Date().toISOString();
  const route = request.url || "/";
  process.stdout.write(`\n[${timestamp}] ${request.method || "POST"} ${route}\n`);

  if (rawBody.length > 0) {
    process.stdout.write(`${JSON.stringify(parsedBody, null, 2)}\n`);
  } else {
    process.stdout.write("(no body)\n");
  }

  response.writeHead(200, { "content-type": "application/json" });
  response.end(
    JSON.stringify({
      ok: true,
      receivedAt: timestamp,
    }),
  );
});

server.listen(port, host, () => {
  process.stdout.write(`Debug webhook server listening on http://${host}:${port}\n`);
});

let shuttingDown = false;

const shutdown = () => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  process.stdout.write("\nShutting down debug webhook server...\n");

  const forceExitTimer = setTimeout(() => {
    process.exit(0);
  }, 1000);
  forceExitTimer.unref();

  server.close(() => {
    clearTimeout(forceExitTimer);
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
