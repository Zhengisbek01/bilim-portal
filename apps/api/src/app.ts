import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import path from "node:path";
import fs from "node:fs";
import { env } from "./env.js";
import { sessionMiddleware } from "./auth/session.js";
import { errorHandler, fail } from "./lib/http.js";
import { auth } from "./routes/auth.js";
import { pub } from "./routes/public.js";
import { site } from "./routes/site.js";
import { control } from "./routes/control.js";
import { school } from "./routes/school.js";
import { feed } from "./routes/feed.js";
import { stats } from "./routes/stats.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "same-site" } }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  // Защита от CSRF: изменяющие запросы принимаем только с того же сайта (или с WEB_ORIGIN / домена области)
  app.use((req, _res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.headers.origin;
      if (origin) {
        let host = "";
        try { host = new URL(origin).host; } catch { /* битый заголовок */ }
        const self = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "");
        const ok = host === self || origin === env.WEB_ORIGIN || host === env.PUBLIC_DOMAIN || host.endsWith(`.${env.PUBLIC_DOMAIN}`);
        if (!ok) fail(403, "Запрос с чужого сайта отклонён");
      }
    }
    next();
  });
  app.use(sessionMiddleware);

  const api = express.Router();
  api.get("/health", (_req, res) => res.json({ ok: true }));
  api.use("/auth", auth);
  api.use("/public", pub);
  api.use(site, control, school, feed, stats);
  api.use((_req, res) => res.status(404).json({ error: "Метод API не найден" }));
  app.use("/api", api);

  // В production API раздаёт собранный фронтенд
  const webDist = path.resolve(process.cwd(), "../web/dist");
  if (env.NODE_ENV === "production" && fs.existsSync(webDist)) {
    app.use(express.static(webDist, { maxAge: "7d", index: false }));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(webDist, "index.html")));
  }
  app.use(errorHandler);
  return app;
}
