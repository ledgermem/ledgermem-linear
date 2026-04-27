#!/usr/bin/env node
import "dotenv/config";
import { LinearClient } from "@linear/sdk";
import { LedgerMem } from "@ledgermem/memory";
import { loadConfig } from "./config.js";
import { backfillAll } from "./backfill.js";

async function main(): Promise<void> {
  const cfg = loadConfig();
  const client = new LinearClient({ apiKey: cfg.apiKey });
  const memory = new LedgerMem({
    apiKey: cfg.ledgermemApiKey,
    workspaceId: cfg.ledgermemWorkspaceId,
  });
  const result = await backfillAll({ client, memory });
  process.stdout.write(
    `linear-sync backfill done: issues=${result.issues} comments=${result.comments}\n`,
  );
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`backfill failed: ${msg}\n`);
  process.exit(1);
});
