// app/api/dashboard/hr-today/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

function getTodayDateString(): string {
  const now = new Date();
  const bkk = new Date(
    now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })
  );
  const y = bkk.getFullYear();
  const m = String(bkk.getMonth() + 1).padStart(2, '0');
  const d = String(bkk.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const requesterId = searchParams.get('requesterId');

    if (!requesterId) {
      return NextResponse.json(
        { message: 'requesterId is required' },
        { status: 400 }
      );
    }

    // ตรวจสอบสิทธิ์
    const requesterDoc = await adminDb
      .collection('users')
      .doc(requesterId)
      .get();

    if (!requesterDoc.exists) {
      return NextResponse.json({ message: 'ไม่พบผู้ใช้' }, { status: 404 });
    }

    const requesterData = requesterDoc.data()!;
    const allowedRoles = ['admin', 'hr_manager', 'manager'];
    if (!allowedRoles.includes(requesterData.role)) {
      return NextResponse.json(
        { message: 'ไม่มีสิทธิ์เข้าถึงข้อมูลนี้' },
        { status: 403 }
      );
    }

    const today = getTodayDateString();

    // ดึง active employees ทั้งหมด (ยกเว้น white_collar — ไม่ต้อง clock-in)
    const usersSnap = await adminDb
      .collection('users')
      .where('employmentStatus', '==', 'active')
      .where('employeeType', '==', 'blue_collar')
      .get();

    if (usersSnap.empty) {
      return NextResponse.json({
        success: true,
        date: today,
        summary: {
          total: 0,
          checkedIn: 0,
          notCheckedIn: 0,
          late: 0,
          onLeave: 0,
          absent: 0,
        },
        employees: [],
      });
    }

    const userIds = usersSnap.docs.map((d) => d.id);

    // ดึง attendance วันนี้ทั้งหมด (Firestore ใช้ docId: {userId}_{date})
    const attendanceDocs = await Promise.all(
      userIds.map((uid) =>
        adminDb.collection('attendance').doc(`${uid}_${today}`).get()
      )
    );

    // ดึง leave requests วันนี้
    const leaveSnap = await adminDb
      .collection('leaveRequests')
      .where('startDate', '<=', today)
      .where('endDate', '>=', today)
      .where('status', 'in', ['hr_approved', 'manager_approved'])
      .get();

    const leaveUserIds = new Set(
      leaveSnap.docs.map((d) => d.data().userId as string)
    );

    // Build employee list
    const employees = usersSnap.docs.map((userDoc, idx) => {
      const userData = userDoc.data();
      const attDoc = attendanceDocs[idx];
      const attData = attDoc.exists ? attDoc.data()! : null;
      const isOnLeave = leaveUserIds.has(userDoc.id);

      let status: 'present' | 'late' | 'absent' | 'leave' | 'not_checked_in';

      if (isOnLeave) {
        status = 'leave';
      } else if (!attData || !attData.clockInTime) {
        status = 'not_checked_in';
      } else if (attData.status === 'late') {
        status = 'late';
      } else {
        status = 'present';
      }

      return {
        id: userDoc.id,
        employeeId: userData.employeeId,
        firstName: userData.firstNameEN,
        lastName: userData.lastNameEN,
        firstNameTH: userData.firstNameTH,
        lastNameTH: userData.lastNameTH,
        department: userData.departmentName,
        positionName: userData.positionName,
        shiftId: userData.shiftId,
        status,
        clockInTime: attData?.clockInTime ?? null,
        clockOutTime: attData?.clockOutTime ?? null,
        lateMinutes: attData?.lateMinutes ?? 0,
      };
    });

    // คำนวณ summary
    const summary = {
      total: employees.length,
      checkedIn: employees.filter((e) => ['present', 'late'].includes(e.status))
        .length,
      notCheckedIn: employees.filter((e) => e.status === 'not_checked_in')
        .length,
      late: employees.filter((e) => e.status === 'late').length,
      onLeave: employees.filter((e) => e.status === 'leave').length,
      absent: employees.filter((e) => e.status === 'not_checked_in').length,
    };

    return NextResponse.json({
      success: true,
      date: today,
      summary,
      employees,
    });
  } catch (error: any) {
    console.error('HR Today dashboard error:', error);
    return NextResponse.json(
      { message: 'เกิดข้อผิดพลาด', error: error.message },
      { status: 500 }
    );
  }
}
