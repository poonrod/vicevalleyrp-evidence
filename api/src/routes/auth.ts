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
  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    redirect_uri: env.DISCORD_CALLBACK_URL,
    response_type: "code",
    scope: "identify email",
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

  const code = req.query.code as string | undefined;
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
        ? "\n\nUsually: add this exact redirect URL in Discord → Application → OAuth2 → Redirects (no extra slash), and set DISCORD_CALLBACK_URL in Hostinger to the same string. Use the OAuth2 Client Secret, not the Bot token."
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
