import { NextRequest, NextResponse } from 'next/server';
import { adjustAttendance } from '@/lib/attendance/firestoreHelpers';
import { isAttendanceError } from '@/lib/attendance/errors';
import { adminDb } from '@/lib/firebase/admin';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      userId,
      date,
      shiftId,
      clockInTime,
      clockOutTime,
      reason,
      comment,
      modifiedBy,
    } = body;

    const missing = [
      'userId',
      'date',
      'shiftId',
      'clockInTime',
      'clockOutTime',
      'reason',
      'comment',
      'modifiedBy',
    ].filter((f) => !body[f]);
    if (missing.length > 0) {
      return NextResponse.json(
        { message: `กรุณาระบุ: ${missing.join(', ')}` },
        { status: 400 }
      );
    }

    const modifierSnap = await adminDb
      .collection('users')
      .doc(modifiedBy)
      .get();
    if (!modifierSnap.exists) {
      return NextResponse.json(
        { message: 'ไม่พบข้อมูลผู้แก้ไข' },
        { status: 404 }
      );
    }
    const modifierData = modifierSnap.data()!;
    if (!['hr_manager', 'admin'].includes(modifierData.role)) {
      return NextResponse.json(
        { message: 'ไม่มีสิทธิ์แก้ไขข้อมูลการเข้างาน' },
        { status: 403 }
      );
    }

    const holidaySnap = await adminDb
      .collection('holidays')
      .where('date', '==', date)
      .limit(1)
      .get();
    const isHoliday = !holidaySnap.empty;

    const { record, adjustment } = await adjustAttendance(
      {
        userId,
        date,
        shiftId,
        clockInTime: new Date(clockInTime),
        clockOutTime: new Date(clockOutTime),
        reason,
        comment,
        modifiedBy,
      },
      isHoliday
    );

    return NextResponse.json({
      success: true,
      message: 'แก้ไขข้อมูลการเข้างานสำเร็จ',
      data: {
        record: {
          id: record.id,
          status: record.status,
          workingHours: record.workingHours,
        },
        adjustment: { id: adjustment.id, adjustedAt: adjustment.adjustedAt },
      },
    });
  } catch (error: any) {
    if (isAttendanceError(error)) {
      return NextResponse.json(error.toJSON(), { status: error.statusCode });
    }
    return NextResponse.json(
      { message: 'เกิดข้อผิดพลาด', error: error.message },
      { status: 500 }
    );
  }
}
