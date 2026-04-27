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

export async function backfillAll(
  opts: BackfillOptions,
): Promise<BackfillResult> {
  const pageSize = opts.pageSize ?? 50;
  let issues = 0;
  let comments = 0;
  let after: string | undefined = undefined;

  while (true) {
    const page = await opts.client.issues({
      first: pageSize,
      after,
    });
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

      const commentConn = await issue.comments({ first: 100 });
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
    }
    if (!page.pageInfo.hasNextPage || !page.pageInfo.endCursor) break;
    after = page.pageInfo.endCursor;
  }

  return { issues, comments };
}
