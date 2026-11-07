/** Tiny, dependency-free runtime validation. All untrusted input passes through here. */
export class ValidationError extends Error {
  constructor(public path: string, message: string) {
    super(`${path}: ${message}`);
  }
}

export const asObject = (x: unknown, path = 'value'): Record<string, unknown> => {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) throw new ValidationError(path, 'must be an object');
  return x as Record<string, unknown>;
};

export const asString = (x: unknown, path: string, max = 500, min = 1): string => {
  if (typeof x !== 'string') throw new ValidationError(path, 'must be a string');
  const s = x.trim();
  if (s.length < min || s.length > max) throw new ValidationError(path, `must be ${min}-${max} characters`);
  return s;
};

export const asOptString = (x: unknown, path: string, max = 500): string | null =>
  x === undefined || x === null || x === '' ? null : asString(x, path, max);

export const asInt = (x: unknown, path: string, min = 0, max = Number.MAX_SAFE_INTEGER): number => {
  if (typeof x !== 'number' || !Number.isInteger(x) || x < min || x > max)
    throw new ValidationError(path, `must be an integer between ${min} and ${max}`);
  return x;
};

export const asNumber = (x: unknown, path: string, min = -Infinity, max = Infinity): number => {
  if (typeof x !== 'number' || !Number.isFinite(x) || x < min || x > max)
    throw new ValidationError(path, `must be a number between ${min} and ${max}`);
  return x;
};

export const asArray = (x: unknown, path: string, maxLen = 200): unknown[] => {
  if (!Array.isArray(x) || x.length > maxLen) throw new ValidationError(path, `must be an array (max ${maxLen})`);
  return x;
};

export const asEnum = <T extends string>(x: unknown, path: string, allowed: readonly T[]): T => {
  if (typeof x !== 'string' || !(allowed as readonly string[]).includes(x))
    throw new ValidationError(path, `must be one of ${allowed.join(', ')}`);
  return x as T;
};

export const asUuid = (x: unknown, path: string): string => {
  const s = asString(x, path, 36, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) throw new ValidationError(path, 'must be a UUID');
  return s;
};

export const asEmail = (x: unknown, path: string): string => {
  const s = asString(x, path, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new ValidationError(path, 'must be an email address');
  return s;
};
