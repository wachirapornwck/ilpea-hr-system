// src/app/api/departments/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const requesterId = searchParams.get('requesterId');

    if (!requesterId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'MISSING_REQUESTER', message: 'Missing requesterId' },
        },
        { status: 400 }
      );
    }

    // ตรวจสอบ session
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

    const snapshot = await adminDb.collection('departments').limit(500).get();
    const departments = snapshot.docs.map(
      (doc: { id: string; data: () => Record<string, any> }) => ({
        id: doc.id,
        ...doc.data(),
      })
    );

    // เรียงตามชื่อ in-memory (ไม่ใช้ orderBy เพื่อหลีกเลี่ยง composite index)
    departments.sort((a: any, b: any) =>
      (a.name ?? '').localeCompare(b.name ?? '', 'th')
    );

    return NextResponse.json({ success: true, data: departments });
  } catch (error: any) {
    console.error('GET /api/departments error:', error);
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
// POST /api/departments — สร้าง Department ใหม่ (HR/Admin เท่านั้น)
// ============================================================

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { requesterId, name, nameEN } = body;

    if (!requesterId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'MISSING_REQUESTER', message: 'Missing requesterId' },
        },
        { status: 400 }
      );
    }
    if (!name) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'MISSING_FIELDS', message: 'name is required' },
        },
        { status: 400 }
      );
    }

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

    const now = new Date().toISOString();
    const data = {
      name,
      nameEN: nameEN ?? name,
      active: true,
      createdAt: now,
      updatedAt: now,
    };

    const ref = await adminDb.collection('departments').add(data);
    return NextResponse.json(
      { success: true, data: { id: ref.id, ...data } },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('POST /api/departments error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message },
      },
      { status: 500 }
    );
  }
}
