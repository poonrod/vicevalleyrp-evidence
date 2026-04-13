import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env";

export function requireFivemSecret(req: Request, res: Response, next: NextFunction) {
  const secret = env.FIVEM_API_SECRET;
  if (!secret) {
    return res.status(503).json({ error: "FiveM internal API not configured" });
  }
  const h = req.header("x-fivem-secret");
  if (h !== secret) {
    return res.status(401).json({ error: "Invalid internal secret" });
  }
  next();
}
