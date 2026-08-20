/**
 * src/lib/auth/session.ts
 * Server-side session store backing the JWT issued by jwt.ts.
 *
 * WHY A SERVER-SIDE RECORD EXISTS
 * ---------------------------------------------------------------------------
 * jwt.ts deliberately carries only { jti, sub, iat, exp } and states it is not
 * for authorization. A signed token alone can prove integrity and expiry, but
 * it cannot be withdrawn before it expires. Storing a document per session
 * makes logout, forced revocation, and "who is currently signed in" possible.
 *
 * The token's `jti` IS this document's id. The token says which session it
 * claims to be; this collection is the authority on whether that session is
 * still valid.
 *
 * DELIBERATE OMISSION
 * ---------------------------------------------------------------------------
 * Role is not stored here and not in the token. Callers resolve role from the
 * users document per request, so a role change or a disabled account takes
 * effect on the next request rather than at token expiry.
 *
 * Phase 2: this module is infrastructure only. Nothing in the application
 * calls it yet — login is unchanged, routes are unchanged.
 */

import { adminDb } from '@/lib/firebase/admin';

/** Firestore collection holding one document per issued session. */
export const SESSIONS_COLLECTION = 'sessions';

/**
 * Default session lifetime. Callers may override per call.
 *
 * 24 hours, chosen so a factory night shift crossing midnight does not expire
 * mid-shift. The longer window does not weaken revocation: employmentStatus
 * is re-checked on every request, and logout revokes immediately, so a
 * disabled or logged-out account stops working regardless of remaining TTL.
 */
export const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 24; // 24 hours

/**
 * A session document as stored in Firestore.
 *
 * Timestamps are JS Date objects: the REST wrapper serializes Date to
 * timestampValue and returns a Date on read (see toFirestoreValue /
 * fromFirestoreValue in lib/firebase/admin.ts), so they round-trip.
 */
export interface SessionDoc {
  /** users document id — same value the token carries as `sub`. */
  employeeId: string;
  createdAt: Date;
  /**
   * Server-side expiry, intentionally duplicating the token's `exp`.
   * The token's expiry can only be checked when the token is presented;
   * this field lets the server reason about sessions it never sees again.
   */
  expiresAt: Date;
  /** Set on logout or forced revocation. null while the session is live. */
  revokedAt: Date | null;
  /** Updated opportunistically by callers; supports idle-timeout policies. */
  lastUsedAt: Date | null;
}

/** Why a session was rejected. Distinguishes causes for the caller. */
export type SessionInvalidReason = 'not_found' | 'revoked' | 'expired';

export type SessionLookup =
  | { valid: true; jti: string; session: SessionDoc }
  | { valid: false; reason: SessionInvalidReason };

/**
 * Creates a session document and returns its id (the `jti`).
 *
 * The id is a random UUID rather than anything derived from the employee, so
 * it is not guessable from user-visible data. Note that employee ids in this
 * system ARE user-visible (the users document id is the uppercased employee
 * id), which is precisely why the session id must not be derived from them.
 */
export async function createSession(
  employeeId: string,
  ttlSeconds: number = DEFAULT_SESSION_TTL_SECONDS
): Promise<{ jti: string; expiresAt: Date }> {
  const jti = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  const doc: SessionDoc = {
    employeeId,
    createdAt: now,
    expiresAt,
    revokedAt: null,
    lastUsedAt: null,
  };

  await adminDb.collection(SESSIONS_COLLECTION).doc(jti).set(doc);

  return { jti, expiresAt };
}

/**
 * Loads a session and reports whether it is currently usable.
 *
 * Checks are ordered cheapest-first and report the FIRST failing condition,
 * so a revoked-and-expired session reports `revoked` — the more specific
 * cause.
 *
 * `expiresAt` is always checked here even if a Firestore TTL policy is
 * configured: TTL deletion is asynchronous and best-effort, so an expired
 * document may still be readable.
 */
export async function getSession(jti: string): Promise<SessionLookup> {
  if (!jti) return { valid: false, reason: 'not_found' };

  const snap = await adminDb.collection(SESSIONS_COLLECTION).doc(jti).get();
  if (!snap.exists) return { valid: false, reason: 'not_found' };

  const data = snap.data() as Record<string, any> | null;
  if (!data) return { valid: false, reason: 'not_found' };

  const session: SessionDoc = {
    employeeId: data.employeeId,
    createdAt: toDate(data.createdAt),
    expiresAt: toDate(data.expiresAt),
    revokedAt: data.revokedAt ? toDate(data.revokedAt) : null,
    lastUsedAt: data.lastUsedAt ? toDate(data.lastUsedAt) : null,
  };

  if (session.revokedAt) return { valid: false, reason: 'revoked' };
  if (session.expiresAt.getTime() <= Date.now()) {
    return { valid: false, reason: 'expired' };
  }

  return { valid: true, jti, session };
}

/**
 * Marks a session revoked. Idempotent: revoking an already-revoked or
 * missing session is not an error, so logout never fails for a caller whose
 * session has already gone.
 *
 * The document is updated rather than deleted so the audit trail survives —
 * "when did this session end" stays answerable.
 */
export async function revokeSession(jti: string): Promise<void> {
  if (!jti) return;
  const ref = adminDb.collection(SESSIONS_COLLECTION).doc(jti);
  const snap = await ref.get();
  if (!snap.exists) return;
  await ref.update({ revokedAt: new Date() });
}

/**
 * Records activity on a session. Separate from getSession so that reads stay
 * side-effect free and callers decide whether a write is worth it.
 */
export async function touchSession(jti: string): Promise<void> {
  if (!jti) return;
  await adminDb
    .collection(SESSIONS_COLLECTION)
    .doc(jti)
    .update({ lastUsedAt: new Date() });
}

/**
 * Normalizes a stored timestamp to a Date.
 *
 * The wrapper returns a Date for timestampValue, but a document written by
 * another tool (console, script, export/import) may hold a string, so this
 * accepts both rather than assuming.
 */
function toDate(value: any): Date {
  if (value instanceof Date) return value;
  if (value && typeof value.toDate === 'function') return value.toDate();
  return new Date(value);
}
