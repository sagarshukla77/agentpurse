import { safeEqual } from '@/core/security/crypto';
import { api } from '@/server/http';
import { env } from '@/server/env';
import { forbidden } from '@/server/errors';
import { processDue, reconcile } from '@/server/services/payments';

/** For hosts without a background worker: a scheduler (cron) calls this with the shared secret. */
export const POST = api({ public: true, csrf: false, limit: { max: 30, windowMs: 60_000 } }, async ({ req }) => {
  const secret = env().cronSecret;
  const given = req.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (!secret || !safeEqual(given, secret)) throw forbidden();
  return { ...(await processDue(10)), ...(await reconcile()) };
});
