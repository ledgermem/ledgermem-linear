export interface LinearConfig {
  apiKey: string;
  webhookSecret: string;
  getmnemoApiKey: string;
  getmnemoWorkspaceId: string;
  port: number;
}

const REQUIRED = [
  "LINEAR_API_KEY",
  "LINEAR_WEBHOOK_SECRET",
  "GETMNEMO_API_KEY",
  "GETMNEMO_WORKSPACE_ID",
] as const;

export function loadConfig(): LinearConfig {
  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
  return {
    apiKey: process.env.LINEAR_API_KEY as string,
    webhookSecret: process.env.LINEAR_WEBHOOK_SECRET as string,
    getmnemoApiKey: process.env.GETMNEMO_API_KEY as string,
    getmnemoWorkspaceId: process.env.GETMNEMO_WORKSPACE_ID as string,
    port: Number(process.env.PORT ?? 3000),
  };
}
