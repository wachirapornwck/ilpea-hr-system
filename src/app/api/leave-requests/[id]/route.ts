// =============================================================================
// src/app/api/leave-requests/[id]/route.ts
// =============================================================================
// PATCH — approve / reject / cancel a leave request
//
// Balance handling:
// - approve: deduct duration.calendarDays from leaveBalances.balances[code]
//   (only now, never at submission time)
// - reject: no balance change (nothing was ever deducted)
// - cancel: if the request was already 'approved', restore (add back) the
//   deducted days; if it was still 'pending', no balance change needed
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import type { UpdateLeaveRequestPayload } from '@/types/leave';

async function adjustBalance(
  userId: string,
  year: number,
  code: string,
  delta: number
) {
  const docId = `${userId}_${year}`;
  const docRef = adminDb.collection('leaveBalances').doc(docId);
  const doc = await docRef.get();
  const current = doc.exists
    ? (doc.data() as any)
    : { userId, year, balances: {} };
  const balances = { ...(current.balances || {}) };
  balances[code] = (balances[code] ?? 0) + delta;
  await docRef.set(
    { userId, year, balances, updatedAt: new Date().toISOString() },
    { merge: true }
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = (await req.json()) as UpdateLeaveRequestPayload & {
      requesterId: string;
    };
    const { requesterId, action, remark } = body;

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

    const docRef = adminDb.collection('leaveRequests').doc(params.id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'ไม่พบใบลานี้' },
        },
        { status: 404 }
      );
    }
    const leaveRequest = doc.data() as any;

    if (action === 'approve' || action === 'reject') {
      if (!isHR) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'HR หรือ Admin เท่านั้นที่อนุมัติ/ปฏิเสธได้',
            },
          },
          { status: 403 }
        );
      }
      if (leaveRequest.status !== 'pending') {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INVALID_STATUS',
              message: 'ใบลานี้ถูกดำเนินการไปแล้ว',
            },
          },
          { status: 400 }
        );
      }
    } else if (action === 'cancel') {
      const isOwner = leaveRequest.userId === requesterId;
      if (!isOwner && !isHR) {
        return NextResponse.json(
          {
            success: false,
            error: { code: 'FORBIDDEN', message: 'ไม่มีสิทธิ์ยกเลิกใบลานี้' },
          },
          { status: 403 }
        );
      }
      if (['cancelled', 'rejected'].includes(leaveRequest.status)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INVALID_STATUS',
              message: 'ใบลานี้ถูกยกเลิก/ปฏิเสธไปแล้ว',
            },
          },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_ACTION',
            message: 'action ต้องเป็น approve, reject, หรือ cancel',
          },
        },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const year = new Date(leaveRequest.startDate).getFullYear();
    const updates: Record<string, any> = { updatedAt: now };

    if (action === 'approve') {
      updates.status = 'approved';
      updates.approvedBy = requesterId;
      updates.approvedAt = now;
      if (remark) updates.approvalRemark = remark;
      updates.stages = [
        {
          ...leaveRequest.stages?.[0],
          status: 'approved',
          decidedAt: now,
          remark,
        },
      ];
      await adjustBalance(
        leaveRequest.userId,
        year,
        leaveRequest.leaveTypeCode,
        -leaveRequest.duration.calendarDays
      );
    } else if (action === 'reject') {
      updates.status = 'rejected';
      updates.rejectedBy = requesterId;
      updates.rejectedAt = now;
      if (remark) updates.rejectionRemark = remark;
      updates.stages = [
        {
          ...leaveRequest.stages?.[0],
          status: 'rejected',
          decidedAt: now,
          remark,
        },
      ];
    } else {
      // cancel
      const wasApproved = leaveRequest.status === 'approved';
      updates.status = 'cancelled';
      updates.cancelledBy = requesterId;
      updates.cancelledAt = now;
      if (remark) updates.cancellationRemark = remark;
      if (wasApproved) {
        await adjustBalance(
          leaveRequest.userId,
          year,
          leaveRequest.leaveTypeCode,
          leaveRequest.duration.calendarDays
        );
      }
    }

    await docRef.update(updates);

    await adminDb.collection('leaveHistory').add({
      leaveRequestId: params.id,
      action,
      previousStatus: leaveRequest.status,
      newStatus: updates.status,
      performedBy: requesterId,
      remarks: remark || '',
      createdAt: now,
      updatedAt: now,
    });

    const messages: Record<string, string> = {
      approve: 'อนุมัติใบลาสำเร็จ',
      reject: 'ปฏิเสธใบลาสำเร็จ',
      cancel: 'ยกเลิกใบลาสำเร็จ',
    };

    return NextResponse.json({
      success: true,
      data: { id: params.id, ...leaveRequest, ...updates },
      message: messages[action],
    });
  } catch (error: any) {
    console.error('PATCH /api/leave-requests/[id] error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message },
      },
      { status: 500 }
    );
  }
}
