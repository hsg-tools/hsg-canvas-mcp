import http from "node:http";
import { spawn } from "node:child_process";

const PORT = process.env.PORT || 3000;
const SECRET_PATH = process.env.MCP_SECRET_PATH;

if (!SECRET_PATH) {
  console.error("MCP_SECRET_PATH is required");
  process.exit(1);
}

const MCP_PORT = 3001;

const child = spawn(
  "npx",
  [
    "-y",
    "canvas-lms-mcp",
    "serve",
    "--host",
    "127.0.0.1",
    "--port",
    String(MCP_PORT)
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env
    }
  }
);

child.on("exit", code => {
  console.error(`Canvas MCP exited with code ${code}`);
  process.exit(code ?? 1);
});

const proxy = http.createServer(async (req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  const allowedPath = `/mcp/${SECRET_PATH}`;

  if (req.url !== allowedPath) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const body = [];
  for await (const chunk of req) body.push(chunk);

  const upstream = await fetch(`http://127.0.0.1:${MCP_PORT}/mcp`, {
    method: req.method,
    headers: {
      "content-type": req.headers["content-type"] || "application/json",
      accept: req.headers["accept"] || "application/json, text/event-stream"
    },
    body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(body)
  });

  res.writeHead(upstream.status, Object.fromEntries(upstream.headers.entries()));

  if (upstream.body) {
    for await (const chunk of upstream.body) {
      res.write(chunk);
    }
  }

  res.end();
});

proxy.listen(PORT, "0.0.0.0", () => {
  console.log(`Proxy listening on port ${PORT}`);
});
