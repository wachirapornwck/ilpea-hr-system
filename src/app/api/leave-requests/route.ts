// =============================================================================
// src/app/api/leave-requests/route.ts
// =============================================================================
// GET  — list leave requests (own, or all/filtered if requester is HR/Admin)
// POST — submit a new leave request (status starts as 'pending')
//
// NOTE (scope for this version):
// - Duration is calculated as simple inclusive calendar days (endDate -
//   startDate + 1). Shift-aware / holiday-aware working-day calculation
//   (per LeaveDuration.workingDays) is a follow-up improvement, not done here.
// - Advance-notice-days from the leave type is checked and returned as a
//   non-blocking `warning` — HR can still see it was late and decide,
//   consistent with the policy note that late notice may forfeit attendance
//   bonus rather than block the leave outright.
// - File attachment upload is NOT implemented (Firebase Storage requires a
//   paid plan, deferred per earlier project notes) — `attachment` is
//   accepted as a plain text note for now if provided.
// - Balance is NOT deducted at submission time, only at approval — see
//   PATCH /api/leave-requests/[id].
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import type { LeaveRequest, CreateLeaveRequestPayload } from '@/types/leave';

export const dynamic = 'force-dynamic';

function daysBetweenInclusive(startDate: string, endDate: string): number {
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  const diffMs = end.getTime() - start.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const requesterId = searchParams.get('requesterId') || '';
    const filterUserId = searchParams.get('userId') || '';
    const filterStatus = searchParams.get('status') || '';

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

    // พนักงานทั่วไปเห็นได้แค่ใบลาของตัวเองเท่านั้น ไม่ว่าจะส่ง userId มาหรือไม่
    const effectiveUserId = isHR ? filterUserId : requesterId;

    const snap = await adminDb.collection('leaveRequests').limit(500).get();
    let items = snap.docs.map(
      (doc: { id: string; data: () => Record<string, any> }) => ({
        id: doc.id,
        ...doc.data(),
      })
    ) as LeaveRequest[];

    if (effectiveUserId)
      items = items.filter((r) => r.userId === effectiveUserId);
    if (filterStatus) items = items.filter((r) => r.status === filterStatus);

    items.sort(
      (a, b) =>
        new Date(b.createdAt || 0).getTime() -
        new Date(a.createdAt || 0).getTime()
    );

    return NextResponse.json({ success: true, data: items });
  } catch (error: any) {
    console.error('GET /api/leave-requests error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message },
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreateLeaveRequestPayload & {
      requesterId: string;
    };
    const { requesterId, leaveTypeId, startDate, endDate, reason } = body;

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

    if (!leaveTypeId || !startDate || !endDate || !reason?.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'MISSING_FIELDS',
            message: 'กรุณาระบุประเภทการลา วันที่ และเหตุผล',
          },
        },
        { status: 400 }
      );
    }
    if (new Date(endDate) < new Date(startDate)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_DATE_RANGE',
            message: 'วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม',
          },
        },
        { status: 400 }
      );
    }

    const leaveTypeDoc = await adminDb
      .collection('leaveTypes')
      .doc(leaveTypeId)
      .get();
    if (!leaveTypeDoc.exists) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'LEAVE_TYPE_NOT_FOUND',
            message: 'ไม่พบประเภทการลานี้',
          },
        },
        { status: 404 }
      );
    }
    const leaveType = leaveTypeDoc.data() as any;
    if (leaveType.active === false) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'LEAVE_TYPE_INACTIVE',
            message: 'ประเภทการลานี้ปิดใช้งานอยู่',
          },
        },
        { status: 400 }
      );
    }

    const calendarDays = daysBetweenInclusive(startDate, endDate);

    // เช็คการยื่นล่วงหน้า — ไม่บล็อก แค่แจ้งเตือนกลับไปให้ HR เห็นว่ายื่นช้า
    let warning: string | undefined;
    const daysNotice = Math.floor(
      (new Date(startDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    if (
      leaveType.advanceNoticeDays > 0 &&
      daysNotice < leaveType.advanceNoticeDays
    ) {
      warning = `ยื่นล่วงหน้าไม่ครบ ${
        leaveType.advanceNoticeDays
      } วันตามระเบียบ (ยื่นล่วงหน้าจริง ${Math.max(
        daysNotice,
        0
      )} วัน) — อาจกระทบเบี้ยขยันตามดุลยพินิจของ HR`;
    }

    if (leaveType.requiresAttachment === 'always' && !body.attachment) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'ATTACHMENT_REQUIRED',
            message: `ประเภทการลานี้ต้องมีหลักฐานแนบ${
              leaveType.attachmentCondition
                ? ` (${leaveType.attachmentCondition})`
                : ''
            }`,
          },
        },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const newRequest: Omit<LeaveRequest, 'id'> = {
      userId: requesterId,
      leaveTypeId,
      leaveTypeCode: leaveType.code,
      leaveTypeName: leaveType.name,
      startDate,
      endDate,
      duration: {
        calendarDays,
        workingDays: calendarDays, // TODO: หัก weekend/holiday แบบ shift-aware ในเวอร์ชันถัดไป
        halfDay: false,
      },
      reason: reason.trim(),
      status: 'pending',
      stages: [
        {
          stage: 1,
          totalStages: 1,
          approverId: '',
          status: 'pending',
        },
      ],
      currentStage: 1,
      createdAt: now,
      updatedAt: now,
    };

    const result = await adminDb
      .collection('leaveRequests')
      .add(newRequest as any);

    await adminDb.collection('leaveHistory').add({
      leaveRequestId: result.id,
      action: 'submitted',
      previousStatus: '',
      newStatus: 'pending',
      performedBy: requesterId,
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json(
      {
        success: true,
        data: { id: result.id, ...newRequest },
        message: 'ยื่นใบลาสำเร็จ รอการอนุมัติ',
        ...(warning ? { warning } : {}),
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('POST /api/leave-requests error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message },
      },
      { status: 500 }
    );
  }
}
