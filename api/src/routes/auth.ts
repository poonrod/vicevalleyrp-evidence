import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { Request } from "express";
import { Router } from "express";
import { env } from "../config/env";
import {
  claimDiscordOAuthAuthorizationCode,
  releaseDiscordOAuthAuthorizationCodeClaim,
} from "../lib/discordOAuthCodeReplayGuard";
import { prisma } from "../lib/prisma";
import { loadSessionUser, requireAuth } from "../middleware/sessionUser";

export const authRouter = Router();

/** Ensure async session stores (e.g. Prisma) persist before the browser follows the redirect. */
function saveSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

function parseDiscordTokenErrorBody(raw: string): string {
  const trimmed = raw.trim().slice(0, 400);
  try {
    const j = JSON.parse(raw) as { error?: string; error_description?: string };
    const parts = [j.error, j.error_description].filter(Boolean);
    if (parts.length) return parts.join(": ");
  } catch {
    /* not JSON */
  }
  return trimmed || "(empty response)";
}

function stringFromQuery(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length ? t : undefined;
}

/** Stateless OAuth2 state (works with multiple Node workers; no session affinity). */
function buildDiscordOAuthState(): string {
  const nonce = randomBytes(16).toString("hex");
  const sig = createHmac("sha256", env.SESSION_SECRET).update(nonce).digest("hex");
  return `${nonce}.${sig}`;
}

function verifyDiscordOAuthState(state: string | undefined): boolean {
  if (!state || typeof state !== "string") return false;
  const dot = state.indexOf(".");
  if (dot <= 0 || dot === state.length - 1) return false;
  const nonce = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  if (nonce.length < 16 || sig.length < 32) return false;
  const expected = createHmac("sha256", env.SESSION_SECRET).update(nonce).digest("hex");
  if (sig.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(sig, "utf8"), Buffer.from(expected, "utf8"));
  } catch {
    return false;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function oauthCallbackHtml(title: string, body: string): string {
  const safe = escapeHtml(body);
  const safeTitle = escapeHtml(title);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>${safeTitle}</title>
<style>body{font-family:system-ui,sans-serif;max-width:42rem;margin:2rem auto;padding:0 1rem;background:#09090b;color:#e4e4e7;line-height:1.5}
pre{white-space:pre-wrap;background:#18181b;padding:1rem;border-radius:8px;font-size:0.9rem}
a{color:#60a5fa}</style></head><body><h1>${safeTitle}</h1><pre>${safe}</pre>
<p><a href="/">API home</a> · <a href="/auth/discord/login">Try sign-in again</a></p></body></html>`;
}

const DISCORD_LOGIN_RETRY_PATH = "/auth/discord/login";

/**
 * invalid_grant from Discord often means the authorization code was already exchanged, expired,
 * or never valid for this client — commonly from opening the callback twice, refreshing, browser
 * prefetch, link scanners, VPN/security inspection, or duplicate in-flight requests.
 */
function oauthInvalidGrantRecoveryHtml(discordDetail: string): string {
  const safeDetail = escapeHtml(discordDetail);
  const clientId = escapeHtml(env.DISCORD_CLIENT_ID);
  const redirectUri = escapeHtml(env.DISCORD_CALLBACK_URL);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>
<title>Discord sign-in needs a fresh link</title>
<meta http-equiv="refresh" content="4;url=${DISCORD_LOGIN_RETRY_PATH}"/>
<meta name="robots" content="noindex"/>
<style>
body{font-family:system-ui,sans-serif;max-width:42rem;margin:2rem auto;padding:0 1rem;background:#09090b;color:#e4e4e7;line-height:1.55}
pre{white-space:pre-wrap;background:#18181b;padding:1rem;border-radius:8px;font-size:0.88rem;word-break:break-all}
a{color:#60a5fa}
.retry{display:inline-block;margin:1rem 0;padding:0.75rem 1.25rem;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none;font-weight:600}
.retry:hover{background:#1d4ed8}
.note{color:#a1a1aa;font-size:0.9rem;margin-top:1.25rem}
</style></head><body>
<h1>Discord sign-in link could not be reused</h1>
<p>Discord treats the sign-in link as <strong>one-time use</strong>. Something may have used it already — for example a duplicate tab, page refresh, browser prefetch, a link scanner, a VPN, or a security browser extension.</p>
<p>You are not stuck: start a new sign-in and Discord will issue a fresh code.</p>
<p><a class="retry" href="${DISCORD_LOGIN_RETRY_PATH}">Try signing in again</a></p>
<p class="note">You can also wait a few seconds; this page will send you to the same place automatically.</p>
<h2 style="font-size:1rem;margin-top:1.75rem">What Discord reported</h2>
<pre>${safeDetail}</pre>
<h2 style="font-size:1rem;margin-top:1.25rem">Server configuration (safe to share)</h2>
<pre>client_id in use:\n${clientId}\n\nredirect_uri in use:\n${redirectUri}</pre>
<p><a href="/">API home</a></p>
<script>setTimeout(function(){ location.href = "${DISCORD_LOGIN_RETRY_PATH}"; }, 3800);</script>
</body></html>`;
}

authRouter.use(loadSessionUser);

authRouter.get("/discord/login", (req, res) => {
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET) {
    return res.status(503).json({ error: "Discord OAuth not configured" });
  }
  const state = buildDiscordOAuthState();
  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    redirect_uri: env.DISCORD_CALLBACK_URL,
    response_type: "code",
    scope: "identify email",
    state,
  });
  console.log("[auth] discord/login → authorize", {
    redirect_uri: env.DISCORD_CALLBACK_URL,
    client_id: env.DISCORD_CLIENT_ID,
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params.toString()}`);
});

/**
 * Discord returns a one-time `code` on this callback. It must be exchanged exactly once; a second
 * request with the same code yields invalid_grant. Codes are easily "burned" accidentally by
 * duplicate HTTP hits (refresh, back button, two tabs), link scanners, browser prefetch, or
 * security/VPN tools that replay URLs.
 */
authRouter.get("/discord/callback", async (req, res) => {
  const oauthErr = req.query.error as string | undefined;
  const oauthDesc = req.query.error_description as string | undefined;
  if (oauthErr) {
    const msg = [oauthErr, oauthDesc].filter(Boolean).join(": ");
    console.error("[auth] Discord returned error on callback query", msg);
    return res
      .status(400)
      .type("html")
      .send(oauthCallbackHtml("Discord sign-in cancelled or denied", msg));
  }

  const stateQ = stringFromQuery(req.query.state);
  if (!stateQ || !verifyDiscordOAuthState(stateQ)) {
    console.error("[auth] Discord OAuth state invalid or missing (wrong secret rotation, truncated URL, or forged state)");
    return res.status(400).type("html").send(
      oauthCallbackHtml(
        "Sign-in link was invalid or expired",
        "Open the evidence portal and use “Continue with Discord” again. Do not bookmark the callback URL.\n\nIf this persists after a fresh attempt, confirm the API was not restarted between clicking Discord and returning (rare), and that nothing is stripping query parameters from the URL."
      )
    );
  }

  const code = stringFromQuery(req.query.code);
  if (!code) {
    return res.status(400).type("html").send(oauthCallbackHtml("Missing code", "Discord did not return an authorization code. Start again from the evidence portal."));
  }

  const codeAttempt = claimDiscordOAuthAuthorizationCode(code);

  console.log("[auth] discord/callback hit", {
    ts: new Date().toISOString(),
    codeLength: code.length,
    ua: req.headers["user-agent"],
    xForwardedFor: req.headers["x-forwarded-for"],
    remoteIp: req.socket?.remoteAddress,
    referer: req.headers["referer"],
    codeAttempt,
  });

  if (codeAttempt === "replay") {
    console.warn("[auth] discord/callback replay guard: skipping token exchange (duplicate hit for same code)");
    return res.status(400).type("html").send(
      oauthCallbackHtml(
        "Discord login link already used",
        "This Discord login link was already used. Please try signing in again.\n\nIf you only clicked once, a browser extension, VPN, or security tool may have requested this URL twice."
      )
    );
  }

  const form = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    client_secret: env.DISCORD_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: env.DISCORD_CALLBACK_URL,
  });

  console.log("[auth] discord/callback → token exchange", {
    redirect_uri: env.DISCORD_CALLBACK_URL,
    client_id: env.DISCORD_CLIENT_ID,
    codeLength: code.length,
  });

  let tokenRes: Response;
  try {
    tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
  } catch (err) {
    releaseDiscordOAuthAuthorizationCodeClaim(code);
    console.error("[auth] Discord token exchange fetch error (claim released for possible retry)", err);
    return res
      .status(502)
      .type("html")
      .send(
        oauthCallbackHtml(
          "Could not reach Discord",
          "The server could not complete the sign-in request to Discord. Check connectivity and try “Continue with Discord” again from the evidence portal."
        )
      );
  }

  if (!tokenRes.ok) {
    const discordErr = await tokenRes.text().catch(() => "");
    const detail = parseDiscordTokenErrorBody(discordErr);
    const lower = detail.toLowerCase();
    const isInvalidGrant = lower.includes("invalid_grant");
    console.error("[auth] Discord token exchange failed", {
      discordHttpStatus: tokenRes.status,
      discordResponseBody: discordErr,
      parsed: detail,
      redirect_uri: env.DISCORD_CALLBACK_URL,
      client_id: env.DISCORD_CLIENT_ID,
      codeLength: code.length,
      grant_type: "authorization_code",
    });
    if (isInvalidGrant) {
      return res
        .status(200)
        .set("Cache-Control", "no-store")
        .type("html")
        .send(oauthInvalidGrantRecoveryHtml(detail));
    }
    const hint = lower.includes("redirect_uri")
      ? `\n\nChecklist:\n- DISCORD_CLIENT_ID in Hostinger must match this Discord application (Client ID below).\n- OAuth2 Client Secret from the same app (not the Bot token).\n- Redirect URL in Discord must match DISCORD_CALLBACK_URL exactly.\n- Do not refresh the callback page; use “Continue with Discord” again for a new code.\n- VPN / security scanners that pre-open URLs can burn the one-time code — try incognito or pause scanning for this domain.\n\nClient ID this server uses: ${env.DISCORD_CLIENT_ID}`
      : "";
    return res
      .status(401)
      .type("html")
      .send(
        oauthCallbackHtml(
          "Discord token exchange failed",
          `Discord said: ${detail}${hint}\n\nredirect_uri used by this server:\n${env.DISCORD_CALLBACK_URL}`
        )
      );
  }
  const tokenJson = (await tokenRes.json()) as { access_token: string };

  const meRes = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!meRes.ok) {
    return res
      .status(401)
      .type("html")
      .send(oauthCallbackHtml("Discord profile failed", "Token worked but /users/@me failed. Check API logs."));
  }
  const me = (await meRes.json()) as { id: string; username: string; avatar: string | null };

  try {
    const isSuper = env.DISCORD_SUPER_ADMIN_IDS.includes(me.id);
    let user = await prisma.user.findUnique({ where: { discordId: me.id } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          discordId: me.id,
          username: me.username,
          avatar: me.avatar,
          globalRole: isSuper ? "super_admin" : "officer",
        },
      });
      await prisma.officerProfile.create({
        data: {
          userId: user.id,
          officerName: me.username,
        },
      });
      await prisma.personalBodycamSetting.create({
        data: { userId: user.id },
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { username: me.username, avatar: me.avatar },
      });
      if (isSuper && user.globalRole !== "super_admin") {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { globalRole: "super_admin" },
        });
      }
    }

    req.session.userId = user.id;
    try {
      await saveSession(req);
    } catch (saveErr) {
      console.error("[auth] session save failed after Discord login", saveErr);
      return res
        .status(503)
        .set("Cache-Control", "no-store")
        .type("html")
        .send(
          oauthCallbackHtml(
            "Sign-in could not be completed",
            "The server could not store your session. Try “Continue with Discord” again in a moment. If this repeats, check API logs for database errors."
          )
        );
    }
    res.redirect(`${env.WEB_APP_URL}/dashboard`);
  } catch (err) {
    console.error("[auth] discord/callback failed after Discord token OK (database/session)", err);
    return res
      .status(503)
      .set("Cache-Control", "no-store")
      .type("html")
      .send(
        oauthCallbackHtml(
          "Sign-in could not be completed",
          "Discord accepted this sign-in, but the API could not use the database (check DATABASE_URL, or DB_HOST / DB_USER / DB_PASSWORD / DB_NAME if you use split env vars). After fixing credentials, use “Continue with Discord” again — the previous callback link cannot be reused."
        )
      );
  }
});

authRouter.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  res.json({ user: req.currentUser });
});
