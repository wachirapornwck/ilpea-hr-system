// app/api/employees/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import bcrypt from 'bcryptjs';
import type {
  EmployeeListItem,
  CreateEmployeePayload,
  PaginationResult,
} from '@/types';

export const dynamic = 'force-dynamic';

const ALLOWED_HR_ROLES = ['admin', 'hr_manager'];
const PAGE_SIZE = 20;

async function getRequester(requesterId: string) {
  const doc = await adminDb.collection('users').doc(requesterId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...(doc.data() as any) };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const requesterId = searchParams.get('requesterId');
    const search = (searchParams.get('search') ?? '').trim().toLowerCase();
    const departmentId = searchParams.get('departmentId') ?? '';
    const employeeType = searchParams.get('employeeType') ?? '';
    const employmentStatus = searchParams.get('employmentStatus') ?? 'active';
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));

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
    if (
      !isHR &&
      requester.role !== 'manager' &&
      requester.role !== 'employee'
    ) {
      return NextResponse.json(
        { message: 'ไม่มีสิทธิ์เข้าถึง' },
        { status: 403 }
      );
    }

    // ดึงทั้งหมด ไม่ใช้ where เพื่อหลีกเลี่ยง Firestore index requirement
    const snap = await adminDb.collection('users').limit(500).get();

    // Map to EmployeeListItem
    let employees: EmployeeListItem[] = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        employeeId: data.employeeId ?? d.id,
        firstNameEN: data.firstNameEN ?? '',
        lastNameEN: data.lastNameEN ?? '',
        firstNameTH: data.firstNameTH ?? '',
        lastNameTH: data.lastNameTH ?? '',
        nickname: data.nickname ?? undefined,
        role: data.role ?? 'employee',
        employeeType: data.employeeType ?? 'blue_collar',
        employmentStatus: data.employmentStatus ?? 'active',
        positionName: data.positionName ?? '',
        departmentId: data.departmentId ?? '',
        departmentName: data.departmentName ?? '',
        shiftId: data.shiftId ?? null,
        startDate: data.startDate ?? '',
        profileImage: data.profileImage ?? null,
        dateOfBirth: data.dateOfBirth ?? null,
      };
    });

    // Filter employmentStatus (JavaScript)
    if (employmentStatus) {
      employees = employees.filter(
        (e) => e.employmentStatus === employmentStatus
      );
    }

    // Filter departmentId (JavaScript)
    if (departmentId) {
      employees = employees.filter((e) => e.departmentId === departmentId);
    }

    // Filter employeeType (JavaScript)
    if (employeeType) {
      employees = employees.filter((e) => e.employeeType === employeeType);
    }

    // Search (JavaScript)
    if (search) {
      employees = employees.filter((e) => {
        const haystack = [
          e.employeeId,
          e.firstNameEN,
          e.lastNameEN,
          e.firstNameTH,
          e.lastNameTH,
          e.nickname ?? '',
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(search);
      });
    }

    // Non-HR sees only themselves
    if (!isHR && requester.role !== 'manager') {
      employees = employees.filter((e) => e.id === requesterId);
    }

    // Sort by employeeId (JavaScript)
    employees.sort((a, b) => a.employeeId.localeCompare(b.employeeId));

    // Paginate
    const total = employees.length;
    const start = (page - 1) * PAGE_SIZE;
    const items = employees.slice(start, start + PAGE_SIZE);

    const response: PaginationResult<EmployeeListItem> = {
      items,
      total,
      page,
      pageSize: PAGE_SIZE,
      hasMore: start + PAGE_SIZE < total,
    };

    return NextResponse.json({ success: true, data: response });
  } catch (error: any) {
    console.error('GET /api/employees error:', error);
    return NextResponse.json(
      { message: 'เกิดข้อผิดพลาด', error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { requesterId, ...payload } = body as {
      requesterId: string;
    } & CreateEmployeePayload;

    if (!requesterId) {
      return NextResponse.json(
        { message: 'requesterId is required' },
        { status: 400 }
      );
    }

    const requester = await getRequester(requesterId);
    if (!requester || !ALLOWED_HR_ROLES.includes(requester.role)) {
      return NextResponse.json(
        { message: 'ไม่มีสิทธิ์สร้างพนักงาน' },
        { status: 403 }
      );
    }

    const required: (keyof CreateEmployeePayload)[] = [
      'employeeId',
      'firstNameEN',
      'lastNameEN',
      'firstNameTH',
      'lastNameTH',
      'gender',
      'role',
      'employeeType',
      'positionId',
      'departmentId',
      'startDate',
      'pin',
    ];
    for (const field of required) {
      if (!payload[field]) {
        return NextResponse.json(
          { message: 'กรุณากรอก ' + field },
          { status: 400 }
        );
      }
    }

    if (payload.pin.length !== 6 || !/^\d{6}$/.test(payload.pin)) {
      return NextResponse.json(
        { message: 'PIN ต้องเป็นตัวเลข 6 หลัก' },
        { status: 400 }
      );
    }

    // ── Schema v2 field validation ──────────────────────────────────────
    const VALID_TITLE_PREFIXES = ['mr', 'mrs', 'miss', 'other'];
    if (
      payload.titlePrefix !== undefined &&
      !VALID_TITLE_PREFIXES.includes(payload.titlePrefix)
    ) {
      return NextResponse.json(
        { message: 'Invalid titlePrefix' },
        { status: 400 }
      );
    }
    if (payload.titlePrefix === 'other' && !payload.titlePrefixOther?.trim()) {
      return NextResponse.json(
        { message: 'titlePrefixOther is required when titlePrefix is other' },
        { status: 400 }
      );
    }
    if (
      payload.terminationDate !== undefined &&
      !/^\d{4}-\d{2}-\d{2}$/.test(payload.terminationDate)
    ) {
      return NextResponse.json(
        { message: 'Invalid terminationDate' },
        { status: 400 }
      );
    }

    const empIdUpper = payload.employeeId.toUpperCase();

    const existing = await adminDb
      .collection('users')
      .where('employeeId', '==', empIdUpper)
      .limit(1)
      .get();
    if (!existing.empty) {
      return NextResponse.json(
        { message: 'รหัสพนักงาน ' + empIdUpper + ' มีอยู่แล้ว' },
        { status: 409 }
      );
    }

    const deptDoc = await adminDb
      .collection('departments')
      .doc(payload.departmentId)
      .get();
    if (!deptDoc.exists) {
      return NextResponse.json(
        { message: 'ไม่พบแผนกที่เลือก' },
        { status: 400 }
      );
    }
    const deptData = deptDoc.data()!;

    const posDoc = await adminDb
      .collection('positions')
      .doc(payload.positionId)
      .get();
    if (!posDoc.exists) {
      return NextResponse.json(
        { message: 'ไม่พบตำแหน่งที่เลือก' },
        { status: 400 }
      );
    }
    const posData = posDoc.data()!;

    const pinHash = await bcrypt.hash(payload.pin, 10);
    const now = new Date();
    const docId = empIdUpper;

    await adminDb
      .collection('users')
      .doc(docId)
      .set({
        employeeId: empIdUpper,
        firstNameEN: payload.firstNameEN,
        lastNameEN: payload.lastNameEN,
        firstNameTH: payload.firstNameTH,
        lastNameTH: payload.lastNameTH,
        nickname: payload.nickname ?? null,
        gender: payload.gender,
        role: payload.role,
        employeeType: payload.employeeType,
        employmentStatus: 'active',
        positionId: payload.positionId,
        positionName: posData.name,
        departmentId: payload.departmentId,
        departmentName: deptData.name,
        shiftId: payload.shiftId ?? null,
        startDate: payload.startDate,
        phone: payload.phone ?? null,
        lineId: payload.lineId ?? null,
        address: payload.address ?? null,
        emergencyContactName: payload.emergencyContactName ?? null,
        emergencyContactPhone: payload.emergencyContactPhone ?? null,
        emergencyContactRelation: payload.emergencyContactRelation ?? null,
        dateOfBirth: payload.dateOfBirth ?? null,
        titlePrefix: payload.titlePrefix ?? null,
        titlePrefixOther:
          payload.titlePrefix === 'other'
            ? payload.titlePrefixOther!.trim()
            : null,
        hrRemark: payload.hrRemark ?? null,
        terminationDate: payload.terminationDate ?? null,
        profileImage: null,
        salary: null,
        pinHash,
        mustChangePIN: true,
        createdAt: now,
        updatedAt: now,
      });

    return NextResponse.json(
      {
        success: true,
        message: 'สร้างพนักงาน ' + empIdUpper + ' สำเร็จ',
        data: { id: docId, employeeId: empIdUpper },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('POST /api/employees error:', error);
    return NextResponse.json(
      { message: 'เกิดข้อผิดพลาด', error: error.message },
      { status: 500 }
    );
  }
}
