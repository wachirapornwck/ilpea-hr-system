import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import type { EmployeeType } from '@/types';

export const dynamic = 'force-dynamic';

// ============================================================
// GET /api/positions
// Query: departmentId?, employeeType?, active?, search?
// ============================================================

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const requesterId = searchParams.get('requesterId');
    const departmentId = searchParams.get('departmentId');
    const employeeType = searchParams.get(
      'employeeType'
    ) as EmployeeType | null;
    const activeParam = searchParams.get('active');
    const search = searchParams.get('search')?.trim().toLowerCase();

    if (!requesterId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'MISSING_REQUESTER', message: 'Missing requesterId' },
        },
        { status: 400 }
      );
    }

    const requesterDoc = await adminDb
      .collection('users')
      .doc(requesterId)
      .get();
    if (!requesterDoc.exists) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
        },
        { status: 401 }
      );
    }

    const snapshot = await adminDb.collection('positions').limit(500).get();
    let positions = snapshot.docs.map(
      (doc: { id: string; data: () => Record<string, any> }) => ({
        id: doc.id,
        ...doc.data(),
      })
    );

    // filter in-memory
    if (departmentId) {
      positions = positions.filter((p: any) => p.departmentId === departmentId);
    }
    if (employeeType) {
      positions = positions.filter((p: any) => p.employeeType === employeeType);
    }
    if (activeParam !== null) {
      const activeVal = activeParam === 'true';
      positions = positions.filter((p: any) => p.active === activeVal);
    }
    if (search) {
      positions = positions.filter(
        (p: any) =>
          (p.name ?? '').toLowerCase().includes(search) ||
          (p.code ?? '').toLowerCase().includes(search)
      );
    }

    positions.sort((a: any, b: any) => {
      const orderDiff = (a.sortOrder ?? 999) - (b.sortOrder ?? 999);
      if (orderDiff !== 0) return orderDiff;
      return (a.name ?? '').localeCompare(b.name ?? '', 'th');
    });

    return NextResponse.json({ success: true, data: positions });
    console.log(
      '[API] Positions returned:',
      JSON.stringify(
        positions.map((p: any) => ({
          id: p.id,
          name: p.name,
          departmentId: p.departmentId,
          active: p.active,
        }))
      )
    );
    return NextResponse.json({ success: true, data: positions });
  } catch (error: any) {
    console.error('GET /api/positions error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message },
      },
      { status: 500 }
    );
  }
}

// ============================================================
// POST /api/positions — สร้าง Position ใหม่ (HR/Admin เท่านั้น)
// ============================================================

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { requesterId, code, name, departmentId, employeeType, ...rest } =
      body;

    if (!requesterId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'MISSING_REQUESTER', message: 'Missing requesterId' },
        },
        { status: 400 }
      );
    }
    if (!code || !name || !departmentId || !employeeType) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'MISSING_FIELDS',
            message: 'code, name, departmentId, employeeType are required',
          },
        },
        { status: 400 }
      );
    }

    // ตรวจสอบสิทธิ์
    const requesterDoc = await adminDb
      .collection('users')
      .doc(requesterId)
      .get();
    const requester = requesterDoc.data() as any;
    if (
      !requesterDoc.exists ||
      !['admin', 'hr_manager'].includes(requester?.role)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'FORBIDDEN', message: 'HR or Admin only' },
        },
        { status: 403 }
      );
    }

    // ตรวจสอบ code ซ้ำ
    const existing = await adminDb
      .collection('positions')
      .where('code', '==', code.toUpperCase())
      .get();
    if (!existing.empty) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'DUPLICATE_CODE',
            message: `Position code ${code} already exists`,
          },
        },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const data = {
      code: code.toUpperCase(),
      name,
      departmentId,
      employeeType,
      description: rest.description ?? '',
      defaultShiftId: rest.defaultShiftId ?? null,
      grade: rest.grade ?? '',
      level: rest.level ?? 1,
      isSupervisor: rest.isSupervisor ?? false,
      active: true,
      sortOrder: rest.sortOrder ?? 999,
      createdAt: now,
      updatedAt: now,
    };

    const ref = await adminDb.collection('positions').add(data);
    console.log(
      '[API] Position created:',
      JSON.stringify({ id: ref.id, ...data })
    );
    return NextResponse.json(
      { success: true, data: { id: ref.id, ...data } },
      { status: 201 }
    );
    return NextResponse.json(
      { success: true, data: { id: ref.id, ...data } },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('POST /api/positions error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message },
      },
      { status: 500 }
    );
  }
}
