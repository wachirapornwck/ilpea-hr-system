// =============================================================================
// src/app/api/company-settings/route.ts
// =============================================================================
// Lets HR/Admin view and update the factory GPS reference point + clock-in
// radius thresholds — the values read by /api/attendance/clock-in.
// Reads/writes the SAME document (companySettings/main) that api/seed/route.ts
// already creates. Does not touch companySettings/default (unused) or the
// unrelated CompanySettings leave-policy type in types/common.ts.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import type {
  FactorySettings,
  FactorySettingsUpdateInput,
} from '@/types/factory-settings';

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
    const auth = await assertRequesterIsHR(requesterId);
    if (!auth.ok) {
      return NextResponse.json(
        { success: false, error: { code: auth.code, message: auth.message } },
        { status: auth.status }
      );
    }

    const snap = await adminDb.collection('companySettings').doc('main').get();
    if (!snap.exists) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'ยังไม่มีการตั้งค่าโรงงาน' },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: snap.data() as FactorySettings,
    });
  } catch (error: any) {
    console.error('GET /api/company-settings error:', error);
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
    const body = (await req.json()) as FactorySettingsUpdateInput;
    const auth = await assertRequesterIsHR(body.requesterId);
    if (!auth.ok) {
      return NextResponse.json(
        { success: false, error: { code: auth.code, message: auth.message } },
        { status: auth.status }
      );
    }

    const {
      latitude,
      longitude,
      address,
      clockInApproveRadius,
      clockInFlagRadius,
      clockInRejectRadius,
      clockInMaxAccuracy,
    } = body;

    if (
      typeof latitude !== 'number' ||
      latitude < -90 ||
      latitude > 90 ||
      typeof longitude !== 'number' ||
      longitude < -180 ||
      longitude > 180
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_COORDINATES',
            message: 'พิกัด GPS ไม่ถูกต้อง',
          },
        },
        { status: 400 }
      );
    }

    const radii = [
      clockInApproveRadius,
      clockInFlagRadius,
      clockInRejectRadius,
      clockInMaxAccuracy,
    ];
    if (radii.some((r) => typeof r !== 'number' || r < 0)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_RADIUS',
            message: 'ค่ารัศมีต้องเป็นตัวเลขไม่ติดลบ',
          },
        },
        { status: 400 }
      );
    }

    await adminDb.collection('companySettings').doc('main').update({
      factoryLocation: { latitude, longitude, address },
      clockInApproveRadius,
      clockInFlagRadius,
      clockInRejectRadius,
      clockInMaxAccuracy,
      updatedAt: new Date().toISOString(),
      updatedBy: body.requesterId,
    });

    return NextResponse.json({
      success: true,
      message: 'บันทึกตำแหน่งโรงงานสำเร็จ',
    });
  } catch (error: any) {
    console.error('PATCH /api/company-settings error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message },
      },
      { status: 500 }
    );
  }
}
