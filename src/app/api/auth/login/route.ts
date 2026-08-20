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
    // TEMPORARY (Phase 3 diagnosis) — numbered step tracking. Server logs are
    // unreadable in this environment, so the failing step and error detail are
    // ALSO returned in the 500 body (readable via Network tab, or on-screen if
    // context.tsx surfaces it). Diagnostic only; removed once cause is known.
    let stepNum = 0;
    let stepName = 'start';
    try {
      stepNum = 1;
      stepName = 'createSession';
      console.log('[LOGIN][1] createSession - start');
      const created = await createSession(userDoc.id);
      jti = created.jti;
      console.log('[LOGIN][1] createSession - success');

      const nowSec = Math.floor(Date.now() / 1000);

      stepNum = 2;
      stepName = 'signJWT';
      console.log('[LOGIN][2] signJWT - start');
      const token = await signJWT({
        jti,
        sub: userDoc.id,
        iat: nowSec,
        exp: nowSec + DEFAULT_SESSION_TTL_SECONDS,
      });
      console.log('[LOGIN][2] signJWT - success');

      // ส่งเฉพาะ field ที่จำเป็นสำหรับ UI rendering เท่านั้น
      // Response body is unchanged from before Phase 3 — the client reads the
      // same shape; the cookie is additive and ignored until Phase 4.
      stepNum = 3;
      stepName = 'NextResponse.json';
      console.log('[LOGIN][3] NextResponse.json - start');
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
      console.log('[LOGIN][3] NextResponse.json - success');

      stepNum = 4;
      stepName = 'cookies.set';
      console.log('[LOGIN][4] cookies.set - start');
      response.cookies.set(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        // Secure only in production so local HTTP development can still
        // receive the cookie (browsers drop Secure cookies over plain HTTP).
        secure: process.env.NODE_ENV === 'production',
        maxAge: DEFAULT_SESSION_TTL_SECONDS,
      });
      console.log('[LOGIN][4] cookies.set - success');

      return response;
    } catch (sessionError: any) {
      // TEMPORARY (Phase 3 diagnosis): identify exactly which step failed.
      // Logs the step number, function name, error constructor name, message,
      // and stack. Never logs JWT, SESSION_SECRET, PIN, cookie values, or user
      // personal data.
      const errName =
        sessionError?.constructor?.name ?? sessionError?.name ?? 'UnknownError';
      const errMessage = sessionError?.message ?? '';
      const errStack = sessionError?.stack ?? '';
      console.error(
        `[LOGIN][${stepNum}] ${stepName} - FAILED`,
        '\n  errorName:',
        errName,
        '\n  message:',
        errMessage,
        '\n  stack:',
        errStack
      );
      return NextResponse.json(
        {
          message: 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่',
          _debugStepNum: stepNum,
          _debugStep: stepName,
          _debugError: errName,
          _debugMessage: errMessage,
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
