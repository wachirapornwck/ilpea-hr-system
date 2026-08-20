// =============================================================================
// src/app/api/leave-types/[id]/route.ts
// =============================================================================
// PATCH  — update a leave type (also used to reactivate: active: true)
// DELETE — soft delete (active: false). Matches convention already used by
// /api/departments/[id] and /api/positions/[id] — never hard-delete master
// data that other collections may reference (leaveRequests.leaveTypeId).
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import type { LeaveTypeUpdateInput } from '@/types/leave';

async function assertRequesterIsHR(requesterId: string) {
  if (!requesterId) {
    return {
      ok: false as const,
      status: 400,
      code: 'MISSING_REQUESTER',
      message: 'Missing requesterId',
    };
  }
  const doc = await adminDb.collection('users').doc(requesterId).get();
  if (!doc.exists) {
    return {
      ok: false as const,
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Unauthorized',
    };
  }
  const requester = doc.data() as any;
  if (!['admin', 'hr_manager'].includes(requester?.role)) {
    return {
      ok: false as const,
      status: 403,
      code: 'FORBIDDEN',
      message: 'HR or Admin only',
    };
  }
  return { ok: true as const };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = (await req.json()) as LeaveTypeUpdateInput;
    const auth = await assertRequesterIsHR(body.requesterId);
    if (!auth.ok) {
      return NextResponse.json(
        { success: false, error: { code: auth.code, message: auth.message } },
        { status: auth.status }
      );
    }

    const docRef = adminDb.collection('leaveTypes').doc(params.id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'ไม่พบประเภทการลานี้' },
        },
        { status: 404 }
      );
    }

    const { requesterId, ...updates } = body;
    await docRef.update({ ...updates, updatedAt: new Date().toISOString() });

    return NextResponse.json({
      success: true,
      data: { id: params.id, ...doc.data(), ...updates },
      message: 'บันทึกสำเร็จ',
    });
  } catch (error: any) {
    console.error('PATCH /api/leave-types/[id] error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message },
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(req.url);
    const requesterId = searchParams.get('requesterId') || '';
    const auth = await assertRequesterIsHR(requesterId);
    if (!auth.ok) {
      return NextResponse.json(
        { success: false, error: { code: auth.code, message: auth.message } },
        { status: auth.status }
      );
    }

    const docRef = adminDb.collection('leaveTypes').doc(params.id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'ไม่พบประเภทการลานี้' },
        },
        { status: 404 }
      );
    }

    const permanent = searchParams.get('permanent') === 'true';

    if (permanent) {
      // ลบถาวร — เช็คก่อนว่าไม่มี leaveRequests ใบไหนอ้างอิง leaveTypeId นี้อยู่
      // (คอลเลกชัน leaveRequests ยังไม่มีข้อมูลตอนนี้ แต่เขียนเผื่อไว้ตั้งแต่
      // ต้น เพื่อไม่ให้เกิด dangling reference ในอนาคต)
      const reqSnap = await adminDb
        .collection('leaveRequests')
        .where('leaveTypeId', '==', params.id)
        .limit(1)
        .get();

      if (!reqSnap.empty) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'LEAVE_TYPE_IN_USE',
              message:
                'ไม่สามารถลบถาวรได้ เนื่องจากยังมีใบลาที่อ้างอิงประเภทนี้อยู่',
            },
          },
          { status: 409 }
        );
      }

      await docRef.delete();

      return NextResponse.json({
        success: true,
        data: { id: params.id, deleted: true },
      });
    }

    await docRef.update({ active: false, updatedAt: new Date().toISOString() });

    return NextResponse.json({
      success: true,
      data: { id: params.id, active: false },
      message: 'ปิดใช้งานประเภทการลาสำเร็จ',
    });
  } catch (error: any) {
    console.error('DELETE /api/leave-types/[id] error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message },
      },
      { status: 500 }
    );
  }
}
