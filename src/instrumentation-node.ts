import { processDue, reconcile } from './server/services/payments';

/**
 * Optional in-process payment worker for single-service deployments (INLINE_WORKER=true).
 * For anything bigger, run `npm run worker` as its own process instead.
 */
export function startInlineWorker(): void {
  if (process.env.INLINE_WORKER !== 'true') return;
  let n = 0;
  setInterval(async () => {
    try {
      await processDue(10);
      if (++n % 6 === 0) await reconcile();
    } catch (e) {
      console.error('inline worker tick failed', e);
    }
  }, Number(process.env.WORKER_INTERVAL_MS ?? 5000)).unref();
  console.log('inline payment worker started');
}
