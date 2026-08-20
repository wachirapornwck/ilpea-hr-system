// app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import bcrypt from 'bcryptjs';
import { signJWT } from '@/lib/auth/jwt';
import { createSession, DEFAULT_SESSION_TTL_SECONDS } from '@/lib/auth/session';
import { SESSION_COOKIE_NAME } from '@/lib/auth/getRequester';

export async function POST(req: NextRequest) {
  try {
    const { employeeId, pin } = await req.json();

    if (!employeeId || !pin) {
      return NextResponse.json(
        { message: 'กรุณากรอกรหัสพนักงานและ PIN' },
        { status: 400 }
      );
    }

    const snapshot = await adminDb
      .collection('users')
      .where('employeeId', '==', employeeId.toUpperCase())
      .where('employmentStatus', '==', 'active')
      .limit(1)
      .get();

    if (snapshot.empty) {
      return NextResponse.json(
        { message: 'ไม่พบรหัสพนักงาน หรือบัญชีถูกระงับ' },
        { status: 401 }
      );
    }

    const userDoc = snapshot.docs[0];
    const userData = userDoc.data();

    const pinMatch = await bcrypt.compare(pin, userData.pinHash);
    if (!pinMatch) {
      return NextResponse.json({ message: 'PIN ไม่ถูกต้อง' }, { status: 401 });
    }

    // Phase 3 — establish a server-verifiable session before responding.
    // The document id (userDoc.id) is the employeeId, which is what the token
    // carries as `sub` and what getRequester later resolves the user from.
    //
    // If either step fails the whole login fails: a 200 without a valid
    // session cookie would look successful to the client but leave the user
    // unauthenticated for every subsequent request once Phase 4 begins. A
    // loud failure here is safer than that silent broken state.
    let jti: string;
    // TEMPORARY (Phase 3 diagnosis) — tracks which step is in progress so the
    // catch can report it. Server logs are unreadable in this environment, so
    // the failing step is also returned in the 500 body (Network tab). This
    // block is diagnostic only and will be removed once the cause is known.
    let step = 'start';
    try {
      console.log('[login] entering createSession');
      step = 'createSession';
      const created = await createSession(userDoc.id);
      jti = created.jti;
      console.log('[login] leaving createSession OK');

      const nowSec = Math.floor(Date.now() / 1000);

      console.log('[login] entering signJWT');
      step = 'signJWT';
      const token = await signJWT({
        jti,
        sub: userDoc.id,
        iat: nowSec,
        exp: nowSec + DEFAULT_SESSION_TTL_SECONDS,
      });
      console.log('[login] leaving signJWT OK');

      // ส่งเฉพาะ field ที่จำเป็นสำหรับ UI rendering เท่านั้น
      // Response body is unchanged from before Phase 3 — the client reads the
      // same shape; the cookie is additive and ignored until Phase 4.
      console.log('[login] entering NextResponse.json');
      step = 'buildResponse';
      const response = NextResponse.json({
        success: true,
        mustChangePIN: userData.mustChangePIN || false,
        user: {
          id: userDoc.id,
          employeeId: userData.employeeId,
          firstName: userData.firstNameEN,
          lastName: userData.lastNameEN,
          nickname: userData.nickname ?? undefined,
          role: userData.role,
          employeeType: userData.employeeType,
          department: userData.departmentName,
          profileImage: userData.profileImage ?? null,
        },
      });
      console.log('[login] leaving NextResponse.json OK');

      console.log('[login] entering cookies.set');
      step = 'setCookie';
      response.cookies.set(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        // Secure only in production so local HTTP development can still
        // receive the cookie (browsers drop Secure cookies over plain HTTP).
        secure: process.env.NODE_ENV === 'production',
        maxAge: DEFAULT_SESSION_TTL_SECONDS,
      });
      console.log('[login] leaving cookies.set OK');

      return response;
    } catch (sessionError: any) {
      // TEMPORARY (Phase 3 diagnosis): report which step failed and the error
      // NAME/message — never secrets, JWTs, cookies, or PINs. `step` names the
      // failing operation; the error message from the wrapper/crypto identifies
      // the cause without exposing any credential.
      console.error(
        `[login] session creation failed at step=${step}:`,
        sessionError?.name,
        sessionError?.message
      );
      return NextResponse.json(
        {
          message: 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่',
          _debugStep: step,
          _debugError: sessionError?.name ?? 'UnknownError',
          _debugMessage: sessionError?.message ?? '',
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json(
      { message: 'เกิดข้อผิดพลาด กรุณาลองใหม่', error: error.message },
      { status: 500 }
    );
  }
}
