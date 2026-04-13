/**
 * Panels like Hostinger often require Entry file "server.js" at the repo root.
 * The API is compiled to dist/ (see hostinger:build:api + scripts/sync-api-dist.js).
 */
require("./dist/server.js");
