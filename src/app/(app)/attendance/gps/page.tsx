'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';

export default function DashboardPage() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.replace('/login');
  };

  return (
    <div>
      {/* 🌱 TEMP — ลบออกหลัง seed สำเร็จ */}
      <button
        onClick={async () => {
          const res = await fetch('/api/seed', { method: 'POST' });
          const data = await res.json();
          alert(JSON.stringify(data));
        }}
        className="fixed top-4 right-4 z-50 bg-red-500 text-white px-4 py-2 rounded shadow-lg"
      >
        🌱 Seed Database
      </button>

      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
                <span className="text-white font-bold text-sm">IL</span>
              </div>
              <div>
                <h1 className="text-base font-semibold text-gray-900">
                  ILPEA Thailand
                </h1>
                <p className="text-xs text-gray-500">ระบบ HR อัจฉริยะ</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-xs text-gray-500">
                  {user?.employeeId} · {user?.role}
                </p>
              </div>
              <button
                onClick={handleSignOut}
                className="text-sm text-gray-500 hover:text-red-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-50"
              >
                ออกจากระบบ
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-6 py-8">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900">
              สวัสดี, {user?.nickname || user?.firstName} 👋
            </h2>
            <p className="text-gray-500 mt-1">วันนี้มีอะไรให้ช่วยไหมครับ?</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                  <span className="text-xl">🕐</span>
                </div>
                <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-full">
                  วันนี้
                </span>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                ยังไม่ได้เช็คอิน
              </p>
              <p className="text-sm text-gray-500 mt-1">การเข้างานวันนี้</p>
              <button className="mt-4 w-full bg-blue-600 text-white text-sm font-medium py-2 rounded-xl hover:bg-blue-700 transition-colors">
                เช็คอิน
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
                  <span className="text-xl">📅</span>
                </div>
                <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-full">
                  ปีนี้
                </span>
              </div>
              <p className="text-2xl font-bold text-gray-900">10 วัน</p>
              <p className="text-sm text-gray-500 mt-1">วันลาคงเหลือ</p>
              <button className="mt-4 w-full bg-green-600 text-white text-sm font-medium py-2 rounded-xl hover:bg-green-700 transition-colors">
                ยื่นใบลา
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
                  <span className="text-xl">🔔</span>
                </div>
                <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-full">
                  ใหม่
                </span>
              </div>
              <p className="text-2xl font-bold text-gray-900">0 รายการ</p>
              <p className="text-sm text-gray-500 mt-1">การแจ้งเตือน</p>
              <button className="mt-4 w-full bg-orange-500 text-white text-sm font-medium py-2 rounded-xl hover:bg-orange-600 transition-colors">
                ดูทั้งหมด
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <h3 className="text-base font-semibold text-gray-900 mb-4">
              เมนูหลัก
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                {
                  icon: '🕐',
                  label: 'การเข้างาน',
                  desc: 'เช็คอิน / เช็คเอาท์',
                },
                { icon: '📅', label: 'การลา', desc: 'ยื่น / ติดตามการลา' },
                { icon: '💰', label: 'เงินเดือน', desc: 'ดูสลิปเงินเดือน' },
                {
                  icon: '👥',
                  label: 'พนักงาน',
                  desc: 'ข้อมูลพนักงาน',
                  adminOnly: true,
                },
              ]
                .filter(
                  (item) =>
                    !item.adminOnly ||
                    user?.role === 'admin' ||
                    user?.role === 'hr_manager'
                )
                .map((item) => (
                  <button
                    key={item.label}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50 transition-all group"
                  >
                    <span className="text-2xl">{item.icon}</span>
                    <span className="text-sm font-medium text-gray-900 group-hover:text-blue-700">
                      {item.label}
                    </span>
                    <span className="text-xs text-gray-400 text-center">
                      {item.desc}
                    </span>
                  </button>
                ))}
            </div>
          </div>

          {(user?.role === 'admin' || user?.role === 'hr_manager') && (
            <div className="mt-6 bg-blue-50 border border-blue-100 rounded-2xl p-4 flex items-center gap-3">
              <span className="text-2xl">⚡</span>
              <div>
                <p className="text-sm font-semibold text-blue-900">
                  คุณมีสิทธิ์ {user.role === 'admin' ? 'ผู้ดูแลระบบ' : 'HR'}
                </p>
                <p className="text-xs text-blue-600">
                  สามารถจัดการข้อมูลพนักงานและระบบได้
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
