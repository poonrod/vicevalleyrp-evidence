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
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

const limiter = rateLimit({ windowMs: 60_000, max: 200 });
app.use(limiter);

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
