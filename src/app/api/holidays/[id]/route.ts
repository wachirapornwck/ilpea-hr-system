// =============================================================================
// src/app/api/holidays/[id]/route.ts
// =============================================================================
// PATCH  — update fields, or reactivate (isActive: true)
// DELETE — soft-delete by default (isActive: false); ?permanent=true hard-deletes
//
// No reference-integrity guard needed on permanent delete — nothing stores a
// foreign key to a specific holidayId (Attendance matches by `date`, and per
// this phase's explicit scope, Attendance is NOT wired to this module yet).
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import type { HolidayUpdateInput } from '@/types/holiday';

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
    const body = (await req.json()) as HolidayUpdateInput;
    const auth = await assertRequesterIsHR(body.requesterId);
    if (!auth.ok) {
      return NextResponse.json(
        { success: false, error: { code: auth.code, message: auth.message } },
        { status: auth.status }
      );
    }

    const docRef = adminDb.collection('holidays').doc(params.id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'ไม่พบวันหยุดนี้' },
        },
        { status: 404 }
      );
    }

    if (body.date && !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_DATE',
            message: 'รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)',
          },
        },
        { status: 400 }
      );
    }

    // ถ้าเปลี่ยนวันที่ ต้องเช็คซ้ำใหม่ (ไม่นับตัวเอง)
    if (body.date) {
      const dupSnap = await adminDb
        .collection('holidays')
        .where('date', '==', body.date)
        .get();
      const hasDuplicate = dupSnap.docs.some(
        (d: { id: string; data: () => Record<string, any> }) =>
          d.id !== params.id && d.data().isActive !== false
      );
      if (hasDuplicate) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'DUPLICATE_DATE',
              message: `มีวันหยุดในวันที่ ${body.date} อยู่แล้ว`,
            },
          },
          { status: 409 }
        );
      }
    }

    const { requesterId, ...rest } = body;
    const updates: Record<string, any> = {
      ...rest,
      updatedAt: new Date().toISOString(),
      updatedBy: requesterId,
    };

    await docRef.update(updates);

    return NextResponse.json({
      success: true,
      data: { id: params.id, ...doc.data(), ...updates },
      message: 'บันทึกสำเร็จ',
    });
  } catch (error: any) {
    console.error('PATCH /api/holidays/[id] error:', error);
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

    const docRef = adminDb.collection('holidays').doc(params.id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'ไม่พบวันหยุดนี้' },
        },
        { status: 404 }
      );
    }

    const permanent = searchParams.get('permanent') === 'true';

    if (permanent) {
      await docRef.delete();
      return NextResponse.json({
        success: true,
        data: { id: params.id, deleted: true },
      });
    }

    await docRef.update({
      isActive: false,
      updatedAt: new Date().toISOString(),
      updatedBy: requesterId,
    });

    return NextResponse.json({
      success: true,
      data: { id: params.id, isActive: false },
      message: 'ปิดใช้งานวันหยุดสำเร็จ',
    });
  } catch (error: any) {
    console.error('DELETE /api/holidays/[id] error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message },
      },
      { status: 500 }
    );
  }
}
