// app/api/dashboard/summary/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { message: 'userId is required' },
        { status: 400 }
      );
    }

    const now = new Date();
    const bkk = new Date(
      now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })
    );
    const year = bkk.getFullYear();

    // ดึง leave balance และ unread notifications พร้อมกัน
    const [leaveSnap, notifSnap] = await Promise.all([
      adminDb
        .collection('leaveBalances')
        .where('userId', '==', userId)
        .where('year', '==', year)
        .limit(1)
        .get(),
      adminDb
        .collection('notifications')
        .where('userId', '==', userId)
        .where('isRead', '==', false)
        .get(),
    ]);

    const leaveBalance = leaveSnap.empty
      ? { sick: 0, vacation: 0, personal: 0, total: 0 }
      : (() => {
          // ⚠️ ปรับให้อ่านจาก field ใหม่ "balances" (map ตาม leaveTypeCode
          // เช่น { SICK: 28, VACATION: 8, BUSINESS_PAID: 3 }) แทนที่ field
          // แบบเดิม sick/vacation/personal ที่วางไว้แต่ยังไม่เคยมีใครสร้าง
          // ข้อมูลจริงมาก่อนเลย (เช็คแล้วว่า collection leaveBalances ว่าง
          // เปล่าตั้งแต่ต้น จึงไม่มีข้อมูลเก่าที่ต้อง migrate)
          const d = leaveSnap.docs[0].data();
          const balances = d.balances ?? {};
          const sick = balances.SICK ?? 0;
          const vacation = balances.VACATION ?? 0;
          const personal = balances.BUSINESS_PAID ?? 0; // "ลากิจ" ใกล้เคียง "ลาเหตุส่วนตัว" ที่สุด
          return {
            sick,
            vacation,
            personal,
            total: sick + vacation + personal,
          };
        })();

    const unreadNotifications = notifSnap.size;

    return NextResponse.json({
      success: true,
      data: {
        leaveBalance,
        unreadNotifications,
      },
    });
  } catch (error: any) {
    console.error('Dashboard summary error:', error);
    return NextResponse.json(
      { message: 'เกิดข้อผิดพลาด', error: error.message },
      { status: 500 }
    );
  }
}
