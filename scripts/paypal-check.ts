import './_env';

/**
 * Checks your PayPal sandbox credentials without printing any secret.
 * Run:  npm run paypal:check
 */
const base = (process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com').replace(/\/$/, '');
const id = process.env.PAYPAL_CLIENT_ID ?? '';
const secret = process.env.PAYPAL_CLIENT_SECRET ?? '';
const mask = (e: string) => (e ? `${e.slice(0, 5)}…@${e.split('@')[1] ?? '?'}` : '(not set)');

async function main() {
  console.log('--- AgentPurse PayPal check ---');
  console.log(`PAYPAL_MODE          : ${process.env.PAYPAL_MODE || '(not set)'}   ${process.env.PAYPAL_MODE === 'live' ? 'ok (this means sandbox)' : '<-- must be "live" to use real sandbox'}`);
  console.log(`PAYPAL_BASE_URL      : ${base}`);
  console.log(`Client ID            : ${id ? `${id.slice(0, 6)}… (${id.length} characters)` : 'MISSING'}`);
  console.log(`Client secret        : ${secret ? `${secret.length} characters` : 'MISSING'}`);
  for (const k of ['NORTHWIND', 'ACME', 'LUMEN']) console.log(`Vendor email ${k.padEnd(9)}: ${mask(process.env[`DEMO_VENDOR_EMAIL_${k}`] ?? '')}`);

  const warnings: string[] = [];
  if (!id || !secret) warnings.push('Client ID or secret is empty in .env.');
  if (id !== id.trim() || secret !== secret.trim()) warnings.push('There is a space at the start or end of the ID or secret.');
  if (/^["']|["']$/.test(id) || /^["']|["']$/.test(secret)) warnings.push('Remove the quote marks around the ID or secret in .env.');
  if (!/sandbox/i.test(base)) warnings.push('PAYPAL_BASE_URL must be the sandbox URL.');
  if (warnings.length) { console.log('\nProblems found:'); warnings.forEach((w) => console.log(` - ${w}`)); }
  if (!id || !secret) process.exit(1);

  console.log('\nAsking PayPal for an access token…');
  let res: Response;
  try {
    res = await fetch(`${base}/v1/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${id.trim()}:${secret.trim()}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    const cause = (e as { cause?: { code?: string; message?: string } }).cause;
    console.log(`\nCould not reach PayPal: ${cause?.code ?? ''} ${cause?.message ?? (e as Error).message}`);
    console.log('This is a network problem (internet, firewall, VPN or proxy), not a credentials problem.');
    process.exit(1);
  }

  const body = (await res.json().catch(() => ({}))) as { access_token?: string; scope?: string; error?: string; error_description?: string; app_id?: string };
  console.log(`HTTP status: ${res.status}`);
  if (res.ok && body.access_token) {
    console.log('\nSUCCESS: your credentials work.');
    const payouts = (body.scope ?? '').toLowerCase().includes('payout');
    console.log(payouts ? 'Payouts permission: present.' : 'Payouts permission: NOT visible in the token scopes. Enable Payouts for your app (App features), or tell me.');
  } else {
    console.log(`\nFAILED: ${body.error ?? 'error'} ${body.error_description ?? ''}`);
    if (res.status === 401) console.log('Wrong client ID or secret, or they belong to a Live app instead of a Sandbox app. Copy both again from Apps & Credentials with the toggle on SANDBOX.');
    process.exit(1);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
