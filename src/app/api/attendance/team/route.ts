import { NextRequest, NextResponse } from 'next/server';
import { getTeamAttendance } from '@/lib/attendance/firestoreHelpers';
import { isAttendanceError } from '@/lib/attendance/errors';
import {
  getStatusLabel,
  getStatusColor,
  sortByStatusPriority,
} from '@/lib/attendance/statusHelpers';
import { toDateString } from '@/lib/attendance/dateUtils';
import { adminDb } from '@/lib/firebase/admin';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const departmentId = searchParams.get('departmentId');
    const date = searchParams.get('date') ?? toDateString(new Date());

    if (!departmentId) {
      return NextResponse.json(
        { message: 'กรุณาระบุ departmentId' },
        { status: 400 }
      );
    }

    const usersSnap = await adminDb
      .collection('users')
      .where('departmentId', '==', departmentId)
      .where('employmentStatus', '==', 'active')
      .where('employeeType', '==', 'blue_collar')
      .get();

    if (usersSnap.empty) {
      return NextResponse.json({
        success: true,
        data: {
          date,
          departmentId,
          totalEmployees: 0,
          present: 0,
          absent: 0,
          late: 0,
          onLeave: 0,
          records: [],
        },
      });
    }

    const userIds = usersSnap.docs.map((d) => d.id);
    const summary = await getTeamAttendance(userIds, date);
    summary.departmentId = departmentId;

    const usersMap: Record<string, any> = {};
    usersSnap.docs.forEach((d) => {
      usersMap[d.id] = d.data();
    });

    const enrichedRecords = (
      sortByStatusPriority(summary.records) as typeof summary.records
    ).map((r: { userId: string; status: string; [key: string]: any }) => ({
      ...r,
      statusLabel: getStatusLabel(r.status as any, 'th'),
      statusColor: getStatusColor(r.status as any),
      employee: usersMap[r.userId]
        ? {
            employeeId: usersMap[r.userId].employeeId,
            firstName: usersMap[r.userId].firstName,
            lastName: usersMap[r.userId].lastName,
            nickname: usersMap[r.userId].nickname,
          }
        : null,
    }));

    const presentUserIds = new Set(
      summary.records.map(
        (r: { userId: string; [key: string]: any }) => r.userId
      )
    );
    const absentEmployees = usersSnap.docs
      .filter((d) => !presentUserIds.has(d.id))
      .map((d) => ({
        userId: d.id,
        status: 'absent',
        statusLabel: 'ขาดงาน',
        statusColor: getStatusColor('absent' as any),
        employee: {
          employeeId: d.data().employeeId,
          firstName: d.data().firstName,
          lastName: d.data().lastName,
          nickname: d.data().nickname,
        },
      }));

    return NextResponse.json({
      success: true,
      data: {
        date,
        departmentId,
        totalEmployees: summary.totalEmployees,
        present: summary.present,
        absent: summary.absent,
        late: summary.late,
        onLeave: summary.onLeave,
        records: [...enrichedRecords, ...absentEmployees],
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
