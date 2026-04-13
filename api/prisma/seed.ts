import { PrismaClient } from "@prisma/client";
import { DEFAULT_RETENTION_SETTINGS, RETENTION_KEYS } from "../src/modules/retention/settings";

const prisma = new PrismaClient();

async function main() {
  for (const key of RETENTION_KEYS) {
    const value = DEFAULT_RETENTION_SETTINGS[key];
    await prisma.retentionPolicySetting.upsert({
      where: { key },
      create: { key, value: value as object },
      update: { value: value as object },
    });
  }
  console.log("Retention defaults seeded.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
