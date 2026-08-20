// =============================================================================
// src/app/api/leave-balances/route.ts
// =============================================================================
// GET /api/leave-balances?requesterId=&userId=&year=
// Returns the requester's own balance by default, or another employee's if
// the requester is HR/Admin. Reads/writes the SAME `leaveBalances` collection
// already consumed by /api/attendance/dashboard/summary and
// /api/employees/[id] (field name `userId`, doc id `${userId}_${year}`).
//
// NOTE: this endpoint does NOT auto-calculate entitlement (tenure-based
// vacation tiers, gender-based maternity, etc.) — that's a separate future
// task. For now it returns whatever numbers exist in Firestore, or an empty
// map if the employee has no balance doc yet (HR sets initial balances
// manually for now).
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import type { LeaveBalance } from '@/types/leave';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const requesterId = searchParams.get('requesterId') || '';
    const targetUserId = searchParams.get('userId') || requesterId;
    const year = parseInt(
      searchParams.get('year') || String(new Date().getFullYear()),
      10
    );

    if (!requesterId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'MISSING_REQUESTER', message: 'Missing requesterId' },
        },
        { status: 400 }
      );
    }
    const requesterDoc = await adminDb
      .collection('users')
      .doc(requesterId)
      .get();
    if (!requesterDoc.exists) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
        },
        { status: 401 }
      );
    }
    const requester = requesterDoc.data() as any;
    const isHR = ['admin', 'hr_manager'].includes(requester?.role);

    if (targetUserId !== requesterId && !isHR) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'FORBIDDEN', message: 'ดูได้เฉพาะยอดของตัวเอง' },
        },
        { status: 403 }
      );
    }

    const docId = `${targetUserId}_${year}`;
    const doc = await adminDb.collection('leaveBalances').doc(docId).get();

    if (!doc.exists) {
      return NextResponse.json({
        success: true,
        data: {
          id: docId,
          userId: targetUserId,
          year,
          balances: {},
          updatedAt: null,
        } as unknown as LeaveBalance,
        message: 'ยังไม่มีการตั้งค่ายอดวันลาสำหรับปีนี้',
      });
    }

    return NextResponse.json({
      success: true,
      data: { id: doc.id, ...doc.data() },
    });
  } catch (error: any) {
    console.error('GET /api/leave-balances error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message },
      },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { requesterId, userId, year, balances } = body;

    if (!requesterId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'MISSING_REQUESTER', message: 'Missing requesterId' },
        },
        { status: 400 }
      );
    }
    const requesterDoc = await adminDb
      .collection('users')
      .doc(requesterId)
      .get();
    const requester = requesterDoc.data() as any;
    if (
      !requesterDoc.exists ||
      !['admin', 'hr_manager'].includes(requester?.role)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'FORBIDDEN', message: 'HR or Admin only' },
        },
        { status: 403 }
      );
    }

    if (!userId || !year || !balances) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'MISSING_FIELDS',
            message: 'กรุณาระบุ userId, year, balances',
          },
        },
        { status: 400 }
      );
    }

    const docId = `${userId}_${year}`;
    await adminDb.collection('leaveBalances').doc(docId).set(
      {
        userId,
        year,
        balances,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return NextResponse.json({
      success: true,
      message: 'บันทึกยอดวันลาสำเร็จ',
      data: { id: docId, userId, year, balances },
    });
  } catch (error: any) {
    console.error('PATCH /api/leave-balances error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message },
      },
      { status: 500 }
    );
  }
}
