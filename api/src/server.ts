import express from "express";
import cors from "cors";
import helmet from "helmet";
import session from "express-session";
import rateLimit from "express-rate-limit";
import { env } from "./config/env";
import { authRouter } from "./routes/auth";
import { evidenceRouter } from "./routes/evidence";
import { incidentsRouter } from "./routes/incidents";
import { adminRouter } from "./routes/admin";
import { internalFivemRouter } from "./routes/internalFivem";
import { startDeletionWorker } from "./worker/deletionWorker";

const app = express();

/**
 * Portal and API on different hosts → browser fetch(/auth/me) is cross-site.
 * SameSite=Lax cookies are not sent on that request, so the portal always looks logged out.
 * SameSite=None + Secure fixes credentialed cross-origin session (see WEB_APP_URL vs callback host).
 */
function sessionCookieSettings(): { sameSite: "lax" | "none"; secure: boolean } {
  try {
    const portalOrigin = new URL(env.WEB_APP_URL).origin;
    const apiOrigin = new URL(env.DISCORD_CALLBACK_URL).origin;
    if (portalOrigin !== apiOrigin) {
      return { sameSite: "none", secure: true };
    }
  } catch {
    /* fall through */
  }
  return { sameSite: "lax", secure: env.NODE_ENV === "production" };
}

const sessionCookie = sessionCookieSettings();

app.set("trust proxy", 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(
  cors({
    origin: env.WEB_APP_URL,
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(
  session({
    name: "evidence.sid",
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: sessionCookie.secure,
      sameSite: sessionCookie.sameSite,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

const limiter = rateLimit({ windowMs: 60_000, max: 200 });
app.use(limiter);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

app.get("/", (_req, res) => {
  const portal = env.WEB_APP_URL;
  res.type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Vice Valley Evidence API</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 36rem; margin: 3rem auto; padding: 0 1rem;
      color: #e4e4e7; background: #09090b; line-height: 1.5; }
    a { color: #60a5fa; }
    code { background: #27272a; padding: 0.15em 0.35em; border-radius: 4px; font-size: 0.9em; }
    .muted { color: #a1a1aa; font-size: 0.9rem; margin-top: 2rem; }
  </style>
</head>
<body>
  <h1>Vice Valley Evidence API</h1>
  <p>This host serves the API and Discord OAuth. The web portal lives on your evidence domain.</p>
  <ul>
    <li><a href="${encodeURI(portal)}">Open evidence portal</a> <span class="muted">(${escapeHtml(portal)})</span></li>
    <li><a href="/auth/discord/login">Discord sign-in</a></li>
    <li><a href="/health">Health</a> — <code>{"ok":true}</code> is normal for monitors</li>
  </ul>
  <p class="muted">If you expected a full website here, open the portal link above — the API is not the Next.js UI.</p>
</body>
</html>`);
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authRouter);
app.use("/evidence", evidenceRouter);
app.use("/incidents", incidentsRouter);
app.use("/admin", adminRouter);
app.use("/internal/fivem", internalFivemRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal error" });
});

app.listen(env.PORT, () => {
  console.log(`API listening on :${env.PORT}`);
  startDeletionWorker();
});
