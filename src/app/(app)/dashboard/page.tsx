'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import { useAttendance } from '@/lib/hooks/useAttendance';

function Toast({
  message,
  type,
  onClose,
}: {
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div
      className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 ${
        type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
      }`}
    >
      <span>{type === 'success' ? '✓' : '✕'}</span>
      {message}
      <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100">
        ×
      </button>
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardSummary {
  leaveBalance: {
    sick: number;
    vacation: number;
    personal: number;
    total: number;
  };
  unreadNotifications: number;
}

interface HREmployee {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  firstNameTH: string;
  lastNameTH: string;
  department: string;
  positionName: string;
  shiftId: string | null;
  status: 'present' | 'late' | 'absent' | 'leave' | 'not_checked_in';
  clockInTime: string | null;
  clockOutTime: string | null;
  lateMinutes: number;
}

interface HRSummary {
  total: number;
  checkedIn: number;
  notCheckedIn: number;
  late: number;
  onLeave: number;
  absent: number;
}

interface HRTodayData {
  date: string;
  summary: HRSummary;
  employees: HREmployee[];
}

type FilterType = 'all' | 'present' | 'late' | 'absent' | 'leave';

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_LABEL: Record<HREmployee['status'], string> = {
  present: 'มาทำงาน',
  late: 'มาสาย',
  absent: 'ขาดงาน',
  leave: 'ลา',
  not_checked_in: 'ยังไม่เช็คอิน',
};

const STATUS_CLASS: Record<HREmployee['status'], string> = {
  present: 'bg-green-100 text-green-700',
  late: 'bg-yellow-100 text-yellow-700',
  absent: 'bg-red-100 text-red-700',
  leave: 'bg-blue-100 text-blue-700',
  not_checked_in: 'bg-gray-100 text-gray-500',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const {
    today,
    todayLoading,
    clockIn,
    clockOut,
    actionLoading,
    getGpsCoordinates,
  } = useAttendance();

  const isHR =
    user?.role === 'admin' ||
    user?.role === 'hr_manager' ||
    user?.role === 'manager';

  // Employee dashboard summary
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // HR dashboard
  const [hrData, setHrData] = useState<HRTodayData | null>(null);
  const [hrLoading, setHrLoading] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [authLoading, user, router]);

  // โหลด employee summary
  const fetchSummary = useCallback(async () => {
    if (!user?.id) return;
    setSummaryLoading(true);
    try {
      const res = await fetch(`/api/dashboard/summary?userId=${user.id}`);
      const data = await res.json();
      if (res.ok && data.success) setSummary(data.data);
    } catch {
      // silent fail — UI จะแสดง —
    } finally {
      setSummaryLoading(false);
    }
  }, [user?.id]);

  // โหลด HR today data
  const fetchHRToday = useCallback(async () => {
    if (!user?.id || !isHR) return;
    setHrLoading(true);
    try {
      const res = await fetch(`/api/dashboard/hr-today?requesterId=${user.id}`);
      const data = await res.json();
      if (res.ok && data.success) setHrData(data);
    } catch {
      // silent fail
    } finally {
      setHrLoading(false);
    }
  }, [user?.id, isHR]);

  useEffect(() => {
    if (user?.id) {
      fetchSummary();
      if (isHR) fetchHRToday();
    }
  }, [user?.id, isHR, fetchSummary, fetchHRToday]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-slate-500">กำลังโหลด...</p>
      </div>
    );
  }

  if (!user) return null;

  // ─── Attendance card logic (เดิม) ─────────────────────────────────────────

  const attendance = today?.data;
  const isWhiteCollar = today?.isWhiteCollar ?? false;
  const holiday = today?.holiday;

  const attendanceStatusText = (() => {
    if (todayLoading) return 'กำลังโหลด...';
    if (isWhiteCollar) return 'พนักงาน Office';
    if (!attendance) return 'ยังไม่ได้เช็คอิน';
    return attendance.statusLabel ?? attendance.status;
  })();

  const workingHoursText = (() => {
    if (!attendance?.workingHours) return null;
    const h = Math.floor(attendance.workingHours);
    const m = Math.round((attendance.workingHours - h) * 60);
    return `${h}ชม. ${m}นาที`;
  })();

  const canClockIn =
    !isWhiteCollar && !attendance?.hasClockedIn && (today?.canClockIn ?? true);
  const canClockOut =
    !isWhiteCollar && attendance?.hasClockedIn && !attendance?.hasClockedOut;

  const handleClockIn = async () => {
    const defaultShift = (user as any).shiftId ?? 'DAY';
    const gps = await getGpsCoordinates();
    const result = await clockIn({
      shiftId: defaultShift,
      latitude: gps?.latitude ?? null,
      longitude: gps?.longitude ?? null,
      accuracy: gps?.accuracy ?? null,
    });
    setToast({
      message: result.message,
      type: result.success ? 'success' : 'error',
    });
  };

  const handleClockOut = async () => {
    const result = await clockOut();
    setToast({
      message: result.message,
      type: result.success ? 'success' : 'error',
    });
  };

  // ─── HR filter logic ───────────────────────────────────────────────────────

  const filteredEmployees = (hrData?.employees ?? []).filter((e) => {
    if (filter === 'all') return true;
    if (filter === 'present') return e.status === 'present';
    if (filter === 'late') return e.status === 'late';
    if (filter === 'absent')
      return e.status === 'absent' || e.status === 'not_checked_in';
    if (filter === 'leave') return e.status === 'leave';
    return true;
  });

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">
          สวัสดี, {user.firstName} 👋
        </h2>
        <p className="text-gray-500 mt-1">
          {holiday ? `วันหยุด: ${holiday.name}` : 'วันนี้มีอะไรให้ช่วยไหมครับ?'}
        </p>
      </div>

      {/* ── Employee stat cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Card 1: การเข้างานวันนี้ (เดิม) */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
              <span className="text-xl">🕐</span>
            </div>
            <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-full">
              วันนี้
            </span>
          </div>
          {todayLoading ? (
            <div className="h-8 w-32 bg-gray-100 animate-pulse rounded mb-1" />
          ) : (
            <p className="text-2xl font-bold text-gray-900">
              {attendanceStatusText}
            </p>
          )}
          <p className="text-sm text-gray-500 mt-1">การเข้างานวันนี้</p>
          {attendance?.clockInFormatted && (
            <p className="text-xs text-gray-400 mt-1">
              เข้า {attendance.clockInFormatted}
              {attendance.clockOutFormatted &&
                ` · ออก ${attendance.clockOutFormatted}`}
            </p>
          )}
          {workingHoursText && (
            <p className="text-xs text-blue-600 mt-1 font-medium">
              {workingHoursText}
            </p>
          )}
          {attendance?.lateMinutes && attendance.lateMinutes > 0 ? (
            <p className="text-xs text-red-500 mt-1">
              สาย {attendance.lateMinutes} นาที
            </p>
          ) : null}
          {!isWhiteCollar && (
            <div className="mt-4 flex gap-2">
              {canClockIn && (
                <button
                  onClick={handleClockIn}
                  disabled={actionLoading}
                  className="flex-1 bg-blue-600 text-white text-sm font-medium py-2 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {actionLoading ? 'กำลังบันทึก...' : 'เช็คอิน'}
                </button>
              )}
              {canClockOut && (
                <button
                  onClick={handleClockOut}
                  disabled={actionLoading}
                  className="flex-1 bg-slate-700 text-white text-sm font-medium py-2 rounded-xl hover:bg-slate-800 transition-colors disabled:opacity-50"
                >
                  {actionLoading ? 'กำลังบันทึก...' : 'เช็คเอาท์'}
                </button>
              )}
              {!canClockIn && !canClockOut && !todayLoading && (
                <div className="flex-1 bg-green-50 text-green-700 text-sm font-medium py-2 rounded-xl text-center">
                  ✓ บันทึกครบแล้ว
                </div>
              )}
            </div>
          )}
        </div>

        {/* Card 2: วันลาคงเหลือ — real data */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
              <span className="text-xl">📅</span>
            </div>
            <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-full">
              ปีนี้
            </span>
          </div>
          {summaryLoading ? (
            <div className="h-8 w-24 bg-gray-100 animate-pulse rounded mb-1" />
          ) : (
            <p className="text-2xl font-bold text-gray-900">
              {summary ? `${summary.leaveBalance.total} วัน` : '— วัน'}
            </p>
          )}
          <p className="text-sm text-gray-500 mt-1">วันลาคงเหลือ</p>
          {summary && (
            <p className="text-xs text-gray-400 mt-1">
              ป่วย {summary.leaveBalance.sick} · พักร้อน{' '}
              {summary.leaveBalance.vacation} · กิจ{' '}
              {summary.leaveBalance.personal}
            </p>
          )}
          <button
            onClick={() => router.push('/leave')}
            className="mt-4 w-full bg-green-600 text-white text-sm font-medium py-2 rounded-xl hover:bg-green-700 transition-colors"
          >
            ยื่นใบลา
          </button>
        </div>

        {/* Card 3: การแจ้งเตือน — real data */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
              <span className="text-xl">🔔</span>
            </div>
            <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-full">
              ใหม่
            </span>
          </div>
          {summaryLoading ? (
            <div className="h-8 w-24 bg-gray-100 animate-pulse rounded mb-1" />
          ) : (
            <p className="text-2xl font-bold text-gray-900">
              {summary !== null
                ? `${summary.unreadNotifications} รายการ`
                : '— รายการ'}
            </p>
          )}
          <p className="text-sm text-gray-500 mt-1">การแจ้งเตือน</p>
          <button
            onClick={() => router.push('/notifications')}
            className="mt-4 w-full bg-orange-500 text-white text-sm font-medium py-2 rounded-xl hover:bg-orange-600 transition-colors"
          >
            ดูทั้งหมด
          </button>
        </div>
      </div>

      {/* ── เมนูหลัก (เดิม) ── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <h3 className="text-base font-semibold text-gray-900 mb-4">เมนูหลัก</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              icon: '🕐',
              label: 'การเข้างาน',
              desc: 'เช็คอิน / เช็คเอาท์',
              href: '/attendance',
            },
            {
              icon: '📅',
              label: 'การลา',
              desc: 'ยื่น / ติดตามการลา',
              href: '/leave',
            },
            {
              icon: '💰',
              label: 'เงินเดือน',
              desc: 'ดูสลิปเงินเดือน',
              href: '/payroll',
            },
            {
              icon: '👥',
              label: 'พนักงาน',
              desc: 'ข้อมูลพนักงาน',
              href: '/employees',
              adminOnly: true,
            },
          ]
            .filter(
              (item) =>
                !item.adminOnly ||
                user.role === 'admin' ||
                user.role === 'hr_manager'
            )
            .map((item) => (
              <button
                key={item.label}
                onClick={() => router.push(item.href)}
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

      {/* ── HR Badge (เดิม) ── */}
      {isHR && (
        <div className="mt-6 bg-blue-50 border border-blue-100 rounded-2xl p-4 flex items-center gap-3">
          <span className="text-2xl">⚡</span>
          <div>
            <p className="text-sm font-semibold text-blue-900">
              คุณมีสิทธิ์{' '}
              {user.role === 'admin'
                ? 'ผู้ดูแลระบบ'
                : user.role === 'hr_manager'
                ? 'HR Manager'
                : 'ผู้จัดการ'}
            </p>
            <p className="text-xs text-blue-600">
              สามารถจัดการข้อมูลพนักงานและระบบได้
            </p>
          </div>
        </div>
      )}

      {/* ── HR Today Overview ── */}
      {isHR && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-900">
              ภาพรวมการเข้างานวันนี้
            </h3>
            <button
              onClick={fetchHRToday}
              disabled={hrLoading}
              className="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
            >
              {hrLoading ? 'กำลังโหลด...' : 'รีเฟรช'}
            </button>
          </div>

          {/* Summary Stats */}
          {hrLoading ? (
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-white rounded-xl border border-gray-100 p-4 h-20 animate-pulse"
                />
              ))}
            </div>
          ) : hrData ? (
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4">
              {[
                {
                  label: 'ทั้งหมด',
                  value: hrData.summary.total,
                  color: 'text-gray-900',
                  bg: 'bg-gray-50',
                },
                {
                  label: 'เช็คอินแล้ว',
                  value: hrData.summary.checkedIn,
                  color: 'text-green-700',
                  bg: 'bg-green-50',
                },
                {
                  label: 'ยังไม่เช็คอิน',
                  value: hrData.summary.notCheckedIn,
                  color: 'text-gray-500',
                  bg: 'bg-gray-50',
                },
                {
                  label: 'มาสาย',
                  value: hrData.summary.late,
                  color: 'text-yellow-700',
                  bg: 'bg-yellow-50',
                },
                {
                  label: 'ลา',
                  value: hrData.summary.onLeave,
                  color: 'text-blue-700',
                  bg: 'bg-blue-50',
                },
                {
                  label: 'ขาดงาน',
                  value: hrData.summary.absent,
                  color: 'text-red-700',
                  bg: 'bg-red-50',
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className={`${stat.bg} rounded-xl border border-gray-100 p-4 text-center`}
                >
                  <p className={`text-2xl font-bold ${stat.color}`}>
                    {stat.value}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
                </div>
              ))}
            </div>
          ) : null}

          {/* Filter Tabs */}
          <div className="flex gap-2 mb-3 flex-wrap">
            {(
              [
                { key: 'all', label: 'ทั้งหมด' },
                { key: 'present', label: 'มาทำงาน' },
                { key: 'late', label: 'มาสาย' },
                { key: 'absent', label: 'ขาดงาน' },
                { key: 'leave', label: 'ลา' },
              ] as { key: FilterType; label: string }[]
            ).map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  filter === f.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Employee Table */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {hrLoading ? (
              <div className="p-8 text-center text-gray-400 text-sm">
                กำลังโหลด...
              </div>
            ) : filteredEmployees.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">
                ไม่มีข้อมูล
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                        พนักงาน
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                        แผนก
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                        กะ
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                        เช็คอิน
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                        สถานะ
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredEmployees.map((emp) => (
                      <tr
                        key={emp.id}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">
                            {emp.firstNameTH} {emp.lastNameTH}
                          </p>
                          <p className="text-xs text-gray-400">
                            {emp.employeeId}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {emp.department}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {emp.shiftId ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {emp.clockInTime
                            ? new Date(emp.clockInTime).toLocaleTimeString(
                                'th-TH',
                                { hour: '2-digit', minute: '2-digit' }
                              )
                            : '—'}
                          {emp.lateMinutes > 0 && (
                            <span className="ml-1 text-xs text-red-500">
                              (สาย {emp.lateMinutes} นาที)
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              STATUS_CLASS[emp.status]
                            }`}
                          >
                            {STATUS_LABEL[emp.status]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
