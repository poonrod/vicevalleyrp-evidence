import { randomBytes } from "crypto";
import { Router } from "express";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { loadSessionUser, requireAuth } from "../middleware/sessionUser";

export const authRouter = Router();

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

function oauthCallbackHtml(title: string, body: string): string {
  const safe = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:42rem;margin:2rem auto;padding:0 1rem;background:#09090b;color:#e4e4e7;line-height:1.5}
pre{white-space:pre-wrap;background:#18181b;padding:1rem;border-radius:8px;font-size:0.9rem}
a{color:#60a5fa}</style></head><body><h1>${title}</h1><pre>${safe}</pre>
<p><a href="/">API home</a> · <a href="/auth/discord/login">Try sign-in again</a></p></body></html>`;
}

authRouter.use(loadSessionUser);

authRouter.get("/discord/login", (req, res) => {
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET) {
    return res.status(503).json({ error: "Discord OAuth not configured" });
  }
  const state = randomBytes(24).toString("hex");
  req.session.discordOAuthState = state;
  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    redirect_uri: env.DISCORD_CALLBACK_URL,
    response_type: "code",
    scope: "identify email",
    state,
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params.toString()}`);
});

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
  const expectedState = req.session.discordOAuthState;
  delete req.session.discordOAuthState;
  if (!expectedState || !stateQ || stateQ !== expectedState) {
    console.error("[auth] Discord OAuth state mismatch (prefetch, stale tab, or missing session cookie)", {
      hasSessionState: !!expectedState,
      hasQueryState: !!stateQ,
    });
    return res.status(400).type("html").send(
      oauthCallbackHtml(
        "Sign-in session expired or interrupted",
        "Start again from the evidence portal (Continue with Discord). Do not bookmark the callback URL.\n\nIf this keeps happening: try another browser or disable link-preview / HTTPS-scan features that open links in the background."
      )
    );
  }

  const code = stringFromQuery(req.query.code);
  if (!code) {
    return res.status(400).type("html").send(oauthCallbackHtml("Missing code", "Discord did not return an authorization code. Start again from the evidence portal."));
  }

  const form = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    client_secret: env.DISCORD_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: env.DISCORD_CALLBACK_URL,
  });

  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  if (!tokenRes.ok) {
    const discordErr = await tokenRes.text().catch(() => "");
    const detail = parseDiscordTokenErrorBody(discordErr);
    console.error("[auth] Discord token exchange failed", {
      status: tokenRes.status,
      discord: discordErr.slice(0, 500),
      redirect_uri_used: env.DISCORD_CALLBACK_URL,
    });
    const hint =
      detail.includes("invalid_grant") || detail.includes("redirect_uri")
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
  res.redirect(`${env.WEB_APP_URL}/dashboard`);
});

authRouter.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  res.json({ user: req.currentUser });
});
