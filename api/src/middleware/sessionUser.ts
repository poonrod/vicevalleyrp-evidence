import type { Request, Response, NextFunction } from "express";
import type { User } from "@prisma/client";
import { prisma } from "../lib/prisma";

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      currentUser?: User | null;
    }
  }
}

export async function loadSessionUser(req: Request, res: Response, next: NextFunction) {
  const id = req.session.userId;
  if (!id) {
    req.currentUser = null;
    return next();
  }
  req.currentUser = await prisma.user.findUnique({ where: { id } });
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.currentUser) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

export function requireMinRole(rank: "viewer" | "officer" | "evidence_tech" | "command_staff" | "super_admin") {
  const order = ["viewer", "officer", "evidence_tech", "command_staff", "super_admin"] as const;
  const minIdx = order.indexOf(rank);
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.currentUser) return res.status(401).json({ error: "Unauthorized" });
    const idx = order.indexOf(req.currentUser.globalRole as (typeof order)[number]);
    if (idx < minIdx) return res.status(403).json({ error: "Forbidden" });
    next();
  };
}
