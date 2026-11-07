import { env } from '../env';

export interface Notice { title: string; body: string; severity: 'info' | 'warning' | 'critical' }

/** Best-effort alerts (Slack-compatible webhook). Never throws: alerting must not break payments. */
export async function notify(n: Notice): Promise<void> {
  console.info(`[notify:${n.severity}] ${n.title} - ${n.body}`);
  const url = env().notifyWebhookUrl;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: `*${n.title}*\n${n.body}` }), signal: AbortSignal.timeout(5000),
    });
  } catch { /* ignore */ }
}
