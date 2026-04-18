import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { loadSessionUser, requireAuth, requireMinRole } from "../middleware/sessionUser";

export const incidentsRouter = Router();
incidentsRouter.use(loadSessionUser);

incidentsRouter.get("/", requireAuth, async (req, res) => {
  const rows = await prisma.incident.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { _count: { select: { evidence: true } } },
  });
  res.json({
    items: rows.map((i) => ({
      incidentId: i.incidentId,
      title: i.title,
      caseNumber: i.caseNumber,
      createdAt: i.createdAt.toISOString(),
      evidenceCount: i._count.evidence,
    })),
  });
});

incidentsRouter.post("/", requireAuth, async (req, res) => {
  const body = z
    .object({
      incidentId: z.string().min(1).max(128),
      title: z.string().max(256).optional(),
      description: z.string().max(4000).optional(),
      caseNumber: z.string().max(64).optional(),
    })
    .parse(req.body);

  try {
    const inc = await prisma.incident.create({
      data: {
        incidentId: body.incidentId,
        title: body.title,
        description: body.description,
        caseNumber: body.caseNumber,
        createdByUserId: req.currentUser!.id,
      },
    });
    res.json({ incident: inc });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const existing = await prisma.incident.findUnique({
        where: { incidentId: body.incidentId },
      });
      return res.status(409).json({
        error: "incident_id_exists",
        message: "That incident id already exists.",
        incident: existing,
      });
    }
    throw e;
  }
});

incidentsRouter.get("/:incidentId", requireAuth, async (req, res) => {
  const inc = await prisma.incident.findUnique({
    where: { incidentId: String(req.params.incidentId) },
    include: { evidence: true },
  });
  if (!inc) return res.status(404).json({ error: "Not found" });
  res.json({ incident: inc });
});

incidentsRouter.patch("/:incidentId", requireMinRole("evidence_tech"), async (req, res) => {
  const body = z
    .object({
      title: z.string().max(256).optional(),
      description: z.string().max(4000).optional(),
      caseNumber: z.string().max(64).optional().nullable(),
    })
    .parse(req.body);

  const inc = await prisma.incident.update({
    where: { incidentId: String(req.params.incidentId) },
    data: body,
  });
  res.json({ incident: inc });
});
