'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth/context';
import { useAttendance } from '@/lib/hooks/useAttendance';

function StatusBadge({ status, label }: { status: string; label: string }) {
  const colorMap: Record<string, string> = {
    present: 'bg-green-100 text-green-800',
    late: 'bg-yellow-100 text-yellow-800',
    early_leave: 'bg-orange-100 text-orange-800',
    late_and_early_leave: 'bg-red-100 text-red-800',
    absent: 'bg-red-100 text-red-800',
    holiday: 'bg-purple-100 text-purple-800',
    on_leave: 'bg-blue-100 text-blue-800',
    weekend: 'bg-gray-100 text-gray-600',
  };
  const cls = colorMap[status] ?? 'bg-gray-100 text-gray-600';
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}
    >
      {label}
    </span>
  );
}

function fmtMinutes(minutes: number) {
  if (!minutes) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} นาที`;
  return m === 0 ? `${h} ชม.` : `${h} ชม. ${m} นาที`;
}

function fmtHours(hours: number) {
  if (!hours) return '—';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m === 0 ? `${h} ชม.` : `${h} ชม. ${m} นาที`;
}

function ClockInModal({
  onClose,
  onConfirm,
  loading,
  shiftId,
}: {
  onClose: () => void;
  onConfirm: (s: string) => void;
  loading: boolean;
  shiftId: string;
}) {
  const [selected, setSelected] = useState(shiftId);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">เช็คอิน</h3>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            กะการทำงาน
          </label>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="DAY">กะเช้า (08:00–17:00)</option>
            <option value="NIGHT">กะดึก (20:00–05:00)</option>
            <option value="MAID">กะแม่บ้าน (07:00–16:00)</option>
          </select>
        </div>
        <p className="text-xs text-gray-400 mb-4">
          ระบบจะขอตำแหน่ง GPS โดยอัตโนมัติ (ไม่บังคับ)
        </p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 border border-gray-200 text-gray-700 text-sm font-medium py-2 rounded-xl hover:bg-gray-50"
          >
            ยกเลิก
          </button>
          <button
            onClick={() => onConfirm(selected)}
            disabled={loading}
            className="flex-1 bg-blue-600 text-white text-sm font-medium py-2 rounded-xl hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'กำลังบันทึก...' : 'ยืนยันเช็คอิน'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ClockOutModal({
  onClose,
  onConfirm,
  loading,
  clockInFormatted,
}: {
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
  clockInFormatted: string | null;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">เช็คเอาท์</h3>
        {clockInFormatted && (
          <p className="text-sm text-gray-500 mb-4">
            เวลาเข้างาน:{' '}
            <span className="font-medium text-gray-900">
              {clockInFormatted}
            </span>
          </p>
        )}
        <p className="text-sm text-gray-600 mb-4">ยืนยันการออกงาน ณ เวลานี้?</p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 border border-gray-200 text-gray-700 text-sm font-medium py-2 rounded-xl hover:bg-gray-50"
          >
            ยกเลิก
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 bg-slate-700 text-white text-sm font-medium py-2 rounded-xl hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? 'กำลังบันทึก...' : 'ยืนยันเช็คเอาท์'}
          </button>
        </div>
      </div>
    </div>
  );
}

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

export default function AttendancePage() {
  const { user } = useAuth();
  const {
    today,
    todayLoading,
    history,
    historyLoading,
    fetchHistory,
    clockIn,
    clockOut,
    actionLoading,
    getGpsCoordinates,
  } = useAttendance();

  const [showClockIn, setShowClockIn] = useState(false);
  const [showClockOut, setShowClockOut] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);

  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

  useEffect(() => {
    fetchHistory(selectedYear, selectedMonth, true);
  }, [selectedYear, selectedMonth, fetchHistory]);

  const attendance = today?.data;
  const isWhiteCollar = today?.isWhiteCollar ?? false;
  const defaultShift = (user as any)?.shiftId ?? 'DAY';
  const canClockIn =
    !isWhiteCollar && !attendance?.hasClockedIn && (today?.canClockIn ?? true);
  const canClockOut =
    !isWhiteCollar && attendance?.hasClockedIn && !attendance?.hasClockedOut;
  const summary = history?.summary;

  const monthNames = [
    'มกราคม',
    'กุมภาพันธ์',
    'มีนาคม',
    'เมษายน',
    'พฤษภาคม',
    'มิถุนายน',
    'กรกฎาคม',
    'สิงหาคม',
    'กันยายน',
    'ตุลาคม',
    'พฤศจิกายน',
    'ธันวาคม',
  ];

  const handleClockIn = async (shiftId: string) => {
    const gps = await getGpsCoordinates();
    const result = await clockIn({
      shiftId,
      latitude: gps?.latitude ?? null,
      longitude: gps?.longitude ?? null,
      accuracy: gps?.accuracy ?? null,
    });
    setShowClockIn(false);
    setToast({
      message: result.message,
      type: result.success ? 'success' : 'error',
    });
    if (result.success) fetchHistory(selectedYear, selectedMonth, true);
  };

  const handleClockOut = async () => {
    const result = await clockOut();
    setShowClockOut(false);
    setToast({
      message: result.message,
      type: result.success ? 'success' : 'error',
    });
    if (result.success) fetchHistory(selectedYear, selectedMonth, true);
  };

  return (
    <div>
      {showClockIn && (
        <ClockInModal
          shiftId={defaultShift}
          loading={actionLoading}
          onClose={() => setShowClockIn(false)}
          onConfirm={handleClockIn}
        />
      )}
      {showClockOut && (
        <ClockOutModal
          clockInFormatted={attendance?.clockInFormatted ?? null}
          loading={actionLoading}
          onClose={() => setShowClockOut(false)}
          onConfirm={handleClockOut}
        />
      )}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">การเข้างาน</h1>
        <p className="text-sm text-gray-500 mt-1">
          บันทึกและติดตามการเข้า-ออกงาน
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">สถานะวันนี้</h2>
          {today?.holiday && (
            <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded-full font-medium">
              🎌 {today.holiday.name}
            </span>
          )}
        </div>
        {todayLoading ? (
          <div className="space-y-2">
            <div className="h-6 w-48 bg-gray-100 animate-pulse rounded" />
            <div className="h-4 w-32 bg-gray-100 animate-pulse rounded" />
          </div>
        ) : isWhiteCollar ? (
          <p className="text-gray-500 text-sm">
            พนักงาน Office ไม่ต้องสแกนเวลา
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <p className="text-xs text-gray-400 mb-1">สถานะ</p>
              {attendance ? (
                <StatusBadge
                  status={attendance.status}
                  label={attendance.statusLabel}
                />
              ) : (
                <span className="text-sm text-gray-500">ยังไม่ได้เช็คอิน</span>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">เวลาเข้างาน</p>
              <p className="text-sm font-medium text-gray-900">
                {attendance?.clockInFormatted ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">เวลาออกงาน</p>
              <p className="text-sm font-medium text-gray-900">
                {attendance?.clockOutFormatted ?? '—'}
              </p>
            </div>
            {attendance?.workingHours ? (
              <div>
                <p className="text-xs text-gray-400 mb-1">ชั่วโมงงาน</p>
                <p className="text-sm font-medium text-blue-700">
                  {fmtHours(attendance.workingHours)}
                </p>
              </div>
            ) : null}
            {attendance?.lateMinutes && attendance.lateMinutes > 0 ? (
              <div>
                <p className="text-xs text-gray-400 mb-1">สาย</p>
                <p className="text-sm font-medium text-red-600">
                  {fmtMinutes(attendance.lateMinutes)}
                </p>
              </div>
            ) : null}
            {attendance?.overtimeMinutes && attendance.overtimeMinutes > 0 ? (
              <div>
                <p className="text-xs text-gray-400 mb-1">OT</p>
                <p className="text-sm font-medium text-green-600">
                  {fmtMinutes(attendance.overtimeMinutes)}
                </p>
              </div>
            ) : null}
          </div>
        )}
        {!isWhiteCollar && (
          <div className="flex gap-3 mt-5">
            <button
              onClick={() => setShowClockIn(true)}
              disabled={!canClockIn || actionLoading}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              เช็คอิน
            </button>
            <button
              onClick={() => setShowClockOut(true)}
              disabled={!canClockOut || actionLoading}
              className="px-4 py-2 bg-slate-700 text-white text-sm font-medium rounded-xl hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              เช็คเอาท์
            </button>
          </div>
        )}
      </div>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            {
              label: 'มาทำงาน',
              value: `${summary.presentDays} วัน`,
              color: 'text-green-700',
            },
            {
              label: 'ขาดงาน',
              value: `${summary.absentDays} วัน`,
              color: 'text-red-600',
            },
            {
              label: 'มาสาย',
              value: `${summary.lateDays} วัน`,
              color: 'text-yellow-700',
            },
            {
              label: 'OT รวม',
              value: fmtMinutes(summary.totalOvertimeMinutes),
              color: 'text-blue-700',
            },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm"
            >
              <p className="text-xs text-gray-400 mb-1">{kpi.label}</p>
              <p className={`text-lg font-bold ${kpi.color}`}>{kpi.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 p-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900 flex-1">
            ประวัติการเข้างาน
          </h2>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {monthNames.map((name, i) => (
              <option key={i} value={i + 1}>
                {name}
              </option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {[now.getFullYear(), now.getFullYear() - 1].map((y) => (
              <option key={y} value={y}>
                {y + 543}
              </option>
            ))}
          </select>
        </div>
        {historyLoading ? (
          <div className="p-8 text-center text-gray-400">กำลังโหลด...</div>
        ) : !history?.records?.length ? (
          <div className="p-8 text-center text-gray-400">
            ไม่พบข้อมูลในเดือนนี้
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">วันที่</th>
                  <th className="px-4 py-3 text-left">สถานะ</th>
                  <th className="px-4 py-3 text-left">เวลาเข้า</th>
                  <th className="px-4 py-3 text-left">เวลาออก</th>
                  <th className="px-4 py-3 text-right">ชม.งาน</th>
                  <th className="px-4 py-3 text-right">สาย</th>
                  <th className="px-4 py-3 text-right">OT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {history.records.map((rec) => (
                  <tr
                    key={rec.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3 text-gray-900 font-medium whitespace-nowrap">
                      {rec.date}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        status={rec.status}
                        label={rec.statusLabel}
                      />
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {rec.clockInTime
                        ? new Date(rec.clockInTime).toLocaleTimeString(
                            'th-TH',
                            { hour: '2-digit', minute: '2-digit' }
                          )
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {rec.clockOutTime
                        ? new Date(rec.clockOutTime).toLocaleTimeString(
                            'th-TH',
                            { hour: '2-digit', minute: '2-digit' }
                          )
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {rec.workingHours ? fmtHours(rec.workingHours) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {rec.lateMinutes ? (
                        <span className="text-red-600">
                          {fmtMinutes(rec.lateMinutes)}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {rec.overtimeMinutes ? (
                        <span className="text-green-600">
                          {fmtMinutes(rec.overtimeMinutes)}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
