import type { Request, Response, NextFunction } from "express";
import { isDeveloperDiscordId } from "../config/developers";

/**
 * After `requireAuth`. Returns 403 for any user not on the developer Discord whitelist.
 */
export function requireDeveloper(req: Request, res: Response, next: NextFunction): void {
  if (!req.currentUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!isDeveloperDiscordId(req.currentUser.discordId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}
