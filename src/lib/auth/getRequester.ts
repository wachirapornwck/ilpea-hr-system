/**
 * src/lib/auth/getRequester.ts
 * Resolves the identity behind a request from the session cookie.
 *
 * SCOPE — deliberately narrow
 * ---------------------------------------------------------------------------
 * This helper answers exactly one question: "who is this requester?"
 * It does NOT answer "is this role allowed here?" — routes keep that, because
 * the permitted set differs per route (compare ALLOWED_HR_ROLES in the import
 * routes with the self-or-HR rule in change-pin). Centralizing identity while
 * leaving policy at the route keeps each route's rule readable where it
 * applies.
 *
 * WHY COOKIE ONLY
 * ---------------------------------------------------------------------------
 * No header or body fallback is accepted. An `Authorization: <employeeId>`
 * style header would reintroduce exactly the caller-asserted identity this
 * work exists to remove. The Phase 4 compatibility fallback for `requesterId`
 * is intentionally NOT built here — it belongs in the migration step, not in
 * the foundation, so the target behaviour is testable on its own first.
 *
 * ROLE IS READ PER REQUEST
 * ---------------------------------------------------------------------------
 * The token carries no role by design (see jwt.ts). Role comes from the users
 * document on every call. This costs a read, and buys immediate effect for
 * role changes and account disabling.
 *
 * DISABLED USERS
 * ---------------------------------------------------------------------------
 * Login already filters on employmentStatus === 'active', but that check runs
 * once. Without a per-request check, an employee disabled mid-session would
 * keep working until their token expired. This helper closes that gap, which
 * means it is a behaviour change, not only plumbing.
 *
 * Phase 2: infrastructure only. No route calls this yet.
 */

import type { NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyJWT } from '@/lib/auth/jwt';
import { getSession } from '@/lib/auth/session';

/** Cookie carrying the signed session token. */
export const SESSION_COOKIE_NAME = 'ilpea_session';

/**
 * Identity of a successfully authenticated caller.
 *
 * `id` is the users document id. It matches what routes currently receive as
 * `requesterId`, so existing self-comparison logic (e.g. change-pin's
 * `requesterId === targetId`) keeps working when routes migrate.
 */
export interface Requester {
  id: string;
  role: string;
  sessionId: string;
}

/**
 * Why authentication failed.
 *
 * Split by the status a route should return: every identity failure is 401;
 * `user_inactive` is 403 because the caller IS identified — their account is
 * simply not permitted to act.
 */
export type AuthFailureReason =
  | 'missing_cookie'
  | 'invalid_token'
  | 'expired_token'
  | 'session_not_found'
  | 'session_revoked'
  | 'session_expired'
  | 'user_not_found'
  | 'user_inactive';

export type GetRequesterResult =
  | { ok: true; requester: Requester }
  | { ok: false; reason: AuthFailureReason; status: 401 | 403 };

/** The only reason that is an authorization failure rather than an identity one. */
function statusFor(reason: AuthFailureReason): 401 | 403 {
  return reason === 'user_inactive' ? 403 : 401;
}

function fail(reason: AuthFailureReason): GetRequesterResult {
  return { ok: false, reason, status: statusFor(reason) };
}

/**
 * Resolves the requester behind a request.
 *
 * Returns a typed result rather than throwing, so routes map failures to
 * responses explicitly instead of relying on a catch block.
 *
 * Flow: cookie → verifyJWT → sessions/{jti} → users/{sub} → active check.
 */
export async function getRequester(
  req: NextRequest
): Promise<GetRequesterResult> {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return fail('missing_cookie');

  // verifyJWT returns null for a bad signature, a malformed token, an expired
  // one, or a payload missing jti/sub — it does not distinguish. Reporting
  // 'invalid_token' for all of these is accurate at this layer; the
  // 'expired_token' reason exists for callers that later obtain finer detail.
  const payload = await verifyJWT(token);
  if (!payload) return fail('invalid_token');

  const lookup = await getSession(payload.jti);
  if (!lookup.valid) {
    if (lookup.reason === 'revoked') return fail('session_revoked');
    if (lookup.reason === 'expired') return fail('session_expired');
    return fail('session_not_found');
  }

  // The token's `sub` and the session's employeeId must agree. They are
  // written together at login, so a mismatch means one of them was altered or
  // the session id was reused across accounts. Treat as not-found rather than
  // trusting either value.
  if (lookup.session.employeeId !== payload.sub) {
    return fail('session_not_found');
  }

  const userSnap = await adminDb.collection('users').doc(payload.sub).get();
  if (!userSnap.exists) return fail('user_not_found');

  const user = userSnap.data() as Record<string, any> | null;
  if (!user) return fail('user_not_found');

  // Mirrors the filter login already applies, but on every request.
  if (user.employmentStatus !== 'active') return fail('user_inactive');

  return {
    ok: true,
    requester: {
      id: userSnap.id,
      role: user.role,
      sessionId: payload.jti,
    },
  };
}
