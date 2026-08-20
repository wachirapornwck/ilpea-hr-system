import { NextRequest, NextResponse } from 'next/server';
import { clockOut } from '@/lib/attendance/firestoreHelpers';
import { isAttendanceError } from '@/lib/attendance/errors';
import { EMPLOYEE_TYPES } from '@/lib/attendance/constants';
import { adminDb } from '@/lib/firebase/admin';
import { toDateString } from '@/lib/attendance/dateUtils';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, departmentId } = body;

    if (!userId) {
      return NextResponse.json(
        { message: 'กรุณาระบุ userId' },
        { status: 400 }
      );
    }

    const userSnap = await adminDb.collection('users').doc(userId).get();
    if (!userSnap.exists) {
      return NextResponse.json(
        { message: 'ไม่พบข้อมูลพนักงาน' },
        { status: 404 }
      );
    }
    const userData = userSnap.data()!;
    if (userData.employeeType === EMPLOYEE_TYPES.WHITE_COLLAR) {
      return NextResponse.json(
        { message: 'พนักงาน Office ไม่ต้องสแกนออกงาน' },
        { status: 400 }
      );
    }

    const today = toDateString(new Date());
    const holidaySnap = await adminDb
      .collection('holidays')
      .where('date', '==', today)
      .limit(1)
      .get();
    const isHoliday = !holidaySnap.empty;

    const record = await clockOut(
      { userId, clockOutTime: new Date() },
      departmentId ?? userData.departmentId ?? '',
      isHoliday
    );

    return NextResponse.json({
      success: true,
      message: 'บันทึกเวลาออกงานสำเร็จ',
      data: {
        id: record.id,
        date: record.date,
        shiftId: record.shiftId,
        clockInTime: record.clockInTime,
        clockOutTime: record.clockOutTime,
        status: record.status,
        workingHours: record.workingHours,
        overtimeMinutes: record.overtimeMinutes,
        lateMinutes: record.lateMinutes,
        earlyLeaveMinutes: record.earlyLeaveMinutes,
        shiftAllowance: record.shiftAllowance,
        otMealAllowance: record.otMealAllowance,
        isHoliday,
      },
    });
  } catch (error: any) {
    if (isAttendanceError(error)) {
      return NextResponse.json(error.toJSON(), { status: error.statusCode });
    }
    return NextResponse.json(
      { message: 'เกิดข้อผิดพลาด กรุณาลองใหม่', error: error.message },
      { status: 500 }
    );
  }
}
