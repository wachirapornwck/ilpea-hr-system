// =============================================================================
// src/app/api/leave-types/route.ts
// =============================================================================
// Master data for leaveTypes collection — mirrors the exact structure/
// conventions already used by /api/departments and /api/positions in this
// project (auth check inline, {success,data}/{success,error} response shape).
// GET  — list all leave types
// POST — create a new leave type
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import type { LeaveType, LeaveTypeCreateInput } from '@/types/leave';

export const dynamic = 'force-dynamic';

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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const requesterId = searchParams.get('requesterId') || '';
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

    const snap = await adminDb.collection('leaveTypes').limit(100).get();
    const items = (
      snap.docs.map((doc: { id: string; data: () => Record<string, any> }) => ({
        id: doc.id,
        ...doc.data(),
      })) as LeaveType[]
    ).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    return NextResponse.json({ success: true, data: items });
  } catch (error: any) {
    console.error('GET /api/leave-types error:', error);
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
    const body = (await req.json()) as LeaveTypeCreateInput;
    const auth = await assertRequesterIsHR(body.requesterId);
    if (!auth.ok) {
      return NextResponse.json(
        { success: false, error: { code: auth.code, message: auth.message } },
        { status: auth.status }
      );
    }

    const required: (keyof LeaveTypeCreateInput)[] = [
      'code',
      'name',
      'nameEN',
      'entitlementType',
      'payType',
      'requiresAttachment',
    ];
    const missing = required.filter(
      (f) => body[f] === undefined || body[f] === ''
    );
    if (missing.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'MISSING_FIELDS',
            message: `กรุณาระบุ: ${missing.join(', ')}`,
          },
        },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const newLeaveType: Omit<LeaveType, 'id'> = {
      code: body.code,
      name: body.name,
      nameEN: body.nameEN,
      color: body.color || '#3B82F6',
      icon: body.icon || 'calendar',
      entitlementType: body.entitlementType,
      ...(body.fixedDays !== undefined ? { fixedDays: body.fixedDays } : {}),
      ...(body.tenureTiers ? { tenureTiers: body.tenureTiers } : {}),
      ...(body.genderEntitlement
        ? { genderEntitlement: body.genderEntitlement }
        : {}),
      ...(body.maxOccurrencesPerYear !== undefined
        ? { maxOccurrencesPerYear: body.maxOccurrencesPerYear }
        : {}),
      payType: body.payType,
      ...(body.payPercent !== undefined ? { payPercent: body.payPercent } : {}),
      countsHolidays: body.countsHolidays ?? false,
      advanceNoticeDays: body.advanceNoticeDays ?? 0,
      requiresAttachment: body.requiresAttachment,
      ...(body.attachmentCondition
        ? { attachmentCondition: body.attachmentCondition }
        : {}),
      affectsAttendanceBonus: body.affectsAttendanceBonus ?? false,
      ...(body.minTenureYears !== undefined
        ? { minTenureYears: body.minTenureYears }
        : {}),
      requiresApproval: true,
      ...(body.notes ? { notes: body.notes } : {}),
      active: true,
      sortOrder: body.sortOrder ?? 999,
    };

    const result = await adminDb
      .collection('leaveTypes')
      .add(newLeaveType as any);

    return NextResponse.json(
      {
        success: true,
        data: { id: result.id, ...newLeaveType },
        message: 'เพิ่มประเภทการลาสำเร็จ',
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('POST /api/leave-types error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message },
      },
      { status: 500 }
    );
  }
}
