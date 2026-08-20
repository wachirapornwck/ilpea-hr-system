import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

// ============================================================
// PATCH /api/departments/[id] — แก้ไข Department
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

    const deptDoc = await adminDb.collection('departments').doc(id).get();
    if (!deptDoc.exists) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Department not found' },
        },
        { status: 404 }
      );
    }

    delete updates.createdAt;
    updates.updatedAt = new Date().toISOString();

    await adminDb.collection('departments').doc(id).update(updates);

    return NextResponse.json({
      success: true,
      data: { id, ...deptDoc.data(), ...updates },
    });
  } catch (error: any) {
    console.error('PATCH /api/departments/[id] error:', error);
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
// DELETE /api/departments/[id] — Soft Delete (active = false)
// เดิมไม่มี endpoint นี้เลย — เพิ่มให้ตรงตาม convention เดียวกับ
// /api/positions/[id] และ /api/production-lines/[id] (ไม่ลบจริง
// เพราะ positions/employees อ้างอิง departmentId อยู่)
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

    const deptDoc = await adminDb.collection('departments').doc(id).get();
    if (!deptDoc.exists) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Department not found' },
        },
        { status: 404 }
      );
    }

    await adminDb.collection('departments').doc(id).update({
      active: false,
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      data: { id, active: false },
    });
  } catch (error: any) {
    console.error('DELETE /api/departments/[id] error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message },
      },
      { status: 500 }
    );
  }
}
