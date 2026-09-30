import http from "node:http";
import { spawn } from "node:child_process";

const PORT = Number(process.env.PORT || 3000);
const MCP_PORT = 3001;
const SECRET_PATH = process.env.MCP_SECRET_PATH;

if (!SECRET_PATH) {
  console.error("MCP_SECRET_PATH is required");
  process.exit(1);
}

// Canvas MCP nur intern auf localhost starten
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
    env: process.env
  }
);

child.on("exit", (code) => {
  console.error(`Canvas MCP exited with code ${code}`);
  process.exit(code ?? 1);
});

const server = http.createServer((req, res) => {
  // Öffentlicher Health Check
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  const expectedPath = `/mcp/${SECRET_PATH}`;

  if (req.url !== expectedPath) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
    return;
  }

  // Alle wichtigen MCP-Header weiterreichen.
  // Origin wird absichtlich entfernt, da der eigentliche MCP nur lokal
  // hinter diesem Proxy erreichbar ist.
  const headers = { ...req.headers };
  delete headers.host;
  delete headers.origin;
  delete headers.connection;

  const upstream = http.request(
    {
      hostname: "127.0.0.1",
      port: MCP_PORT,
      path: "/mcp",
      method: req.method,
      headers
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 500, upstreamRes.headers);
      upstreamRes.pipe(res);
    }
  );

  upstream.on("error", (err) => {
    console.error("Upstream MCP error:", err);
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "text/plain" });
    }
    res.end("MCP upstream unavailable");
  });

  req.pipe(upstream);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Secure MCP proxy listening on port ${PORT}`);
});
