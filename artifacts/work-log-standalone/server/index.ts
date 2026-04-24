import path from "node:path";
import fs from "node:fs";
import http from "node:http";
import { fileURLToPath } from "node:url";
import express from "express";
import { runMigrations } from "./db.js";
import apiRouter from "./routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const PORT = Number(process.env.PORT ?? 5173);
const BASE_PATH = process.env.BASE_PATH ?? "/";
const isProduction = process.env.NODE_ENV === "production";

if (!Number.isInteger(PORT) || PORT <= 0) {
  throw new Error(`Invalid PORT value: ${process.env.PORT}`);
}

const normalizedBase = BASE_PATH.endsWith("/") ? BASE_PATH : BASE_PATH + "/";
const apiMount = normalizedBase.replace(/\/$/, "") + "/api";

async function main() {
  runMigrations();

  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get(apiMount + "/healthz", (_req, res) => {
    res.json({ ok: true });
  });
  app.use(apiMount, apiRouter);
  app.all(apiMount + "/*", (_req, res) => {
    res.status(404).json({ error: "API endpoint not found" });
  });

  const httpServer = http.createServer(app);

  if (isProduction) {
    const distDir = path.join(projectRoot, "dist", "public");
    if (!fs.existsSync(distDir)) {
      throw new Error(
        `Production build not found at ${distDir}. Run "npm run build" first.`,
      );
    }
    app.use(normalizedBase, express.static(distDir, { index: false }));
    app.get(normalizedBase + "*", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      configFile: path.join(projectRoot, "vite.config.ts"),
      server: {
        middlewareMode: true,
        hmr: { server: httpServer },
        host: "0.0.0.0",
      },
      appType: "custom",
      base: normalizedBase,
    });
    app.use(vite.middlewares);
    app.use("*", async (req, res, next) => {
      try {
        const indexPath = path.join(projectRoot, "index.html");
        let html = await fs.promises.readFile(indexPath, "utf-8");
        html = await vite.transformIndexHtml(req.originalUrl, html);
        res.status(200).set({ "Content-Type": "text/html" }).end(html);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(
      `[work-log-standalone] listening on http://0.0.0.0:${PORT}${normalizedBase} (mode=${
        isProduction ? "production" : "development"
      })`,
    );
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
