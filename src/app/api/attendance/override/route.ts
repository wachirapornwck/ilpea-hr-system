import { NextRequest, NextResponse } from 'next/server';
import {
  createShiftOverride,
  resolveShiftOverride,
} from '@/lib/attendance/firestoreHelpers';
import { validateShiftOverride } from '@/lib/attendance/validators';
import { isAttendanceError } from '@/lib/attendance/errors';
import { adminDb } from '@/lib/firebase/admin';
import { OVERRIDE_SCOPE } from '@/lib/attendance/constants';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');
    const userId = searchParams.get('userId');
    const deptId = searchParams.get('departmentId');

    if (!date) {
      return NextResponse.json({ message: 'กรุณาระบุ date' }, { status: 400 });
    }

    if (userId && deptId) {
      const override = await resolveShiftOverride(userId, deptId, date);
      return NextResponse.json({ success: true, data: override });
    }

    const snap = await adminDb
      .collection('shiftOverrides')
      .where('date', '==', date)
      .get();
    const overrides = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({
      success: true,
      data: overrides,
      total: overrides.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      { message: 'เกิดข้อผิดพลาด', error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      scope,
      scopeId,
      date,
      startTime,
      endTime,
      isOvernight,
      reason,
      createdBy,
    } = body;

    const missing = [
      'scope',
      'scopeId',
      'date',
      'startTime',
      'endTime',
      'reason',
      'createdBy',
    ].filter((f) => !body[f]);
    if (missing.length > 0) {
      return NextResponse.json(
        { message: `กรุณาระบุ: ${missing.join(', ')}` },
        { status: 400 }
      );
    }

    if (!Object.values(OVERRIDE_SCOPE).includes(scope)) {
      return NextResponse.json(
        { message: `scope ไม่ถูกต้อง` },
        { status: 400 }
      );
    }

    const creatorSnap = await adminDb.collection('users').doc(createdBy).get();
    if (!creatorSnap.exists) {
      return NextResponse.json(
        { message: 'ไม่พบข้อมูลผู้สร้าง' },
        { status: 404 }
      );
    }
    if (!['hr', 'hr_manager', 'admin'].includes(creatorSnap.data()!.role)) {
      return NextResponse.json(
        { message: 'ไม่มีสิทธิ์สร้าง Shift Override' },
        { status: 403 }
      );
    }

    const validation = validateShiftOverride(startTime, endTime, date);
    if (!validation.valid) {
      return NextResponse.json(
        { message: validation.errors.map((e) => e.message).join(', ') },
        { status: 400 }
      );
    }

    const override = await createShiftOverride({
      scope,
      scopeId,
      date,
      startTime,
      endTime,
      isOvernight: isOvernight ?? false,
      reason,
      createdBy,
    });

    return NextResponse.json({
      success: true,
      message: 'สร้าง Shift Override สำเร็จ',
      data: override,
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
