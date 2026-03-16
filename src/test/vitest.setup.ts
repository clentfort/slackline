import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

if (!process.env.PI_SLACKLINE_DIR) {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "slackline-vitest-"));
  process.env.PI_SLACKLINE_DIR = tempDir;
}
