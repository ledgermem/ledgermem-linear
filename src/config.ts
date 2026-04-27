export interface LinearConfig {
  apiKey: string;
  webhookSecret: string;
  ledgermemApiKey: string;
  ledgermemWorkspaceId: string;
  port: number;
}

const REQUIRED = [
  "LINEAR_API_KEY",
  "LINEAR_WEBHOOK_SECRET",
  "LEDGERMEM_API_KEY",
  "LEDGERMEM_WORKSPACE_ID",
] as const;

export function loadConfig(): LinearConfig {
  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
  return {
    apiKey: process.env.LINEAR_API_KEY as string,
    webhookSecret: process.env.LINEAR_WEBHOOK_SECRET as string,
    ledgermemApiKey: process.env.LEDGERMEM_API_KEY as string,
    ledgermemWorkspaceId: process.env.LEDGERMEM_WORKSPACE_ID as string,
    port: Number(process.env.PORT ?? 3000),
  };
}
