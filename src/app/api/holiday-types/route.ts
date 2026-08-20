// =============================================================================
// src/app/api/holiday-types/route.ts
// =============================================================================
// GET  — list all holiday types (both active and inactive). The UI is
//        responsible for splitting usage by context:
//          - Add/Edit dropdown: active only
//          - Manage modal: all (active + inactive, so HR can reactivate)
//          - Legacy fallback: current holiday.type value, shown even if it
//            doesn't match any entry here
// POST — create a new holiday type. HR/Admin only.
//
// Follows the exact same convention as /api/departments (inline auth, no
// shared helper, .limit(500) fetch-then-sort-in-JS, {success,data}/
// {success,error} response shape).
//
// Firestore collection: holidayTypes (new — does not touch `holidays` or
// any other existing collection; holidays.type stays a plain string,
// unmigrated, per the approved "Soft Reference" architecture decision).
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const requesterId = searchParams.get('requesterId');

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

    // Returns both active and inactive — UI decides what to show where.
    const snapshot = await adminDb.collection('holidayTypes').limit(500).get();
    const holidayTypes = snapshot.docs.map(
      (doc: { id: string; data: () => Record<string, any> }) => ({
        id: doc.id,
        ...doc.data(),
      })
    );

    // เรียงตามชื่อ in-memory (ไม่ใช้ orderBy เพื่อหลีกเลี่ยง composite index)
    holidayTypes.sort((a: any, b: any) =>
      (a.name ?? '').localeCompare(b.name ?? '', 'th')
    );

    return NextResponse.json({ success: true, data: holidayTypes });
  } catch (error: any) {
    console.error('GET /api/holiday-types error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message },
      },
      { status: 500 }
    );
  }
}

// ============================================================
// POST /api/holiday-types — สร้าง Holiday Type ใหม่ (HR/Admin เท่านั้น)
// ============================================================

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { requesterId, name } = body;

    if (!requesterId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'MISSING_REQUESTER', message: 'Missing requesterId' },
        },
        { status: 400 }
      );
    }
    if (!name?.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'MISSING_FIELDS', message: 'name is required' },
        },
        { status: 400 }
      );
    }

    const requesterDoc = await adminDb
      .collection('users')
      .doc(requesterId)
      .get();
    const requester = requesterDoc.data() as any;
    if (
      !requesterDoc.exists ||
      !['admin', 'hr_manager'].includes(requester?.role)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'FORBIDDEN', message: 'HR or Admin only' },
        },
        { status: 403 }
      );
    }

    const now = new Date().toISOString();
    const data = {
      name: name.trim(),
      isActive: true,
      createdBy: requesterId,
      createdAt: now,
      updatedAt: now,
    };

    const ref = await adminDb.collection('holidayTypes').add(data);
    return NextResponse.json(
      { success: true, data: { id: ref.id, ...data } },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('POST /api/holiday-types error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message },
      },
      { status: 500 }
    );
  }
}
