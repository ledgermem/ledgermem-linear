import { describe, it, expect, vi } from "vitest";
import {
  ingestIssue,
  ingestComment,
  type MemoryClient,
} from "./ingest.js";
import { handleWebhookPayload, verifySignature } from "./server.js";
import { createHmac } from "node:crypto";

describe("ingestIssue", () => {
  it("sends linear metadata to memory", async () => {
    const add = vi.fn(async () => undefined);
    const memory = { add } as unknown as MemoryClient;
    await ingestIssue(memory, {
      id: "i1",
      identifier: "ENG-1",
      title: "Fix bug",
      description: "details",
      url: "https://linear.app/x/issue/ENG-1",
      teamKey: "ENG",
      stateName: "In Progress",
      assigneeName: "Shah",
      updatedAt: "2025-01-01T00:00:00Z",
    });
    expect(add).toHaveBeenCalledOnce();
    expect(add.mock.calls[0][1]).toMatchObject({
      metadata: {
        source: "linear",
        teamKey: "ENG",
        identifier: "ENG-1",
        state: "In Progress",
      },
    });
  });
});

describe("verifySignature", () => {
  it("accepts a valid HMAC", () => {
    const body = '{"a":1}';
    const secret = "shh";
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    expect(verifySignature(body, sig, secret)).toBe(true);
    expect(verifySignature(body, "deadbeef", secret)).toBe(false);
    expect(verifySignature(body, undefined, secret)).toBe(false);
  });
});

describe("handleWebhookPayload", () => {
  it("ingests issue create events", async () => {
    const add = vi.fn(async () => undefined);
    const memory = { add } as unknown as MemoryClient;
    await handleWebhookPayload(
      {
        action: "create",
        type: "Issue",
        data: {
          id: "i9",
          identifier: "ENG-9",
          title: "Hello",
          description: "Body",
          url: "https://linear.app/x/issue/ENG-9",
          team: { key: "ENG" },
          state: { name: "Backlog" },
          assignee: { name: "Alice" },
          updatedAt: "2025-01-01T00:00:00Z",
        },
      },
      memory,
    );
    expect(add).toHaveBeenCalledOnce();
  });

  it("ingests comment events", async () => {
    const add = vi.fn(async () => undefined);
    const memory = { add } as unknown as MemoryClient;
    await handleWebhookPayload(
      {
        action: "create",
        type: "Comment",
        data: {
          id: "c1",
          body: "lgtm",
          url: "https://linear.app/x/issue/ENG-9#comment-c1",
          issue: { id: "i9", identifier: "ENG-9" },
          team: { key: "ENG" },
          user: { name: "Bob" },
        },
      },
      memory,
    );
    expect(add).toHaveBeenCalledOnce();
  });
});

// Ingest comment direct
describe("ingestComment", () => {
  it("sends comment metadata", async () => {
    const add = vi.fn(async () => undefined);
    await ingestComment({ add } as unknown as MemoryClient, {
      id: "c1",
      body: "looks good",
      issueId: "i1",
      issueIdentifier: "ENG-1",
      teamKey: "ENG",
      url: "u",
      authorName: "Carol",
    });
    expect(add).toHaveBeenCalledOnce();
  });
});
