/**
 * In-memory fixed-window rate limiter. Good enough for a single-process,
 * SQLite-backed hobby server — it resets on process restart and won't
 * coordinate across multiple instances, which is an accepted trade-off here.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const attempts = new Map<string, { count: number; windowStart: number }>();

export function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    attempts.set(key, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= MAX_ATTEMPTS) {
    return false;
  }

  entry.count += 1;
  return true;
}

export function resetRateLimit(key: string): void {
  attempts.delete(key);
}

/**
 * Second, more permissive ceiling keyed on IP alone (regardless of which
 * email is being attempted) so one IP can't spray many different admin
 * emails to route around the per-email:ip limit above.
 */
const IP_WINDOW_MS = 15 * 60 * 1000;
const IP_MAX_ATTEMPTS = 20;

const ipAttempts = new Map<string, { count: number; windowStart: number }>();

export function checkIpRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipAttempts.get(ip);

  if (!entry || now - entry.windowStart > IP_WINDOW_MS) {
    ipAttempts.set(ip, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= IP_MAX_ATTEMPTS) {
    return false;
  }

  entry.count += 1;
  return true;
}
