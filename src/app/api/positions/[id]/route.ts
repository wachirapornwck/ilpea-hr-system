import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

// ============================================================
// PATCH /api/positions/[id] — แก้ไข Position
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

    // ตรวจสอบสิทธิ์
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

    // ตรวจสอบว่า document มีอยู่
    const posDoc = await adminDb.collection('positions').doc(id).get();
    if (!posDoc.exists) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Position not found' },
        },
        { status: 404 }
      );
    }

    // ห้าม update code และ createdAt
    delete updates.code;
    delete updates.createdAt;
    updates.updatedAt = new Date().toISOString();

    await adminDb.collection('positions').doc(id).update(updates);

    return NextResponse.json({
      success: true,
      data: { id, ...posDoc.data(), ...updates },
    });
  } catch (error: any) {
    console.error('PATCH /api/positions/[id] error:', error);
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
// DELETE /api/positions/[id] — Soft Delete (active = false)
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

    // ตรวจสอบสิทธิ์
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

    const posDoc = await adminDb.collection('positions').doc(id).get();
    if (!posDoc.exists) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Position not found' },
        },
        { status: 404 }
      );
    }

    const permanent = searchParams.get('permanent') === 'true';

    if (permanent) {
      // ลบถาวรจริง — เช็คก่อนว่าไม่มีพนักงานคนไหนผูก positionId นี้อยู่
      const empSnap = await adminDb
        .collection('users')
        .where('positionId', '==', id)
        .limit(1)
        .get();

      if (!empSnap.empty) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'POSITION_IN_USE',
              message:
                'ไม่สามารถลบถาวรได้ เนื่องจากยังมีพนักงานผูกกับตำแหน่งนี้อยู่ กรุณาย้ายพนักงานออกก่อน',
            },
          },
          { status: 409 }
        );
      }

      await adminDb.collection('positions').doc(id).delete();

      return NextResponse.json({ success: true, data: { id, deleted: true } });
    }

    // Soft delete (ค่าเริ่มต้น)
    await adminDb.collection('positions').doc(id).update({
      active: false,
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, data: { id, active: false } });
  } catch (error: any) {
    console.error('DELETE /api/positions/[id] error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message },
      },
      { status: 500 }
    );
  }
}
