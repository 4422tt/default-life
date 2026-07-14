const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const port = Number(process.env.PORT || 3000);
const root = path.resolve(__dirname, "out");
const shouldOpen = process.argv.includes("--open");
const basePath = process.env.BASE_PATH || "/default-life";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function resolveFile(urlPath) {
  let pathname = decodeURIComponent(urlPath.split("?")[0]);

  if (pathname === basePath) {
    pathname = "/";
  } else if (pathname.startsWith(`${basePath}/`)) {
    pathname = pathname.slice(basePath.length);
  }

  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const candidates = [relativePath];

  if (!path.extname(relativePath)) {
    candidates.push(`${relativePath}.html`, path.join(relativePath, "index.html"));
  }

  for (const candidate of candidates) {
    const resolved = path.resolve(root, candidate);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) continue;

    try {
      if (fs.statSync(resolved).isFile()) return resolved;
    } catch {
      // Try the next static-export path.
    }
  }

  return null;
}

const server = http.createServer((request, response) => {
  let filePath;

  try {
    filePath = resolveFile(request.url || "/");
  } catch {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("无效的请求地址");
    return;
  }

  if (!filePath) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("页面不存在");
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  response.writeHead(200, {
    "Cache-Control": extension === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
    "Content-Type": contentTypes[extension] || "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  fs.createReadStream(filePath).pipe(response);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`端口 ${port} 已被占用。请先关闭另一个预制人生窗口。`);
  } else {
    console.error(error);
  }
  process.exit(1);
});

server.listen(port, () => {
  const url = `http://127.0.0.1:${port}`;
  console.log(`预制人生已启动：${url}`);
  console.log("保持此窗口开启。停止服务请按 Ctrl+C。");

  if (shouldOpen && process.platform === "win32") {
    const browser = spawn("cmd.exe", ["/c", "start", "", url], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    browser.unref();
  }
});
