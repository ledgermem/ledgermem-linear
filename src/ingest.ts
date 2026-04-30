import type { Mnemo } from "@mnemo/memory";

export interface MemoryClient {
  add: Mnemo["add"];
}

export interface LinearIssueLike {
  id: string;
  identifier: string;
  title: string;
  description?: string | null;
  url: string;
  teamKey: string;
  stateName: string;
  assigneeName?: string;
  updatedAt?: string;
}

export async function ingestIssue(
  memory: MemoryClient,
  issue: LinearIssueLike,
): Promise<void> {
  const content = `${issue.identifier}: ${issue.title}\n\n${issue.description ?? ""}`.trim();
  await memory.add(content, {
    metadata: {
      source: "linear",
      teamKey: issue.teamKey,
      issueId: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      state: issue.stateName,
      assignee: issue.assigneeName ?? "",
      url: issue.url,
      updatedAt: issue.updatedAt ?? "",
    },
  });
}

export interface LinearCommentLike {
  id: string;
  body: string;
  issueIdentifier: string;
  issueId: string;
  teamKey: string;
  url: string;
  authorName: string;
}

export async function ingestComment(
  memory: MemoryClient,
  comment: LinearCommentLike,
): Promise<void> {
  await memory.add(comment.body, {
    metadata: {
      source: "linear-comment",
      teamKey: comment.teamKey,
      issueId: comment.issueId,
      identifier: comment.issueIdentifier,
      commentId: comment.id,
      author: comment.authorName,
      url: comment.url,
    },
  });
}
