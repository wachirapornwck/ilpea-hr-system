import { NextRequest, NextResponse } from 'next/server';
import { getTodayAttendance } from '@/lib/attendance/firestoreHelpers';
import { isAttendanceError } from '@/lib/attendance/errors';
import { toDateString, toTimeString } from '@/lib/attendance/dateUtils';
import { getStatusLabel, getStatusColor } from '@/lib/attendance/statusHelpers';
import { adminDb } from '@/lib/firebase/admin';
import { EMPLOYEE_TYPES } from '@/lib/attendance/constants';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

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
    const isWhiteCollar = userData.employeeType === EMPLOYEE_TYPES.WHITE_COLLAR;

    if (isWhiteCollar) {
      return NextResponse.json({
        success: true,
        isWhiteCollar: true,
        message: 'พนักงาน Office ไม่ต้องสแกนเวลา',
        data: null,
      });
    }

    const today = toDateString(new Date());
    const record = await getTodayAttendance(userId, today);

    const holidaySnap = await adminDb
      .collection('holidays')
      .where('date', '==', today)
      .limit(1)
      .get();
    const holiday = holidaySnap.empty
      ? null
      : ({
          ...holidaySnap.docs[0].data(),
          id: holidaySnap.docs[0].id,
        } as Record<string, any>);

    if (!record) {
      return NextResponse.json({
        success: true,
        data: null,
        today,
        holiday,
        canClockIn: !holiday || (holiday as any).type === 'company',
        message: 'ยังไม่ได้สแกนเข้างานวันนี้',
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: record.id,
        date: record.date,
        shiftId: record.shiftId,
        clockInTime: record.clockInTime,
        clockOutTime: record.clockOutTime,
        clockInFormatted: record.clockInTime
          ? toTimeString(record.clockInTime as Date)
          : null,
        clockOutFormatted: record.clockOutTime
          ? toTimeString(record.clockOutTime as Date)
          : null,
        status: record.status,
        statusLabel: getStatusLabel(record.status, 'th'),
        statusColor: getStatusColor(record.status),
        lateMinutes: record.lateMinutes,
        earlyLeaveMinutes: record.earlyLeaveMinutes,
        workingHours: record.workingHours,
        overtimeMinutes: record.overtimeMinutes,
        shiftAllowance: record.shiftAllowance,
        otMealAllowance: record.otMealAllowance,
        hasClockedIn: !!record.clockInTime,
        hasClockedOut: !!record.clockOutTime,
        effectiveShift: {
          source: record.effectiveShift?.source,
          startTotalMinutes: record.effectiveShift?.startTotalMinutes,
          endTotalMinutes: record.effectiveShift?.endTotalMinutes,
        },
      },
      today,
      holiday,
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
