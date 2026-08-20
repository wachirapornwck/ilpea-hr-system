// =============================================================================
// src/app/api/company-events/[id]/route.ts
// =============================================================================
// PATCH  — update title/description/date/type/visibilityScope/
//          visibleDepartmentIds. Owner or HR/Admin only.
// DELETE — soft-delete by default (isActive: false). ?permanent=true
//          hard-deletes, restricted to HR/Admin regardless of ownership.
//
// Permission model differs from /api/holidays/[id] (which is HR-only for
// every write): here, the event's own creator may also edit/soft-delete —
// matching the Company Events permission table in the approved spec. Only
// permanent delete stays HR/Admin-exclusive, same as Holidays.
//
// Follows the exact same convention as /api/holidays/[id] (inline auth
// check, {success,data}/{success,error} response shape). No shared type
// file, no shared helper — duplicated inline per this project's pattern.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

const HR_ROLES = ['admin', 'hr_manager'];

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

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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
    const isHR = HR_ROLES.includes(requester?.role);

    const docRef = adminDb.collection('companyEvents').doc(params.id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'ไม่พบ Event นี้' },
        },
        { status: 404 }
      );
    }
    const existing = doc.data() as Record<string, any>;

    // ── Permission: creator or HR/Admin only — never any other viewer ──
    const isOwner = existing.createdBy === body.requesterId;
    if (!isHR && !isOwner) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'แก้ไขได้เฉพาะเจ้าของ Event หรือ HR/Admin เท่านั้น',
          },
        },
        { status: 403 }
      );
    }

    if (body.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
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
    if (
      body.visibilityScope !== undefined &&
      !['company', 'departments'].includes(body.visibilityScope)
    ) {
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

    // ── Re-validate visibility as a whole whenever either piece changes ──
    // Effective scope/ids = whatever the request supplies, falling back to
    // the existing stored values for whichever piece wasn't sent.
    const effectiveScope = body.visibilityScope ?? existing.visibilityScope;
    let effectiveDeptIds: string[] =
      body.visibleDepartmentIds !== undefined
        ? body.visibleDepartmentIds
        : existing.visibleDepartmentIds ?? [];

    if (effectiveScope === 'departments') {
      if (!Array.isArray(effectiveDeptIds) || effectiveDeptIds.length === 0) {
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
      const deptSnap = await adminDb.collection('departments').limit(500).get();
      const validDeptIds = new Set(
        deptSnap.docs.map((d: { id: string }) => d.id)
      );
      const unknownIds = effectiveDeptIds.filter(
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
    } else {
      // scope is (or became) 'company' — departments list is meaningless
      effectiveDeptIds = [];
    }

    // ── Time range (optional) — same rule as POST: both fields together,
    // HH:MM format, endTime after startTime. Only validated if either is
    // present in this request (partial update — omitting both leaves the
    // existing time value, if any, untouched). ──
    const touchesStartTime = body.startTime !== undefined;
    const touchesEndTime = body.endTime !== undefined;
    let effectiveStartTime: string | null =
      body.startTime !== undefined
        ? body.startTime
        : existing.startTime ?? null;
    let effectiveEndTime: string | null =
      body.endTime !== undefined ? body.endTime : existing.endTime ?? null;

    if (touchesStartTime || touchesEndTime) {
      const hasStart = !!effectiveStartTime;
      const hasEnd = !!effectiveEndTime;
      if (hasStart !== hasEnd) {
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
      if (hasStart && !timePattern.test(effectiveStartTime as string)) {
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
      if (hasEnd && !timePattern.test(effectiveEndTime as string)) {
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
      if (
        hasStart &&
        hasEnd &&
        (effectiveEndTime as string) <= (effectiveStartTime as string)
      ) {
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
      if (!hasStart) effectiveStartTime = null;
      if (!hasEnd) effectiveEndTime = null;
    }

    // ── Attendees (optional) — verify every user ID exists, same as POST ──
    let effectiveAttendeeUserIds: string[] = existing.attendeeUserIds ?? [];
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
      effectiveAttendeeUserIds = body.attendeeUserIds;
    }

    // ── Only whitelisted fields are ever written. createdBy/createdByName/
    // createdByDepartmentId/createdByDepartment/createdAt are immutable —
    // even if present in the request body, they are silently ignored here
    // rather than trusted from the client. ──
    const updates: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };
    if (body.title !== undefined) updates.title = body.title.trim();
    if (body.description !== undefined)
      updates.description = body.description?.trim() || '';
    if (body.date !== undefined) updates.date = body.date;
    if (body.type !== undefined) updates.type = body.type?.trim() || 'Other';
    if (
      body.visibilityScope !== undefined ||
      body.visibleDepartmentIds !== undefined
    ) {
      updates.visibilityScope = effectiveScope;
      updates.visibleDepartmentIds = effectiveDeptIds;
    }
    if (touchesStartTime || touchesEndTime) {
      updates.startTime = effectiveStartTime;
      updates.endTime = effectiveEndTime;
      updates.isAllDay = !(effectiveStartTime && effectiveEndTime);
    }
    if (body.attendeeUserIds !== undefined) {
      updates.attendeeUserIds = effectiveAttendeeUserIds;
    }

    await docRef.update(updates);

    return NextResponse.json({
      success: true,
      data: { id: params.id, ...existing, ...updates },
      message: 'บันทึกสำเร็จ',
    });
  } catch (error: any) {
    console.error('PATCH /api/company-events/[id] error:', error);
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

    const auth = await assertRequesterExists(requesterId);
    if (!auth.ok) {
      return NextResponse.json(
        { success: false, error: { code: auth.code, message: auth.message } },
        { status: auth.status }
      );
    }
    const requester = auth.requester;
    const isHR = HR_ROLES.includes(requester?.role);

    const docRef = adminDb.collection('companyEvents').doc(params.id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'ไม่พบ Event นี้' },
        },
        { status: 404 }
      );
    }
    const existing = doc.data() as Record<string, any>;
    const isOwner = existing.createdBy === requesterId;

    const permanent = searchParams.get('permanent') === 'true';

    if (permanent) {
      // Permanent delete is HR/Admin-exclusive — even the event's own
      // creator cannot hard-delete it themselves, per the approved spec.
      if (!isHR) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'ลบถาวรได้เฉพาะ HR/Admin เท่านั้น',
            },
          },
          { status: 403 }
        );
      }
      await docRef.delete();
      return NextResponse.json({
        success: true,
        data: { id: params.id, deleted: true },
      });
    }

    // Soft-delete: owner or HR/Admin
    if (!isHR && !isOwner) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'ลบได้เฉพาะเจ้าของ Event หรือ HR/Admin เท่านั้น',
          },
        },
        { status: 403 }
      );
    }

    await docRef.update({
      isActive: false,
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      data: { id: params.id, isActive: false },
      message: 'ลบ Event สำเร็จ',
    });
  } catch (error: any) {
    console.error('DELETE /api/company-events/[id] error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message },
      },
      { status: 500 }
    );
  }
}
