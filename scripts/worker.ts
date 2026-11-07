import './_env';
import { processDue, reconcile } from '../src/server/services/payments';

/** Outbox worker + reconciliation loop. Run as its own process (`npm run worker`). */
const EVERY_MS = Number(process.env.WORKER_INTERVAL_MS ?? 5000);
let ticks = 0;
let stopping = false;
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stopping = true; });

async function main() {
  console.log(`worker started (every ${EVERY_MS}ms)`);
  while (!stopping) {
    try {
      const { claimed } = await processDue(10);
      if (claimed) console.log(`submitted ${claimed} payment(s)`);
      if (++ticks % 6 === 0) { const r = await reconcile(); if (r.recovered || r.synced) console.log('reconcile', r); }
    } catch (e) { console.error('worker tick failed', e); }
    await new Promise((r) => setTimeout(r, EVERY_MS));
  }
}
main();
