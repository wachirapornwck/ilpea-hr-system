// =============================================================================
// src/app/api/holidays/clone-recurring/route.ts
// =============================================================================
// POST — copies all holidays marked repeatEveryYear:true from sourceYear to
// targetYear, shifting the date's year while keeping month/day identical.
// Skips (does not overwrite) any target date that already has an active
// holiday, and reports which ones were skipped so HR can review manually.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import type { Holiday } from '@/types/holiday';

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { requesterId, sourceYear, targetYear } = body as {
      requesterId: string;
      sourceYear: number;
      targetYear: number;
    };

    const auth = await assertRequesterIsHR(requesterId);
    if (!auth.ok) {
      return NextResponse.json(
        { success: false, error: { code: auth.code, message: auth.message } },
        { status: auth.status }
      );
    }

    if (!sourceYear || !targetYear) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'MISSING_FIELDS',
            message: 'กรุณาระบุปีต้นทางและปีปลายทาง',
          },
        },
        { status: 400 }
      );
    }
    if (sourceYear === targetYear) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'SAME_YEAR',
            message: 'ปีต้นทางและปลายทางต้องไม่เหมือนกัน',
          },
        },
        { status: 400 }
      );
    }

    const snap = await adminDb.collection('holidays').limit(500).get();
    const all = snap.docs.map(
      (doc: { id: string; data: () => Record<string, any> }) => ({
        id: doc.id,
        ...doc.data(),
      })
    ) as Holiday[];

    const sourceHolidays = all.filter(
      (h) =>
        h.date.startsWith(String(sourceYear)) &&
        h.repeatEveryYear === true &&
        h.isActive !== false
    );

    if (sourceHolidays.length === 0) {
      return NextResponse.json({
        success: true,
        data: { created: 0, skipped: [] },
        message: `ไม่พบวันหยุดประจำ (repeatEveryYear) ในปี ${sourceYear} ให้คัดลอก`,
      });
    }

    const existingTargetDates = new Set(
      all
        .filter(
          (h) => h.date.startsWith(String(targetYear)) && h.isActive !== false
        )
        .map((h) => h.date)
    );

    const now = new Date().toISOString();
    let created = 0;
    const skipped: string[] = [];

    for (const h of sourceHolidays) {
      const [, month, day] = h.date.split('-');
      const newDate = `${targetYear}-${month}-${day}`;

      if (existingTargetDates.has(newDate)) {
        skipped.push(`${h.name} (${newDate}) — มีวันหยุดในวันนี้อยู่แล้ว`);
        continue;
      }

      const newHoliday: Omit<Holiday, 'id'> = {
        name: h.name,
        ...(h.nameEN ? { nameEN: h.nameEN } : {}),
        date: newDate,
        type: h.type,
        ...(h.description ? { description: h.description } : {}),
        isActive: true,
        repeatEveryYear: true,
        scope: 'company',
        createdBy: requesterId,
        createdAt: now,
        updatedAt: now,
      };
      await adminDb.collection('holidays').add(newHoliday as any);
      existingTargetDates.add(newDate);
      created++;
    }

    return NextResponse.json({
      success: true,
      data: { created, skipped },
      message: `คัดลอกสำเร็จ ${created} รายการ${
        skipped.length > 0
          ? ` (ข้าม ${skipped.length} รายการเพราะมีวันหยุดในวันนั้นอยู่แล้ว)`
          : ''
      }`,
    });
  } catch (error: any) {
    console.error('POST /api/holidays/clone-recurring error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message },
      },
      { status: 500 }
    );
  }
}
