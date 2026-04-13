import { Router } from "express";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { loadSessionUser, requireAuth } from "../middleware/sessionUser";

export const authRouter = Router();

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
  const code = req.query.code as string | undefined;
  if (!code) return res.status(400).send("Missing code");

  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: env.DISCORD_CALLBACK_URL,
    }),
  });

  if (!tokenRes.ok) {
    return res.status(401).send("Discord token exchange failed");
  }
  const tokenJson = (await tokenRes.json()) as { access_token: string };

  const meRes = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!meRes.ok) return res.status(401).send("Discord profile failed");
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
