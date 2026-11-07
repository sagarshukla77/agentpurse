/** Central, validated configuration. Fails fast at first use, never silently. */
function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}
const num = (name: string, def: number) => (process.env[name] ? Number(process.env[name]) : def);

let cached: ReturnType<typeof load> | null = null;
function load() {
  const paypalBase = process.env.PAYPAL_BASE_URL ?? 'https://api-m.sandbox.paypal.com';
  // Sandbox guard: this prototype must never be pointed at live money.
  if (!/sandbox/i.test(paypalBase)) throw new Error('PAYPAL_BASE_URL must be a sandbox URL. AgentPurse is sandbox-only.');
  return {
    databaseUrl: req('DATABASE_URL'),
    dbSsl: process.env.DATABASE_SSL === 'true',
    sessionSecret: req('SESSION_SECRET'),
    encryptionKey: req('ENCRYPTION_KEY'),
    approvalSecret: req('APPROVAL_SECRET'),
    cronSecret: process.env.CRON_SECRET ?? '',
    isProd: process.env.NODE_ENV === 'production',
    demoMode: process.env.DEMO_MODE === 'true',
    requireTotp: process.env.REQUIRE_TOTP !== 'false',
    paypal: {
      baseUrl: paypalBase.replace(/\/$/, ''),
      clientId: process.env.PAYPAL_CLIENT_ID ?? '',
      clientSecret: process.env.PAYPAL_CLIENT_SECRET ?? '',
      webhookId: process.env.PAYPAL_WEBHOOK_ID ?? '',
      /** When false, payouts are simulated locally (no network). Handy for UI work. */
      live: process.env.PAYPAL_MODE !== 'simulated',
    },
    ai: {
      mode: (process.env.AI_MODE ?? 'mock') as 'mock' | 'anthropic' | 'gemini',
      apiKey: process.env.ANTHROPIC_API_KEY ?? '',
      geminiKey: process.env.GEMINI_API_KEY ?? '',
      /** Stay under the provider's per-minute limit. Gemini's free tier is roughly 5-15 requests/minute. */
      maxRpm: num('AI_MAX_RPM', process.env.AI_MODE === 'gemini' ? 5 : 50),
      /** Plain-English explanations come from a template unless this is true (saves one AI call per invoice). */
      llmExplain: process.env.AI_EXPLAIN === 'true',
      extractModel: process.env.MODEL_EXTRACT ?? '',
      fastModel: process.env.MODEL_FAST ?? '',
      maxCallsPerDay: num('AI_MAX_CALLS_PER_DAY', 300),
    },
    holdSeconds: num('PAYMENT_HOLD_SECONDS', 900),      // cancel window before money leaves
    stepUpCents: num('STEP_UP_CENTS', 50_000),           // approvals at/above this need a fresh TOTP
    notifyWebhookUrl: process.env.NOTIFY_WEBHOOK_URL ?? '',
  };
}
export const env = () => (cached ??= load());
