# @ledgermem/linear

LedgerMem connector for [Linear](https://linear.app). Backfills your historical issues + comments and listens for live webhooks to keep memory in sync.

## Install

```bash
npm install -g @ledgermem/linear
```

## Setup

1. Create a personal API key in Linear: Settings → API → Personal API keys.
2. Configure a webhook in Linear: Settings → API → Webhooks. URL: `https://your-host/webhooks/linear`. Subscribe to **Issues**, **Issue comments**. Set secret = `LINEAR_WEBHOOK_SECRET`.
3. Get your LedgerMem API key + workspace ID.
4. Copy `.env.example` to `.env`.

## Run

```bash
# One-shot backfill:
linear-sync

# Webhook server:
npm start
```

## Env vars

| Variable | Required | Description |
| --- | --- | --- |
| `LINEAR_API_KEY` | yes | Linear personal API key |
| `LINEAR_WEBHOOK_SECRET` | yes | Shared secret for webhook signatures |
| `LEDGERMEM_API_KEY` | yes | LedgerMem API key |
| `LEDGERMEM_WORKSPACE_ID` | yes | LedgerMem workspace ID |
| `PORT` | no | Webhook server port (default 3000) |

## Memory metadata

For issues:

- `source: "linear"`
- `teamKey` (e.g. `ENG`)
- `issueId`
- `identifier` (e.g. `ENG-123`)
- `title`, `state`, `assignee`, `url`

For comments: `source: "linear-comment"`, plus `commentId`, `author`, parent issue identifier.

## License

MIT
