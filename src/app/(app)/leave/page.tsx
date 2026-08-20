'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth/context';
import type { LeaveType } from '@/types/leave';

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
    const t = setTimeout(onClose, 4500);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div
      className={`fixed bottom-6 right-6 z-50 max-w-sm px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-start gap-2 ${
        type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
      }`}
    >
      <span>{type === 'success' ? '✓' : '✕'}</span>
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="opacity-70 hover:opacity-100">
        ×
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: 'รออนุมัติ', cls: 'bg-yellow-100 text-yellow-700' },
    approved: { label: 'อนุมัติแล้ว', cls: 'bg-green-100 text-green-700' },
    rejected: { label: 'ปฏิเสธ', cls: 'bg-red-100 text-red-600' },
    cancelled: { label: 'ยกเลิกแล้ว', cls: 'bg-gray-100 text-gray-500' },
    submitted: { label: 'ยื่นแล้ว', cls: 'bg-blue-100 text-blue-600' },
  };
  const s = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-500' };
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}
    >
      {s.label}
    </span>
  );
}

interface LeaveRequestItem {
  id: string;
  userId: string;
  leaveTypeCode: string;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  duration: { calendarDays: number };
  reason: string;
  status: string;
  createdAt: string;
}

export default function LeavePage() {
  const { user } = useAuth();
  const isHR = user?.role === 'hr_manager' || user?.role === 'admin';

  const [tab, setTab] = useState<'submit' | 'approvals'>('submit');
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);

  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [loadingBalances, setLoadingBalances] = useState(false);

  const [form, setForm] = useState({
    leaveTypeId: '',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
    reason: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [myRequests, setMyRequests] = useState<LeaveRequestItem[]>([]);
  const [loadingMyRequests, setLoadingMyRequests] = useState(false);

  const [pendingRequests, setPendingRequests] = useState<LeaveRequestItem[]>(
    []
  );
  const [loadingPending, setLoadingPending] = useState(false);
  const [remarkDrafts, setRemarkDrafts] = useState<Record<string, string>>({});
  const [actingOnId, setActingOnId] = useState<string | null>(null);

  // ── load leave types ──────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    fetch(`/api/leave-types?requesterId=${user.id}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setLeaveTypes(
            json.data.filter((lt: LeaveType) => lt.active !== false)
          );
        }
      })
      .catch(() => {});
  }, [user?.id]);

  // ── load own balance ──────────────────────────────────────
  const fetchBalances = useCallback(async () => {
    if (!user?.id) return;
    setLoadingBalances(true);
    try {
      const res = await fetch(`/api/leave-balances?requesterId=${user.id}`);
      const json = await res.json();
      if (json.success) setBalances(json.data.balances || {});
    } finally {
      setLoadingBalances(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  // ── load own leave requests ───────────────────────────────
  const fetchMyRequests = useCallback(async () => {
    if (!user?.id) return;
    setLoadingMyRequests(true);
    try {
      const res = await fetch(`/api/leave-requests?requesterId=${user.id}`);
      const json = await res.json();
      if (json.success) setMyRequests(json.data);
    } finally {
      setLoadingMyRequests(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchMyRequests();
  }, [fetchMyRequests]);

  // ── load pending approvals (HR only) ──────────────────────
  const fetchPending = useCallback(async () => {
    if (!user?.id || !isHR) return;
    setLoadingPending(true);
    try {
      const res = await fetch(
        `/api/leave-requests?requesterId=${user.id}&status=pending`
      );
      const json = await res.json();
      if (json.success) setPendingRequests(json.data);
    } finally {
      setLoadingPending(false);
    }
  }, [user?.id, isHR]);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  const selectedLeaveType = leaveTypes.find((lt) => lt.id === form.leaveTypeId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;
    const errs: Record<string, string> = {};
    if (!form.leaveTypeId) errs.leaveTypeId = 'กรุณาเลือกประเภทการลา';
    if (!form.startDate) errs.startDate = 'กรุณาระบุวันที่เริ่ม';
    if (!form.endDate) errs.endDate = 'กรุณาระบุวันที่สิ้นสุด';
    if (!form.reason.trim()) errs.reason = 'กรุณาระบุเหตุผล';
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const res = await fetch('/api/leave-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterId: user.id, ...form }),
      });
      const json = await res.json();
      if (json.success) {
        setToast({
          message: json.warning
            ? `${json.message} — ⚠ ${json.warning}`
            : json.message,
          type: 'success',
        });
        setForm((p) => ({ ...p, reason: '' }));
        fetchMyRequests();
      } else {
        setToast({
          message: json.error?.message ?? 'เกิดข้อผิดพลาด',
          type: 'error',
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelMyRequest = async (id: string) => {
    if (!user?.id) return;
    setActingOnId(id);
    try {
      const res = await fetch(`/api/leave-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterId: user.id, action: 'cancel' }),
      });
      const json = await res.json();
      setToast({
        message: json.success
          ? json.message
          : json.error?.message ?? 'เกิดข้อผิดพลาด',
        type: json.success ? 'success' : 'error',
      });
      if (json.success) fetchMyRequests();
    } finally {
      setActingOnId(null);
    }
  };

  const handleApprovalAction = async (
    id: string,
    action: 'approve' | 'reject'
  ) => {
    if (!user?.id) return;
    setActingOnId(id);
    try {
      const res = await fetch(`/api/leave-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requesterId: user.id,
          action,
          remark: remarkDrafts[id] || undefined,
        }),
      });
      const json = await res.json();
      setToast({
        message: json.success
          ? json.message
          : json.error?.message ?? 'เกิดข้อผิดพลาด',
        type: json.success ? 'success' : 'error',
      });
      if (json.success) {
        fetchPending();
        fetchBalances();
      }
    } finally {
      setActingOnId(null);
    }
  };

  return (
    <div>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">การลา</h1>
        <p className="text-sm text-gray-500 mt-1">
          ยื่นใบลาและติดตามสถานะการอนุมัติ
        </p>
      </div>

      {isHR && (
        <div className="flex gap-2 mb-6 border-b border-gray-200">
          <button
            onClick={() => setTab('submit')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'submit'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            ยื่นใบลาของฉัน
          </button>
          <button
            onClick={() => setTab('approvals')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'approvals'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            รออนุมัติ
            {pendingRequests.length > 0 ? ` (${pendingRequests.length})` : ''}
          </button>
        </div>
      )}

      {tab === 'submit' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* ฟอร์มยื่นใบลา */}
          <form
            onSubmit={handleSubmit}
            className="xl:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4"
          >
            <h2 className="text-sm font-semibold text-gray-900">
              ยื่นใบลาใหม่
            </h2>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                ประเภทการลา *
              </label>
              <select
                value={form.leaveTypeId}
                onChange={(e) =>
                  setForm((p) => ({ ...p, leaveTypeId: e.target.value }))
                }
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">เลือกประเภทการลา</option>
                {leaveTypes.map((lt) => (
                  <option key={lt.id} value={lt.id}>
                    {lt.name}{' '}
                    {balances[lt.code] !== undefined
                      ? `(เหลือ ${balances[lt.code]} วัน)`
                      : ''}
                  </option>
                ))}
              </select>
              {errors.leaveTypeId && (
                <p className="text-xs text-red-500 mt-1">
                  {errors.leaveTypeId}
                </p>
              )}
              {selectedLeaveType && (
                <p className="text-xs text-gray-400 mt-1">
                  ต้องยื่นล่วงหน้า {selectedLeaveType.advanceNoticeDays} วัน
                  {selectedLeaveType.requiresAttachment !== 'never' &&
                    ` · ต้องมีหลักฐาน${
                      selectedLeaveType.attachmentCondition
                        ? ` (${selectedLeaveType.attachmentCondition})`
                        : ''
                    }`}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  วันที่เริ่ม *
                </label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, startDate: e.target.value }))
                  }
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {errors.startDate && (
                  <p className="text-xs text-red-500 mt-1">
                    {errors.startDate}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  วันที่สิ้นสุด *
                </label>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, endDate: e.target.value }))
                  }
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {errors.endDate && (
                  <p className="text-xs text-red-500 mt-1">{errors.endDate}</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                เหตุผล *
              </label>
              <textarea
                value={form.reason}
                onChange={(e) =>
                  setForm((p) => ({ ...p, reason: e.target.value }))
                }
                rows={3}
                placeholder="ระบุเหตุผลการลา..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              {errors.reason && (
                <p className="text-xs text-red-500 mt-1">{errors.reason}</p>
              )}
            </div>

            <p className="text-xs text-gray-400">
              ⚠️ การแนบไฟล์หลักฐานยังไม่รองรับในระบบตอนนี้ —
              กรุณาส่งหลักฐานให้ฝ่ายบุคคลแยกต่างหาก
            </p>

            <button
              type="submit"
              disabled={submitting}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
            >
              {submitting ? 'กำลังยื่น...' : 'ยื่นใบลา'}
            </button>
          </form>

          {/* สรุปวันลาคงเหลือ */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">
              วันลาคงเหลือ
            </h2>
            {loadingBalances ? (
              <p className="text-sm text-gray-400">กำลังโหลด...</p>
            ) : leaveTypes.length === 0 ? (
              <p className="text-sm text-gray-400">ยังไม่มีประเภทการลาในระบบ</p>
            ) : (
              <div className="space-y-2">
                {leaveTypes.map((lt) => (
                  <div key={lt.id} className="flex justify-between text-sm">
                    <span className="text-gray-600">{lt.name}</span>
                    <span className="font-medium text-gray-900">
                      {balances[lt.code] !== undefined
                        ? `${balances[lt.code]} วัน`
                        : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {Object.keys(balances).length === 0 && !loadingBalances && (
              <p className="text-xs text-gray-400 mt-3">
                ยังไม่มีการตั้งค่ายอดวันลาสำหรับปีนี้ — ติดต่อฝ่ายบุคคล
              </p>
            )}
          </div>
        </div>
      )}

      {tab === 'submit' && (
        <div className="mt-6 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <h2 className="text-sm font-semibold text-gray-900 px-6 pt-6 pb-2">
            ประวัติการลาของฉัน
          </h2>
          {loadingMyRequests ? (
            <p className="text-sm text-gray-400 px-6 pb-6">กำลังโหลด...</p>
          ) : myRequests.length === 0 ? (
            <p className="text-sm text-gray-400 px-6 pb-6">
              ยังไม่มีประวัติการลา
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500">
                    ประเภท
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500">
                    วันที่
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500">
                    จำนวนวัน
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500">
                    สถานะ
                  </th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {myRequests.map((r) => (
                  <tr key={r.id}>
                    <td className="px-6 py-3 font-medium text-gray-900">
                      {r.leaveTypeName}
                    </td>
                    <td className="px-6 py-3 text-gray-600">
                      {r.startDate} — {r.endDate}
                    </td>
                    <td className="px-6 py-3 text-gray-600">
                      {r.duration.calendarDays} วัน
                    </td>
                    <td className="px-6 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-6 py-3 text-right">
                      {r.status === 'pending' && (
                        <button
                          onClick={() => handleCancelMyRequest(r.id)}
                          disabled={actingOnId === r.id}
                          className="text-xs text-red-600 hover:underline disabled:opacity-50"
                        >
                          ยกเลิก
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'approvals' && isHR && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <h2 className="text-sm font-semibold text-gray-900 px-6 pt-6 pb-2">
            รายการรออนุมัติ
          </h2>
          {loadingPending ? (
            <p className="text-sm text-gray-400 px-6 pb-6">กำลังโหลด...</p>
          ) : pendingRequests.length === 0 ? (
            <p className="text-sm text-gray-400 px-6 pb-6">
              ไม่มีรายการรออนุมัติ
            </p>
          ) : (
            <div className="divide-y divide-gray-50">
              {pendingRequests.map((r) => (
                <div key={r.id} className="p-6">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {r.leaveTypeName} — {r.userId}
                      </p>
                      <p className="text-xs text-gray-500">
                        {r.startDate} — {r.endDate} ({r.duration.calendarDays}{' '}
                        วัน)
                      </p>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="text-sm text-gray-600 mb-3">{r.reason}</p>
                  <input
                    placeholder="หมายเหตุ (ไม่บังคับ)"
                    value={remarkDrafts[r.id] ?? ''}
                    onChange={(e) =>
                      setRemarkDrafts((p) => ({ ...p, [r.id]: e.target.value }))
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprovalAction(r.id, 'approve')}
                      disabled={actingOnId === r.id}
                      className="px-4 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      อนุมัติ
                    </button>
                    <button
                      onClick={() => handleApprovalAction(r.id, 'reject')}
                      disabled={actingOnId === r.id}
                      className="px-4 py-1.5 bg-red-50 text-red-600 text-xs font-medium rounded-lg hover:bg-red-100 disabled:opacity-50"
                    >
                      ปฏิเสธ
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
