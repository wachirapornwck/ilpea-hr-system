import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

// ============================================================
// GET /api/production-lines
// Query: active?, search?
// ============================================================

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const requesterId = searchParams.get('requesterId');
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

    const snapshot = await adminDb
      .collection('productionLines')
      .limit(500)
      .get();
    let lines = snapshot.docs.map(
      (doc: { id: string; data: () => Record<string, any> }) => ({
        id: doc.id,
        ...doc.data(),
      })
    );

    // filter in-memory
    if (activeParam !== null) {
      const activeVal = activeParam === 'true';
      lines = lines.filter((l: any) => l.active === activeVal);
    }
    if (search) {
      lines = lines.filter(
        (l: any) =>
          (l.name ?? '').toLowerCase().includes(search) ||
          (l.code ?? '').toLowerCase().includes(search)
      );
    }

    lines.sort((a: any, b: any) => {
      const diff = (a.sortOrder ?? 999) - (b.sortOrder ?? 999);
      if (diff !== 0) return diff;
      return (a.name ?? '').localeCompare(b.name ?? '', 'th');
    });

    return NextResponse.json({ success: true, data: lines });
  } catch (error: any) {
    console.error('GET /api/production-lines error:', error);
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
// POST /api/production-lines — สร้างใหม่ (HR/Admin เท่านั้น)
// ============================================================

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { requesterId, code, name, description, sortOrder } = body;

    if (!requesterId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'MISSING_REQUESTER', message: 'Missing requesterId' },
        },
        { status: 400 }
      );
    }
    if (!code || !name) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'MISSING_FIELDS',
            message: 'code และ name จำเป็นต้องระบุ',
          },
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

    // ตรวจสอบ code ซ้ำ
    const existing = await adminDb
      .collection('productionLines')
      .where('code', '==', code.toUpperCase())
      .get();
    if (!existing.empty) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'DUPLICATE_CODE', message: `รหัส ${code} มีอยู่แล้ว` },
        },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const data = {
      code: code.toUpperCase(),
      name,
      description: description ?? '',
      active: true,
      sortOrder: sortOrder ?? 999,
      createdAt: now,
      updatedAt: now,
    };

    const ref = await adminDb.collection('productionLines').add(data);
    return NextResponse.json(
      { success: true, data: { id: ref.id, ...data } },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('POST /api/production-lines error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message },
      },
      { status: 500 }
    );
  }
}
