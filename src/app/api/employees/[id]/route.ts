// app/api/employees/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import type { UpdateEmployeePayload } from '@/types';

export const dynamic = 'force-dynamic';

const ALLOWED_HR_ROLES = ['admin', 'hr_manager'];

async function getRequester(requesterId: string) {
  const doc = await adminDb.collection('users').doc(requesterId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...(doc.data() as any) };
}

// ─── GET /api/employees/[id] ──────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(req.url);
    const requesterId = searchParams.get('requesterId');
    const targetId = params.id;

    if (!requesterId) {
      return NextResponse.json(
        { message: 'requesterId is required' },
        { status: 400 }
      );
    }

    const requester = await getRequester(requesterId);
    if (!requester) {
      return NextResponse.json({ message: 'ไม่พบผู้ใช้' }, { status: 404 });
    }

    const isHR = ALLOWED_HR_ROLES.includes(requester.role);
    const isSelf = requesterId === targetId;

    // Employees can only view own profile
    if (!isHR && requester.role !== 'manager' && !isSelf) {
      return NextResponse.json(
        { message: 'ไม่มีสิทธิ์เข้าถึงข้อมูลนี้' },
        { status: 403 }
      );
    }

    const userDoc = await adminDb.collection('users').doc(targetId).get();
    if (!userDoc.exists) {
      return NextResponse.json({ message: 'ไม่พบพนักงาน' }, { status: 404 });
    }

    const data = userDoc.data()!;

    // ดึง leave balance และ today attendance พร้อมกัน
    const now = new Date();
    const bkk = new Date(
      now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })
    );
    const today = `${bkk.getFullYear()}-${String(bkk.getMonth() + 1).padStart(
      2,
      '0'
    )}-${String(bkk.getDate()).padStart(2, '0')}`;
    const year = bkk.getFullYear();

    const [leaveSnap, attDoc] = await Promise.all([
      adminDb
        .collection('leaveBalances')
        .where('userId', '==', targetId)
        .where('year', '==', year)
        .limit(1)
        .get(),
      adminDb.collection('attendance').doc(`${targetId}_${today}`).get(),
    ]);

    const leaveBalance = leaveSnap.empty
      ? { sick: 0, vacation: 0, personal: 0, total: 0 }
      : (() => {
          // ปรับให้ตรงกับ field ใหม่ "balances" map เหมือนที่แก้ใน
          // /api/attendance/dashboard/summary — ดู comment ที่นั่นสำหรับเหตุผล
          const d = leaveSnap.docs[0].data();
          const balances = d.balances ?? {};
          const sick = balances.SICK ?? 0;
          const vacation = balances.VACATION ?? 0;
          const personal = balances.BUSINESS_PAID ?? 0;
          return {
            sick,
            vacation,
            personal,
            total: sick + vacation + personal,
          };
        })();

    const attData = attDoc.exists ? attDoc.data() : null;
    const todayAttendance = attData
      ? {
          status: attData.status ?? null,
          clockInTime: attData.clockInTime ?? null,
          clockOutTime: attData.clockOutTime ?? null,
          lateMinutes: attData.lateMinutes ?? 0,
        }
      : null;

    // Strip sensitive fields
    const { pinHash, salary, ...safeData } = data;

    return NextResponse.json({
      success: true,
      data: {
        id: userDoc.id,
        ...safeData,
        leaveBalance,
        todayAttendance,
      },
    });
  } catch (error: any) {
    console.error('GET /api/employees/[id] error:', error);
    return NextResponse.json(
      { message: 'เกิดข้อผิดพลาด', error: error.message },
      { status: 500 }
    );
  }
}

// ─── PATCH /api/employees/[id] ────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const { requesterId, ...updates } = body as {
      requesterId: string;
    } & UpdateEmployeePayload;
    const targetId = params.id;

    if (!requesterId) {
      return NextResponse.json(
        { message: 'requesterId is required' },
        { status: 400 }
      );
    }

    // HR/Admin only
    const requester = await getRequester(requesterId);
    if (!requester || !ALLOWED_HR_ROLES.includes(requester.role)) {
      return NextResponse.json(
        { message: 'ไม่มีสิทธิ์แก้ไขข้อมูลพนักงาน' },
        { status: 403 }
      );
    }

    // ── Schema v2 field validation ──────────────────────────────────────
    const VALID_TITLE_PREFIXES = ['mr', 'mrs', 'miss', 'other'];
    if (
      updates.titlePrefix !== undefined &&
      !VALID_TITLE_PREFIXES.includes(updates.titlePrefix)
    ) {
      return NextResponse.json(
        { message: 'Invalid titlePrefix' },
        { status: 400 }
      );
    }
    if (updates.titlePrefix === 'other' && !updates.titlePrefixOther?.trim()) {
      return NextResponse.json(
        { message: 'titlePrefixOther is required when titlePrefix is other' },
        { status: 400 }
      );
    }
    if (
      updates.terminationDate !== undefined &&
      !/^\d{4}-\d{2}-\d{2}$/.test(updates.terminationDate)
    ) {
      return NextResponse.json(
        { message: 'Invalid terminationDate' },
        { status: 400 }
      );
    }

    // ── Phase A: Editable Name validation (Employee Detail/Edit UX Refactor) ──
    if (updates.firstNameTH !== undefined) {
      updates.firstNameTH = updates.firstNameTH.trim();
      if (!updates.firstNameTH) {
        return NextResponse.json(
          { message: 'firstNameTH ห้ามเป็นค่าว่าง' },
          { status: 400 }
        );
      }
    }
    if (updates.lastNameTH !== undefined) {
      updates.lastNameTH = updates.lastNameTH.trim();
      if (!updates.lastNameTH) {
        return NextResponse.json(
          { message: 'lastNameTH ห้ามเป็นค่าว่าง' },
          { status: 400 }
        );
      }
    }
    if (updates.firstNameEN !== undefined) {
      updates.firstNameEN = updates.firstNameEN.trim();
      if (!updates.firstNameEN) {
        return NextResponse.json(
          { message: 'firstNameEN ห้ามเป็นค่าว่าง' },
          { status: 400 }
        );
      }
    }
    if (updates.lastNameEN !== undefined) {
      updates.lastNameEN = updates.lastNameEN.trim();
      if (!updates.lastNameEN) {
        return NextResponse.json(
          { message: 'lastNameEN ห้ามเป็นค่าว่าง' },
          { status: 400 }
        );
      }
    }

    // Target must exist
    const targetDoc = await adminDb.collection('users').doc(targetId).get();
    if (!targetDoc.exists) {
      return NextResponse.json({ message: 'ไม่พบพนักงาน' }, { status: 404 });
    }

    // Resolve department/position names if IDs changed
    const updateData: Record<string, any> = { updatedAt: new Date() };

    if (updates.departmentId) {
      const deptDoc = await adminDb
        .collection('departments')
        .doc(updates.departmentId)
        .get();
      if (!deptDoc.exists) {
        return NextResponse.json(
          { message: 'ไม่พบแผนกที่เลือก' },
          { status: 400 }
        );
      }
      updateData.departmentId = updates.departmentId;
      updateData.departmentName = deptDoc.data()!.name;
    }

    if (updates.positionId) {
      const posDoc = await adminDb
        .collection('positions')
        .doc(updates.positionId)
        .get();
      if (!posDoc.exists) {
        return NextResponse.json(
          { message: 'ไม่พบตำแหน่งที่เลือก' },
          { status: 400 }
        );
      }
      updateData.positionId = updates.positionId;
      updateData.positionName = posDoc.data()!.name;
    }

    // Copy remaining allowed fields
    const allowedFields: (keyof UpdateEmployeePayload)[] = [
      'shiftId',
      'employmentStatus',
      'employeeType',
      'role',
      'firstNameTH',
      'lastNameTH',
      'firstNameEN',
      'lastNameEN',
      'phone',
      'lineId',
      'address',
      'emergencyContactName',
      'emergencyContactPhone',
      'emergencyContactRelation',
      'profileImage',
      'nickname',
      'dateOfBirth',
      'productionLineId',
      'titlePrefix',
      'titlePrefixOther',
      'hrRemark',
      'terminationDate',
      'probationEndDate',
    ];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updateData[field] = updates[field];
      }
    }

    // Business rule (Schema v2 requirement #5): titlePrefixOther must never
    // carry stale data once titlePrefix moves away from 'other'. The loop
    // above already copies titlePrefixOther verbatim when the client sends
    // it explicitly (e.g. editing the free-text value while titlePrefix
    // stays 'other'). This correction only fires when titlePrefix is
    // *itself* part of this request and is being set to something other
    // than 'other' — in that case we force-clear titlePrefixOther even if
    // the client didn't send it, so no old value lingers.
    if (updates.titlePrefix !== undefined && updates.titlePrefix !== 'other') {
      updateData.titlePrefixOther = null;
    }

    await adminDb.collection('users').doc(targetId).update(updateData);

    return NextResponse.json({
      success: true,
      message: 'อัพเดทข้อมูลพนักงานสำเร็จ',
    });
  } catch (error: any) {
    console.error('PATCH /api/employees/[id] error:', error);
    return NextResponse.json(
      { message: 'เกิดข้อผิดพลาด', error: error.message },
      { status: 500 }
    );
  }
}
