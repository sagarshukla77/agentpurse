import { decrypt } from '@/core/security/crypto';
import { hashPassword, verifyPassword } from '@/core/security/password';
import { signSession, verifySession } from '@/core/security/session';
import { verifyTotp } from '@/core/security/totp';
import { env } from '../env';
import { HttpError } from '../errors';
import { auditStandalone } from '../repos/audit';
import { getUserByEmail, getUserById, type User } from '../repos/users';

export const SESSION_COOKIE = 'ap_session';
export const SESSION_TTL_SEC = 8 * 3600;

let dummyHash: Promise<string> | null = null;

export async function login(input: { email: string; password: string; totp?: string }): Promise<{ user: User; cookie: string }> {
  const fail = async (why: string, user?: User) => {
    await auditStandalone({ actorKind: 'user', actorId: user?.id ?? null, action: 'LOGIN_FAILED', detail: { reason: why } });
    throw new HttpError(401, 'invalid_credentials', 'Email, password or code is incorrect');
  };
  const user = await getUserByEmail(input.email.toLowerCase());
  // Verify against a dummy hash when the user does not exist, so timing does not reveal valid emails.
  const ok = await verifyPassword(input.password, user?.passwordHash ?? (await (dummyHash ??= hashPassword('not-a-real-password'))));
  if (!user || !ok) return fail('bad password or unknown user');

  const needsTotp = env().requireTotp && !env().demoMode && user.role !== 'viewer' && !!user.totpSecretEnc;
  if (needsTotp && !verifyTotp(decrypt(user.totpSecretEnc!, env().encryptionKey), input.totp ?? '')) return fail('bad authenticator code', user);

  await auditStandalone({ actorKind: 'user', actorId: user.id, action: 'LOGIN_OK', detail: { role: user.role } });
  return { user, cookie: signSession(env().sessionSecret, { uid: user.id, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC }) };
}

export async function userFromCookie(value: string | undefined): Promise<User | null> {
  const claims = verifySession(env().sessionSecret, value);
  return claims ? getUserById(claims.uid) : null;
}
