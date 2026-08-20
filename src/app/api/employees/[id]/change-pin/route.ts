// src/app/api/employees/[id]/change-pin/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import bcrypt from 'bcryptjs';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const { requesterId, currentPin, newPin } = body;
    const targetId = params.id;

    if (!requesterId || !newPin) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'MISSING_FIELDS',
            message: 'requesterId และ newPin จำเป็นต้องระบุ',
          },
        },
        { status: 400 }
      );
    }

    if (!/^\d{6}$/.test(newPin)) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INVALID_PIN', message: 'PIN ต้องเป็นตัวเลข 6 หลัก' },
        },
        { status: 400 }
      );
    }

    // โหลด requester
    const requesterDoc = await adminDb
      .collection('users')
      .doc(requesterId)
      .get();
    if (!requesterDoc.exists) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'ไม่พบผู้ใช้' },
        },
        { status: 401 }
      );
    }
    const requester = requesterDoc.data() as any;
    const isHR = ['admin', 'hr_manager'].includes(requester?.role);
    const isSelf = requesterId === targetId;

    // HR reset ได้ทุกคน / Employee เปลี่ยนเฉพาะตัวเอง
    if (!isHR && !isSelf) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'ไม่มีสิทธิ์เปลี่ยน PIN ของพนักงานคนอื่น',
          },
        },
        { status: 403 }
      );
    }

    // โหลด target employee
    const targetDoc = await adminDb.collection('users').doc(targetId).get();
    if (!targetDoc.exists) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'ไม่พบพนักงาน' },
        },
        { status: 404 }
      );
    }
    const targetData = targetDoc.data() as any;

    // Employee ต้องยืนยัน PIN เดิมก่อน (HR ไม่ต้อง)
    if (isSelf && !isHR) {
      if (!currentPin) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'MISSING_CURRENT_PIN',
              message: 'กรุณาระบุ PIN ปัจจุบัน',
            },
          },
          { status: 400 }
        );
      }
      const match = await bcrypt.compare(currentPin, targetData.pinHash);
      if (!match) {
        return NextResponse.json(
          {
            success: false,
            error: { code: 'WRONG_PIN', message: 'PIN ปัจจุบันไม่ถูกต้อง' },
          },
          { status: 400 }
        );
      }
    }

    // Hash PIN ใหม่และบันทึก
    const pinHash = await bcrypt.hash(newPin, 10);
    await adminDb.collection('users').doc(targetId).update({
      pinHash,
      mustChangePIN: false,
      updatedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      message: 'เปลี่ยน PIN สำเร็จ',
    });
  } catch (error: any) {
    console.error('PATCH /api/employees/[id]/change-pin error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message },
      },
      { status: 500 }
    );
  }
}
