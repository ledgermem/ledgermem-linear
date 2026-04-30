import "dotenv/config";
import { createHmac, timingSafeEqual } from "node:crypto";
import express, { type Request, type Response } from "express";
import { Mnemo } from "@mnemo/memory";
import { loadConfig } from "./config.js";
import { ingestIssue, ingestComment, type MemoryClient } from "./ingest.js";

const SIGNATURE_HEADER = "linear-signature";

export function verifySignature(
  rawBody: string,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature) return false;
  const hmac = createHmac("sha256", secret).update(rawBody).digest("hex");
  if (hmac.length !== signature.length) return false;
  try {
    return timingSafeEqual(Buffer.from(hmac), Buffer.from(signature));
  } catch {
    return false;
  }
}

interface LinearWebhookPayload {
  action: "create" | "update" | "remove";
  type: string;
  data: Record<string, unknown>;
}

function readString(obj: Record<string, unknown>, key: string): string {
  const value = obj[key];
  return typeof value === "string" ? value : "";
}

function readNested(
  obj: Record<string, unknown>,
  parent: string,
  key: string,
): string {
  const p = obj[parent];
  if (typeof p === "object" && p !== null) {
    return readString(p as Record<string, unknown>, key);
  }
  return "";
}

function readDeepNested(
  obj: Record<string, unknown>,
  path: readonly string[],
): string {
  let cur: unknown = obj;
  for (const seg of path) {
    if (cur && typeof cur === "object" && !Array.isArray(cur)) {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return "";
    }
  }
  return typeof cur === "string" ? cur : "";
}

export async function handleWebhookPayload(
  payload: LinearWebhookPayload,
  memory: MemoryClient,
): Promise<void> {
  if (payload.type === "Issue" && payload.action !== "remove") {
    const data = payload.data;
    await ingestIssue(memory, {
      id: readString(data, "id"),
      identifier: readString(data, "identifier"),
      title: readString(data, "title"),
      description: readString(data, "description"),
      url: readString(data, "url"),
      teamKey: readNested(data, "team", "key"),
      stateName: readNested(data, "state", "name"),
      assigneeName: readNested(data, "assignee", "name"),
      updatedAt: readString(data, "updatedAt"),
    });
  } else if (payload.type === "Comment" && payload.action !== "remove") {
    const data = payload.data;
    // Linear's Comment webhook payload does not put `team` on the comment
    // itself — the team lives under `issue.team`. Reading data.team.key
    // returned an empty string and dropped every comment into the
    // unattributed bucket downstream.
    const teamKey =
      readNested(data, "team", "key") ||
      readDeepNested(data, ["issue", "team", "key"]);
    await ingestComment(memory, {
      id: readString(data, "id"),
      body: readString(data, "body"),
      issueId: readNested(data, "issue", "id"),
      issueIdentifier: readNested(data, "issue", "identifier"),
      teamKey,
      url: readString(data, "url"),
      authorName: readNested(data, "user", "name"),
    });
  }
}

export function buildApp(deps: {
  webhookSecret: string;
  memory: MemoryClient;
}): express.Express {
  const app = express();
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as Request & { rawBody: string }).rawBody = buf.toString("utf8");
      },
    }),
  );

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/webhooks/linear", async (req: Request, res: Response) => {
    const signature = req.header(SIGNATURE_HEADER);
    const raw = (req as Request & { rawBody: string }).rawBody;
    if (!verifySignature(raw, signature, deps.webhookSecret)) {
      res.status(401).json({ error: "invalid signature" });
      return;
    }
    try {
      await handleWebhookPayload(req.body as LinearWebhookPayload, deps.memory);
      res.status(204).end();
    } catch (err: unknown) {
      // Don't echo the raw error to the webhook caller — Linear surfaces the
      // response body in the integration UI and SDK errors can include
      // workspace ids, internal hostnames, or partial GraphQL operation text.
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`linear webhook handler failed: ${msg}\n`);
      res.status(500).json({ error: "internal error" });
    }
  });

  return app;
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const memory = new Mnemo({
    apiKey: cfg.getmnemoApiKey,
    workspaceId: cfg.getmnemoWorkspaceId,
  });
  const app = buildApp({ webhookSecret: cfg.webhookSecret, memory });
  const server = app.listen(cfg.port, () => {
    process.stdout.write(`linear-sync webhook server on :${cfg.port}\n`);
  });

  // Graceful shutdown — drain in-flight ingest calls before exit so SIGTERM
  // doesn't leave a memory.add half-completed.
  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stdout.write(`Received ${signal}, draining HTTP server…\n`);
    const force = setTimeout(() => {
      process.stderr.write("Shutdown timed out, forcing exit.\n");
      process.exit(1);
    }, 15_000);
    force.unref();
    server.close(() => {
      clearTimeout(force);
      process.exit(0);
    });
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`server failed: ${msg}\n`);
    process.exit(1);
  });
}
