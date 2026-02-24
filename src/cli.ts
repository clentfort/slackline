#!/usr/bin/env node
import { run } from "./cli/index.js";

run(process.argv).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
