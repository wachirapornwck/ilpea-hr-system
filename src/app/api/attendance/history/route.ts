import { NextRequest, NextResponse } from 'next/server';
import {
  getAttendanceByDateRange,
  getMonthlyAttendance,
} from '@/lib/attendance/firestoreHelpers';
import { isAttendanceError } from '@/lib/attendance/errors';
import { summarizeMonthlyAttendance } from '@/lib/attendance/statusHelpers';
import { countWorkingDaysInMonth } from '@/lib/attendance/calculators';
import { getStatusLabel } from '@/lib/attendance/statusHelpers';
import { adminDb } from '@/lib/firebase/admin';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const year = searchParams.get('year');
    const month = searchParams.get('month');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const withSummary = searchParams.get('summary') === 'true';

    if (!userId) {
      return NextResponse.json(
        { message: 'กรุณาระบุ userId' },
        { status: 400 }
      );
    }

    let records;
    let yearNum: number | undefined;
    let monthNum: number | undefined;

    if (year && month) {
      yearNum = parseInt(year);
      monthNum = parseInt(month);
      if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
        return NextResponse.json(
          { message: 'year หรือ month ไม่ถูกต้อง' },
          { status: 400 }
        );
      }
      records = await getMonthlyAttendance(userId, yearNum, monthNum);
    } else if (startDate && endDate) {
      const result = await getAttendanceByDateRange({
        userId,
        startDate,
        endDate,
      });
      records = result.records;
    } else {
      return NextResponse.json(
        { message: 'กรุณาระบุ year+month หรือ startDate+endDate' },
        { status: 400 }
      );
    }

    const mappedRecords = records.map((r) => ({
      ...r,
      statusLabel: getStatusLabel(r.status, 'th'),
    }));

    let summary = null;
    if (withSummary && yearNum && monthNum) {
      const startStr = `${yearNum}-${String(monthNum).padStart(2, '0')}-01`;
      const lastDay = new Date(yearNum, monthNum, 0).getDate();
      const endStr = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(
        lastDay
      ).padStart(2, '0')}`;
      const hSnap = await adminDb
        .collection('holidays')
        .where('date', '>=', startStr)
        .where('date', '<=', endStr)
        .get();
      const holidays = hSnap.docs.map((d) => d.data().date as string);
      const workingDays = countWorkingDaysInMonth(yearNum, monthNum, holidays);
      summary = summarizeMonthlyAttendance(
        records,
        workingDays,
        userId,
        yearNum,
        monthNum
      );
    }

    return NextResponse.json({
      success: true,
      data: { records: mappedRecords, total: records.length, summary },
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
