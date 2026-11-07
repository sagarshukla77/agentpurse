export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}
export const badRequest = (m: string, extra?: Record<string, unknown>) => new HttpError(400, 'bad_request', m, extra);
export const unauthorized = (m = 'Sign in required') => new HttpError(401, 'unauthorized', m);
export const forbidden = (m = 'You do not have permission to do that') => new HttpError(403, 'forbidden', m);
export const notFound = (m = 'Not found') => new HttpError(404, 'not_found', m);
export const conflict = (m: string, extra?: Record<string, unknown>) => new HttpError(409, 'conflict', m, extra);
export const tooMany = (retryAfterSec: number) => new HttpError(429, 'rate_limited', `Too many requests. Try again in ${retryAfterSec}s`, { retryAfterSec });
