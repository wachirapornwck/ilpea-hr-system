// =============================================================================
// src/app/api/company-events/route.ts
// =============================================================================
// GET  — list company events with ?requesterId=&year=&month=&includeInactive=
//        Visibility is filtered server-side per requester (see below) —
//        this is the enforcement point; the frontend must never rely on
//        client-side filtering for visibility.
// POST — create a new company event. Any authenticated user may create one
//        (unlike /api/holidays, which is HR/Admin-only for writes) — must
//        select at least one department when visibilityScope='departments'.
//
// Follows the exact same convention as /api/holidays (inline auth check,
// {success,data}/{success,error} response shape, .limit(500) fetch-then-
// filter-in-JS to avoid composite index requirements, soft-delete via
// `isActive`). No shared type file, no shared auth/validation helper —
// this project's established pattern duplicates these inline per route.
//
// Firestore collection: companyEvents (new — does not touch `holidays`,
// `users`, or any other existing collection).
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

const HR_ROLES = ['admin', 'hr_manager'];

// GET/POST only require the requester to exist — Company Events are
// creatable/visible more broadly than Holidays (see permission table in the
// approved spec). Role-restricted actions (edit/delete others' events) are
// out of scope for this file; they belong to Step 2 ([id]/route.ts).
async function assertRequesterExists(requesterId: string) {
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
  return { ok: true as const, requester: doc.data() as Record<string, any> };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const requesterId = searchParams.get('requesterId') || '';

    const auth = await assertRequesterExists(requesterId);
    if (!auth.ok) {
      return NextResponse.json(
        { success: false, error: { code: auth.code, message: auth.message } },
        { status: auth.status }
      );
    }
    const requester = auth.requester;
    const requesterDepartmentId = requester.departmentId ?? '';
    const isHR = HR_ROLES.includes(requester?.role);

    const year = searchParams.get('year') || '';
    const month = searchParams.get('month') || ''; // '1'..'12'
    const includeInactive = searchParams.get('includeInactive') === 'true';

    const snap = await adminDb.collection('companyEvents').limit(500).get();
    let items = snap.docs.map(
      (doc: { id: string; data: () => Record<string, any> }) => ({
        id: doc.id,
        ...doc.data(),
      })
    );

    // ── Visibility filter — server-side enforcement per approved spec ──
    items = items.filter((e: Record<string, any>) => {
      if (e.createdBy === requesterId) return true;
      if (isHR) return true;
      if (e.visibilityScope === 'company') return true;
      if (
        e.visibilityScope === 'departments' &&
        Array.isArray(e.visibleDepartmentIds) &&
        requesterDepartmentId &&
        e.visibleDepartmentIds.includes(requesterDepartmentId)
      ) {
        return true;
      }
      return false;
    });

    if (!includeInactive) {
      items = items.filter((e: Record<string, any>) => e.isActive !== false);
    }
    if (year) {
      items = items.filter((e: Record<string, any>) =>
        (e.date || '').startsWith(year)
      );
    }
    if (month) {
      const mm = month.padStart(2, '0');
      items = items.filter(
        (e: Record<string, any>) => (e.date || '').slice(5, 7) === mm
      );
    }

    items.sort((a: Record<string, any>, b: Record<string, any>) =>
      (a.date || '').localeCompare(b.date || '')
    );

    return NextResponse.json({ success: true, data: items });
  } catch (error: any) {
    console.error('GET /api/company-events error:', error);
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
    const body = await req.json();

    const auth = await assertRequesterExists(body.requesterId);
    if (!auth.ok) {
      return NextResponse.json(
        { success: false, error: { code: auth.code, message: auth.message } },
        { status: auth.status }
      );
    }
    const requester = auth.requester;

    if (!body.title?.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'MISSING_TITLE', message: 'กรุณาระบุชื่อ Event' },
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
    if (!['company', 'departments'].includes(body.visibilityScope)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_VISIBILITY_SCOPE',
            message: "visibilityScope ต้องเป็น 'company' หรือ 'departments'",
          },
        },
        { status: 400 }
      );
    }

    let visibleDepartmentIds: string[] = [];
    if (body.visibilityScope === 'departments') {
      if (
        !Array.isArray(body.visibleDepartmentIds) ||
        body.visibleDepartmentIds.length === 0
      ) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'MISSING_DEPARTMENTS',
              message: 'กรุณาเลือกอย่างน้อย 1 แผนกที่จะให้เห็น Event นี้',
            },
          },
          { status: 400 }
        );
      }
      // ── Verify every department ID actually exists before insert ──
      const deptSnap = await adminDb.collection('departments').limit(500).get();
      const validDeptIds = new Set(
        deptSnap.docs.map((doc: { id: string }) => doc.id)
      );
      const unknownIds = body.visibleDepartmentIds.filter(
        (id: string) => !validDeptIds.has(id)
      );
      if (unknownIds.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INVALID_DEPARTMENT_IDS',
              message: `ไม่พบแผนกที่เลือกในระบบ: ${unknownIds.join(', ')}`,
            },
          },
          { status: 400 }
        );
      }
      visibleDepartmentIds = body.visibleDepartmentIds;
    }

    // ── Time range (optional) — both must be present together, HH:MM
    // format, and endTime after startTime. Neither field is required;
    // omitting both keeps the event as isAllDay (unchanged v1 behavior). ──
    const hasStartTime = body.startTime !== undefined && body.startTime !== '';
    const hasEndTime = body.endTime !== undefined && body.endTime !== '';
    if (hasStartTime !== hasEndTime) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INCOMPLETE_TIME_RANGE',
            message: 'กรุณาระบุเวลาเริ่มและเวลาสิ้นสุดให้ครบทั้งคู่',
          },
        },
        { status: 400 }
      );
    }
    const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (hasStartTime && !timePattern.test(body.startTime)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_START_TIME',
            message: 'เวลาเริ่มไม่ถูกต้อง (ต้องเป็น HH:MM)',
          },
        },
        { status: 400 }
      );
    }
    if (hasEndTime && !timePattern.test(body.endTime)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_END_TIME',
            message: 'เวลาสิ้นสุดไม่ถูกต้อง (ต้องเป็น HH:MM)',
          },
        },
        { status: 400 }
      );
    }
    if (hasStartTime && hasEndTime && body.endTime <= body.startTime) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_TIME_RANGE',
            message: 'เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม',
          },
        },
        { status: 400 }
      );
    }

    // ── Attendees (optional) — verify every user ID actually exists,
    // same pattern as the department-ID check above. ──
    let attendeeUserIds: string[] = [];
    if (body.attendeeUserIds !== undefined) {
      if (!Array.isArray(body.attendeeUserIds)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INVALID_ATTENDEES',
              message: 'attendeeUserIds ต้องเป็น array',
            },
          },
          { status: 400 }
        );
      }
      if (body.attendeeUserIds.length > 0) {
        const userChecks = await Promise.all(
          body.attendeeUserIds.map((uid: string) =>
            adminDb.collection('users').doc(uid).get()
          )
        );
        const unknownUserIds = body.attendeeUserIds.filter(
          (_: string, i: number) => !userChecks[i].exists
        );
        if (unknownUserIds.length > 0) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'INVALID_ATTENDEE_IDS',
                message: `ไม่พบพนักงานที่เลือก: ${unknownUserIds.join(', ')}`,
              },
            },
            { status: 400 }
          );
        }
      }
      attendeeUserIds = body.attendeeUserIds;
    }

    // ── createdByName/createdByDepartment* are ALWAYS derived from the
    // requester's own user document — never accepted from the client, even
    // if present in the request body, to prevent spoofing. ──
    const createdByName = `${requester.firstNameTH ?? ''} ${
      requester.lastNameTH ?? ''
    }`.trim();
    const createdByDepartmentId = requester.departmentId ?? '';
    const createdByDepartment = requester.departmentName ?? '';

    const now = new Date().toISOString();
    const newEvent = {
      title: body.title.trim(),
      description: body.description?.trim() || '',
      date: body.date,
      type: body.type?.trim() || 'Other',
      isAllDay: !(hasStartTime && hasEndTime),
      startTime: hasStartTime ? body.startTime : null,
      endTime: hasEndTime ? body.endTime : null,
      attendeeUserIds,
      visibilityScope: body.visibilityScope,
      visibleDepartmentIds,
      createdBy: body.requesterId,
      createdByName,
      createdByDepartmentId,
      createdByDepartment,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    const result = await adminDb.collection('companyEvents').add(newEvent);

    return NextResponse.json(
      {
        success: true,
        data: { id: result.id, ...newEvent },
        message: 'สร้าง Event สำเร็จ',
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('POST /api/company-events error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message },
      },
      { status: 500 }
    );
  }
}
