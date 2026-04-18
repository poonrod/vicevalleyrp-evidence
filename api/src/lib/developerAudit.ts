import type { Request } from "express";
import { prisma } from "./prisma";

export async function logDeveloperAction(
  req: Request,
  action: string,
  payload: Record<string, unknown> | null
): Promise<void> {
  const u = req.currentUser;
  try {
    await prisma.auditLog.create({
      data: {
        userId: u?.id ?? null,
        discordId: u?.discordId ?? null,
        action,
        payload: payload as object | undefined,
        ipAddress: req.ip ?? null,
        userAgent: typeof req.get === "function" ? req.get("user-agent") ?? null : null,
      },
    });
  } catch (e) {
    console.error("[developerAudit] failed to persist", action, e);
  }
}
