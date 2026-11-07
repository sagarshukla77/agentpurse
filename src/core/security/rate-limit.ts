/** Sliding-window limiter. In-memory: correct for one instance; use Redis if you scale out. */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  hit(key: string, max: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfterSec: number } {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      this.hits.set(key, recent);
      return { ok: false, retryAfterSec: Math.ceil((windowMs - (now - recent[0])) / 1000) };
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) for (const [k, v] of this.hits) if (!v.some((t) => now - t < windowMs)) this.hits.delete(k);
    return { ok: true, retryAfterSec: 0 };
  }
}
