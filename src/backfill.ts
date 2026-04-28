import { LinearClient } from "@linear/sdk";
import {
  ingestIssue,
  ingestComment,
  type MemoryClient,
} from "./ingest.js";

export interface BackfillOptions {
  client: LinearClient;
  memory: MemoryClient;
  pageSize?: number;
}

export interface BackfillResult {
  issues: number;
  comments: number;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

interface RateLimitErrorShape {
  status?: number;
  response?: {
    status?: number;
    headers?: { get?(name: string): string | null };
  };
  extensions?: { code?: string };
}

function getRateLimitWaitMs(err: unknown): number | null {
  if (!err || typeof err !== "object") return null;
  const e = err as RateLimitErrorShape;
  const status = e.status ?? e.response?.status;
  const isRateLimited =
    status === 429 || e.extensions?.code === "RATELIMITED";
  if (!isRateLimited) return null;
  const headers = e.response?.headers;
  let raw: string | null = null;
  if (headers && typeof headers.get === "function") {
    raw = headers.get("retry-after");
  }
  const seconds = raw ? Number(raw) : NaN;
  if (!Number.isFinite(seconds) || seconds <= 0) return 1000;
  return Math.min(seconds * 1000, 60_000);
}

/**
 * Linear's GraphQL API rate-limits aggressively during backfill. Honour the
 * `retry-after` header on 429 responses with bounded retries instead of
 * letting the whole backfill abort partway through.
 */
async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 5,
): Promise<T> {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (err) {
      const wait = getRateLimitWaitMs(err);
      if (wait === null || attempt >= maxRetries) throw err;
      await sleep(wait);
      attempt += 1;
    }
  }
}

export async function backfillAll(
  opts: BackfillOptions,
): Promise<BackfillResult> {
  const pageSize = opts.pageSize ?? 50;
  let issues = 0;
  let comments = 0;
  let after: string | undefined = undefined;

  while (true) {
    const page = await withRateLimitRetry(() =>
      opts.client.issues({ first: pageSize, after }),
    );
    for (const issue of page.nodes) {
      const [team, state, assignee] = await Promise.all([
        issue.team,
        issue.state,
        issue.assignee,
      ]);
      await ingestIssue(opts.memory, {
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description ?? "",
        url: issue.url,
        teamKey: team?.key ?? "",
        stateName: state?.name ?? "unknown",
        assigneeName: assignee?.name ?? "",
        updatedAt: issue.updatedAt?.toISOString?.() ?? "",
      });
      issues += 1;

      // Walk the entire comment connection — capping at the first page
      // silently dropped comments on heavily-discussed issues.
      let commentAfter: string | undefined = undefined;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const commentConn = await withRateLimitRetry(() =>
          issue.comments({ first: 100, after: commentAfter }),
        );
        for (const c of commentConn.nodes) {
          const author = await c.user;
          await ingestComment(opts.memory, {
            id: c.id,
            body: c.body,
            issueIdentifier: issue.identifier,
            issueId: issue.id,
            teamKey: team?.key ?? "",
            url: c.url,
            authorName: author?.name ?? "unknown",
          });
          comments += 1;
        }
        if (
          !commentConn.pageInfo.hasNextPage ||
          !commentConn.pageInfo.endCursor
        ) {
          break;
        }
        commentAfter = commentConn.pageInfo.endCursor;
      }
    }
    if (!page.pageInfo.hasNextPage || !page.pageInfo.endCursor) break;
    after = page.pageInfo.endCursor;
  }

  return { issues, comments };
}
