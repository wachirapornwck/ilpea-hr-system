// =============================================================================
// src/app/api/holidays/route.ts
// =============================================================================
// GET  — list holidays with ?requesterId=&year=&type=&isActive=&search=
// POST — create a new holiday
// Follows the exact same convention as /api/departments, /api/positions,
// /api/leave-types (inline auth check, {success,data}/{success,error} shape).
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import type { Holiday, HolidayCreateInput } from '@/types/holiday';

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

    const year = searchParams.get('year') || '';
    const type = searchParams.get('type') || '';
    const isActiveParam = searchParams.get('isActive'); // 'true' | 'false' | null
    const search = (searchParams.get('search') || '').trim().toLowerCase();

    const snap = await adminDb.collection('holidays').limit(500).get();
    let items = snap.docs.map(
      (doc: { id: string; data: () => Record<string, any> }) => ({
        id: doc.id,
        ...doc.data(),
      })
    ) as Holiday[];

    if (year) items = items.filter((h) => h.date?.startsWith(year));
    if (type) items = items.filter((h) => h.type === type);
    if (isActiveParam !== null && isActiveParam !== '') {
      const wantActive = isActiveParam === 'true';
      items = items.filter((h) => (h.isActive !== false) === wantActive);
    }
    if (search) {
      items = items.filter((h) =>
        [h.name, h.nameEN, h.description]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(search)
      );
    }

    items.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    return NextResponse.json({ success: true, data: items });
  } catch (error: any) {
    console.error('GET /api/holidays error:', error);
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
    const body = (await req.json()) as HolidayCreateInput;
    const auth = await assertRequesterIsHR(body.requesterId);
    if (!auth.ok) {
      return NextResponse.json(
        { success: false, error: { code: auth.code, message: auth.message } },
        { status: auth.status }
      );
    }

    if (!body.name?.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'MISSING_NAME', message: 'กรุณาระบุชื่อวันหยุด' },
        },
        { status: 400 }
      );
    }
    if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
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
    if (!body.type?.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'MISSING_TYPE', message: 'กรุณาระบุประเภทวันหยุด' },
        },
        { status: 400 }
      );
    }

    // ห้ามวันที่ซ้ำ — เช็คเฉพาะวันหยุดที่ยัง active อยู่ (ปิดใช้งานแล้วซ้ำได้ ไม่ถือว่าเป็นวันหยุดจริง)
    const dupSnap = await adminDb
      .collection('holidays')
      .where('date', '==', body.date)
      .get();
    const hasDuplicate = dupSnap.docs.some(
      (doc: { data: () => Record<string, any> }) =>
        doc.data().isActive !== false
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

    const now = new Date().toISOString();
    const newHoliday: Omit<Holiday, 'id'> = {
      name: body.name.trim(),
      ...(body.nameEN ? { nameEN: body.nameEN.trim() } : {}),
      date: body.date,
      type: body.type.trim(),
      ...(body.description ? { description: body.description.trim() } : {}),
      isActive: true,
      repeatEveryYear: body.repeatEveryYear ?? false,
      scope: 'company',
      createdBy: body.requesterId,
      createdAt: now,
      updatedAt: now,
    };

    const result = await adminDb.collection('holidays').add(newHoliday as any);

    return NextResponse.json(
      {
        success: true,
        data: { id: result.id, ...newHoliday },
        message: 'เพิ่มวันหยุดสำเร็จ',
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('POST /api/holidays error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message },
      },
      { status: 500 }
    );
  }
}
