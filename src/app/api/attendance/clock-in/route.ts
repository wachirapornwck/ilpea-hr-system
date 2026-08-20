// =============================================================================
// app/api/attendance/clock-in/route.ts
// POST /api/attendance/clock-in
// Body: { userId, shiftId, latitude?, longitude?, accuracy? }
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { clockIn } from '@/lib/attendance/firestoreHelpers';
import { isAttendanceError } from '@/lib/attendance/errors';
import { EMPLOYEE_TYPES, SHIFTS } from '@/lib/attendance/constants';
import { adminDb } from '@/lib/firebase/admin';
import { toDateString } from '@/lib/attendance/dateUtils';
import {
  checkClockInLocation,
  buildNoLocationResult,
} from '@/lib/attendance/Geoutils';
import type { ShiftId } from '@/lib/attendance/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, shiftId, latitude, longitude, accuracy } = body;

    if (!userId || !shiftId) {
      return NextResponse.json(
        { message: 'กรุณาระบุ userId และ shiftId' },
        { status: 400 }
      );
    }

    if (!SHIFTS[shiftId as ShiftId]) {
      return NextResponse.json(
        { message: `shiftId ไม่ถูกต้อง: ${shiftId}` },
        { status: 400 }
      );
    }

    // ตรวจสอบพนักงาน
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
        { message: 'พนักงาน Office ไม่ต้องสแกนเข้างาน' },
        { status: 400 }
      );
    }

    // ตรวจสอบวันหยุด
    const today = toDateString(new Date());
    const holidaySnap = await adminDb
      .collection('holidays')
      .where('date', '==', today)
      .limit(1)
      .get();
    const isHoliday = !holidaySnap.empty;

    // GPS Check (optional — ไม่ block ถ้าไม่มี GPS)
    let locationResult = null;
    if (latitude != null && longitude != null && accuracy != null) {
      // ดึง factory location จาก companySettings
      // (เดิมอ่านผิด doc id 'default' และผิด field path — seed เขียนไว้ที่
      // doc('main') โดยพิกัดอยู่ใน factoryLocation.latitude/longitude ทำให้
      // ค่าไม่เคยถูกอ่านสำเร็จเลย แล้ว fallback ไปใช้พิกัดกรุงเทพฯ เริ่มต้น
      // ตลอด ทำให้ทุกคนที่เช็คอินในโรงงานจริงถูกตีว่าอยู่ไกลเกิน 300m เสมอ)
      const settingsSnap = await adminDb
        .collection('companySettings')
        .doc('main')
        .get();
      const settings = settingsSnap.exists ? settingsSnap.data() : null;
      const factoryLat = settings?.factoryLocation?.latitude ?? 13.7563; // Bangkok default (fallback only)
      const factoryLng = settings?.factoryLocation?.longitude ?? 100.5018;

      locationResult = checkClockInLocation(
        { latitude, longitude, accuracy },
        { latitude: factoryLat, longitude: factoryLng },
        {
          approveRadius: settings?.clockInApproveRadius,
          flagRadius: settings?.clockInFlagRadius,
          rejectRadius: settings?.clockInRejectRadius,
        }
      );

      if (locationResult.decision === 'REJECTED') {
        return NextResponse.json(
          {
            message: locationResult.decisionLabel,
            locationResult,
          },
          { status: 400 }
        );
      }
    } else {
      // ไม่มี GPS → FLAGGED แต่ยังให้เข้าได้
      locationResult = buildNoLocationResult();
    }

    const record = await clockIn(
      {
        userId,
        shiftId: shiftId as ShiftId,
        clockInTime: new Date(),
      },
      userData.departmentId ?? '',
      isHoliday
    );

    return NextResponse.json({
      success: true,
      message: 'บันทึกเวลาเข้างานสำเร็จ',
      data: {
        id: record.id,
        date: record.date,
        shiftId: record.shiftId,
        clockInTime: record.clockInTime,
        status: record.status,
        lateMinutes: record.lateMinutes,
        isHoliday,
        locationResult,
      },
    });
  } catch (error: unknown) {
    if (isAttendanceError(error)) {
      return NextResponse.json(error.toJSON(), { status: error.statusCode });
    }
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { message: 'เกิดข้อผิดพลาด กรุณาลองใหม่', error: msg },
      { status: 500 }
    );
  }
}
