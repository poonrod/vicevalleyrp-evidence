/**
 * Copies api/dist → ./dist at repo root for hosts (e.g. Hostinger) that only
 * accept Output directory + Entry relative to repository root.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const from = path.join(root, "api", "dist");
const to = path.join(root, "dist");

if (!fs.existsSync(from)) {
  console.error("sync-api-dist: api/dist not found. Run build first.");
  process.exit(1);
}

fs.rmSync(to, { recursive: true, force: true });
fs.cpSync(from, to, { recursive: true });
console.log("sync-api-dist: copied api/dist → dist/");
