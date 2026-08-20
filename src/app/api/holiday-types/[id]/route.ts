// =============================================================================
// src/app/api/holiday-types/[id]/route.ts
// =============================================================================
// PATCH  — update name and/or isActive. HR/Admin only.
// DELETE — soft-delete only (isActive: false). No hard delete, no
//          ?permanent=true option — unlike /api/holidays/[id], this
//          endpoint never removes the document. Deactivating a type that
//          existing holidays still reference is explicitly allowed (those
//          holidays keep their `type` string unchanged — no migration).
//
// Follows the exact same convention as /api/departments/[id] (inline auth,
// no shared helper, {success,data}/{success,error} response shape).
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

// ============================================================
// PATCH /api/holiday-types/[id] — แก้ไข Holiday Type (name/isActive)
// ============================================================

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await req.json();
    const { requesterId, ...updates } = body;

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

    const typeDoc = await adminDb.collection('holidayTypes').doc(id).get();
    if (!typeDoc.exists) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Holiday type not found' },
        },
        { status: 404 }
      );
    }

    // ── Validate input against schema — only name/isActive are writable ──
    if (updates.name !== undefined && !String(updates.name).trim()) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INVALID_NAME', message: 'name ห้ามเป็นค่าว่าง' },
        },
        { status: 400 }
      );
    }
    if (
      updates.isActive !== undefined &&
      typeof updates.isActive !== 'boolean'
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_IS_ACTIVE',
            message: 'isActive ต้องเป็น boolean',
          },
        },
        { status: 400 }
      );
    }

    const safeUpdates: Record<string, any> = {};
    if (updates.name !== undefined)
      safeUpdates.name = String(updates.name).trim();
    if (updates.isActive !== undefined) safeUpdates.isActive = updates.isActive;
    safeUpdates.updatedAt = new Date().toISOString();

    await adminDb.collection('holidayTypes').doc(id).update(safeUpdates);

    return NextResponse.json({
      success: true,
      data: { id, ...typeDoc.data(), ...safeUpdates },
    });
  } catch (error: any) {
    console.error('PATCH /api/holiday-types/[id] error:', error);
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
// DELETE /api/holiday-types/[id] — Soft Delete only (isActive = false)
// No hard delete, no ?permanent=true — deactivating a type that existing
// holidays reference is allowed; those holidays are unaffected.
// ============================================================

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
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

    const typeDoc = await adminDb.collection('holidayTypes').doc(id).get();
    if (!typeDoc.exists) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Holiday type not found' },
        },
        { status: 404 }
      );
    }

    await adminDb.collection('holidayTypes').doc(id).update({
      isActive: false,
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      data: { id, isActive: false },
    });
  } catch (error: any) {
    console.error('DELETE /api/holiday-types/[id] error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message },
      },
      { status: 500 }
    );
  }
}
