// =============================================================================
// src/app/api/employees/birthdays/route.ts
// =============================================================================
// PURPOSE
// -----------------------------------------------------------------------------
// GET — lightweight, privacy-conscious employee birthday list, used to power
// company-wide "birthday event" surfaces. This is intentionally a NEW,
// separate endpoint — it does not modify or replace GET /api/employees.
// That endpoint (a) omits dateOfBirth from EmployeeListItem entirely and
// (b) restricts non-HR/non-manager requesters to seeing only their own
// record, which makes it unsuitable for a shared company calendar.
//
// INTENDED CONSUMERS
// -----------------------------------------------------------------------------
//   - Holiday Calendar page  — merge birthdays into the existing month/
//     upcoming views alongside holidays
//   - Dashboard              — "upcoming birthdays" widget
//   - Birthday Widget        — standalone countdown/celebration widget
//   - Notifications          — future trigger source for "today is X's
//     birthday" notifications (?upcoming=true with a small limit)
// None of these consumers require the requester to be HR — birthdays are
// shared, celebratory, company-wide information by nature.
//
// PRIVACY CONSIDERATIONS
// -----------------------------------------------------------------------------
// Because any authenticated user (any role) may call this endpoint, the
// response is deliberately minimal:
//   - Returns birthMonth/birthDay only — NOT the full dateOfBirth, so the
//     birth YEAR (and therefore age) is never exposed company-wide. Age is
//     more sensitive than "which day is their birthday" and no identified
//     consumer above needs it. HR/Admin/self/manager who need full DOB
//     (e.g. for legal/compliance records) already have it via the existing,
//     role-restricted GET /api/employees/[id] — unchanged by this endpoint.
//   - Returns only firstNameTH, lastNameTH, nickname, departmentName in
//     addition — never role, salary, PIN, phone, address, or any other
//     field considered sensitive elsewhere in this project.
//
// QUERY PARAMS (all optional — designed for reuse without another API
// redesign, per the consumers listed above):
//   ?requesterId=   required — same inline auth convention as every other
//                    route in this project (must be an existing user doc)
//   ?month=1-12      filter to a single birth month; sorted by day-of-month
//   ?upcoming=true   sort by soonest upcoming birthday (wraps year-end);
//                    combine with `limit` for a "next N birthdays" widget
//   ?limit=N         cap the number of results (applied after filter/sort)
//
// With no params, returns every active employee who has a dateOfBirth set,
// sorted by month then day (a full-year calendar view).
//
// Follows the exact same convention as /api/holidays and /api/employees:
// inline auth check, {success:true,data}/{success:false,error} shape.
//
// FETCH STRATEGY — .limit(500)
// -----------------------------------------------------------------------------
// Fetches all users in one unfiltered read, then filters/sorts in JS. This is
// the same pattern used by every list route in this project (/api/holidays,
// /api/employees, /api/attendance/team, etc.) specifically to avoid Firestore
// composite index requirements when combining an equality filter
// (employmentStatus) with other conditions via the REST wrapper.
// 500 is not an arbitrary magic number here — it matches headcount headroom
// already assumed project-wide (current headcount: 28) and is the same
// ceiling every other list endpoint uses, so behavior stays consistent if
// headcount grows. It is not, however, a permanent solution.
// TODO: if headcount approaches ~500, replace the flat .limit(500) fetch
// here (and in every sibling list route) with real Firestore pagination
// (cursor-based, via startAfter). This is a project-wide fetch-strategy
// change, not something to solve in isolation for this one endpoint.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

export interface EmployeeBirthdayEntry {
  id: string;
  firstNameTH: string;
  lastNameTH: string;
  nickname?: string;
  departmentName: string;
  // Intentionally month/day only — no birth year, so age is never derivable
  // from this company-wide, any-role-readable endpoint. See PRIVACY
  // CONSIDERATIONS above. Full dateOfBirth remains available to authorized
  // roles via the existing GET /api/employees/[id].
  birthMonth: number; // 1-12
  birthDay: number; // 1-31
  /** Days from today until the next occurrence of this birthday (0 = today). */
  daysUntilNextBirthday: number;
}

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Days until the next occurrence of month/day from today, wrapping into next year. */
function computeDaysUntilNext(
  month: number,
  day: number,
  todayStr: string
): number {
  const today = new Date(todayStr + 'T00:00:00');
  const todayMidnight = new Date(todayStr + 'T00:00:00').setHours(0, 0, 0, 0);
  const thisYear = today.getFullYear();

  let next = new Date(thisYear, month - 1, day);
  const nextTime = next.getTime();
  const isInPast = nextTime < todayMidnight;
  if (isInPast) {
    next = new Date(thisYear + 1, month - 1, day);
  }

  const diff = Math.round(
    (next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  return diff;
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

    const monthParam = searchParams.get('month');
    const month = monthParam ? parseInt(monthParam, 10) : null;
    if (
      month !== null &&
      (!Number.isInteger(month) || month < 1 || month > 12)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_MONTH',
            message: 'month ต้องเป็นตัวเลข 1-12',
          },
        },
        { status: 400 }
      );
    }

    const upcoming = searchParams.get('upcoming') === 'true';

    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : null;
    if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INVALID_LIMIT', message: 'limit ต้องเป็นตัวเลขบวก' },
        },
        { status: 400 }
      );
    }

    const todayStr = toDateString(new Date());

    // ดึงทั้งหมดแล้ว filter/sort ฝั่ง JS — เหมือน pattern ของ /api/employees และ
    // /api/holidays (เหตุผลเรื่อง 500 + TODO pagination ดูที่คอมเมนต์ด้านบนไฟล์)
    const snap = await adminDb.collection('users').limit(500).get();

    let entries: EmployeeBirthdayEntry[] = snap.docs
      .map((doc: { id: string; data: () => Record<string, any> }) => {
        const data = doc.data();
        return { id: doc.id, ...data };
      })
      .filter(
        (d: Record<string, any>) =>
          (d.employmentStatus ?? 'active') === 'active' &&
          typeof d.dateOfBirth === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(d.dateOfBirth)
      )
      .map((d: Record<string, any>) => {
        const [, mm, dd] = d.dateOfBirth.split('-').map(Number);
        return {
          id: d.id,
          firstNameTH: d.firstNameTH ?? '',
          lastNameTH: d.lastNameTH ?? '',
          nickname: d.nickname ?? undefined,
          departmentName: d.departmentName ?? '',
          birthMonth: mm,
          birthDay: dd,
          daysUntilNextBirthday: computeDaysUntilNext(mm, dd, todayStr),
        };
      });

    if (month !== null) {
      entries = entries.filter((e) => e.birthMonth === month);
    }

    if (upcoming) {
      entries.sort((a, b) => a.daysUntilNextBirthday - b.daysUntilNextBirthday);
    } else {
      entries.sort((a, b) =>
        a.birthMonth !== b.birthMonth
          ? a.birthMonth - b.birthMonth
          : a.birthDay - b.birthDay
      );
    }

    if (limit !== null) {
      entries = entries.slice(0, limit);
    }

    return NextResponse.json({ success: true, data: entries });
  } catch (error: any) {
    console.error('GET /api/employees/birthdays error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message },
      },
      { status: 500 }
    );
  }
}
