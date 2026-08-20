// =============================================================================
// src/app/api/employees/directory/route.ts
// =============================================================================
// GET /api/employees/directory?requesterId=&search=
//
// PURPOSE
// -----------------------------------------------------------------------------
// Lightweight, privacy-conscious employee lookup for picking specific people
// as Company Event attendees (like inviting someone to a meeting). This is
// intentionally a NEW, separate endpoint — GET /api/employees restricts
// non-HR/non-manager requesters to seeing only their own record, which makes
// it unsuitable for an attendee picker any employee should be able to use.
//
// PRIVACY CONSIDERATIONS
// -----------------------------------------------------------------------------
// Any authenticated user (any role) may call this endpoint, so the response
// is deliberately minimal: id, display name, nickname, department name only.
// Never returns role, salary, PIN, phone, address, employeeType, shiftId, or
// any other field considered sensitive elsewhere in this project. Full
// employee records remain available only via the existing, role-restricted
// GET /api/employees and GET /api/employees/[id] — unchanged by this file.
//
// Follows the exact same convention as /api/employees/birthdays: inline auth
// check (any existing user), {success,data}/{success,error} response shape,
// .limit(500) fetch-then-filter-in-JS.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const requesterId = searchParams.get('requesterId') || '';
    const search = (searchParams.get('search') || '').trim().toLowerCase();

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

    const snap = await adminDb.collection('users').limit(500).get();

    let items = snap.docs
      .map((doc: { id: string; data: () => Record<string, any> }) => ({
        id: doc.id,
        ...doc.data(),
      }))
      .filter(
        (d: Record<string, any>) =>
          (d.employmentStatus ?? 'active') === 'active'
      )
      .map((d: Record<string, any>) => ({
        id: d.id,
        name: `${d.firstNameTH ?? ''} ${d.lastNameTH ?? ''}`.trim(),
        nickname: d.nickname ?? undefined,
        departmentName: d.departmentName ?? '',
      }));

    if (search) {
      items = items.filter(
        (e: { id: string; name: string; nickname?: string }) =>
          e.name.toLowerCase().includes(search) ||
          (e.nickname ?? '').toLowerCase().includes(search) ||
          e.id.toLowerCase().includes(search)
      );
    }

    items.sort((a: { name: string }, b: { name: string }) =>
      a.name.localeCompare(b.name, 'th')
    );

    // Cap results even after search — this is a picker, not a full export.
    items = items.slice(0, 20);

    return NextResponse.json({ success: true, data: items });
  } catch (error: any) {
    console.error('GET /api/employees/directory error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message },
      },
      { status: 500 }
    );
  }
}
