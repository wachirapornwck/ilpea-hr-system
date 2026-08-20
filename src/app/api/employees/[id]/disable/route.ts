// app/api/employees/[id]/disable/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

const ALLOWED_HR_ROLES = ['admin', 'hr_manager'];

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const { requesterId, reason } = body as {
      requesterId: string;
      reason?: string;
    };
    const targetId = params.id;

    if (!requesterId) {
      return NextResponse.json(
        { message: 'requesterId is required' },
        { status: 400 }
      );
    }

    // Permission — HR/Admin only
    const requesterDoc = await adminDb
      .collection('users')
      .doc(requesterId)
      .get();
    if (!requesterDoc.exists) {
      return NextResponse.json({ message: 'ไม่พบผู้ใช้' }, { status: 404 });
    }
    const requesterData = requesterDoc.data()!;
    if (!ALLOWED_HR_ROLES.includes(requesterData.role)) {
      return NextResponse.json(
        { message: 'ไม่มีสิทธิ์ระงับบัญชีพนักงาน' },
        { status: 403 }
      );
    }

    // ห้าม disable ตัวเอง
    if (requesterId === targetId) {
      return NextResponse.json(
        { message: 'ไม่สามารถระงับบัญชีของตัวเองได้' },
        { status: 400 }
      );
    }

    // Target must exist
    const targetDoc = await adminDb.collection('users').doc(targetId).get();
    if (!targetDoc.exists) {
      return NextResponse.json({ message: 'ไม่พบพนักงาน' }, { status: 404 });
    }

    const targetData = targetDoc.data()!;

    // ห้าม disable admin คนอื่น (ถ้า requester ไม่ใช่ admin)
    if (targetData.role === 'admin' && requesterData.role !== 'admin') {
      return NextResponse.json(
        { message: 'ไม่มีสิทธิ์ระงับบัญชี Admin' },
        { status: 403 }
      );
    }

    if (targetData.employmentStatus === 'inactive') {
      return NextResponse.json(
        { message: 'บัญชีนี้ถูกระงับแล้ว' },
        { status: 400 }
      );
    }

    // Soft delete
    await adminDb
      .collection('users')
      .doc(targetId)
      .update({
        employmentStatus: 'inactive',
        disabledAt: new Date(),
        disabledBy: requesterId,
        disabledReason: reason ?? null,
        updatedAt: new Date(),
      });

    return NextResponse.json({
      success: true,
      message: `ระงับบัญชี ${targetData.employeeId} สำเร็จ`,
    });
  } catch (error: any) {
    console.error('PATCH /api/employees/[id]/disable error:', error);
    return NextResponse.json(
      { message: 'เกิดข้อผิดพลาด', error: error.message },
      { status: 500 }
    );
  }
}
