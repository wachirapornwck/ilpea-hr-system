'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import { useAttendance } from '@/lib/hooks/useAttendance';

import { OVERRIDE_SCOPE } from '@/lib/attendance/constants';

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

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

const REASONS = [
  'ลืมสแกน',
  'เครื่องสแกนขัดข้อง',
  'ทำงานนอกสถานที่',
  'เดินทางไปราชการ',
  'ระบบขัดข้อง',
  'อื่นๆ',
];

// หน้านี้ใช้แก้ไขได้เฉพาะพนักงานแผนกนี้เท่านั้น
const REQUIRED_DEPARTMENT = 'Officer';

export default function AttendanceAdjustmentPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { submitAdjustment, actionLoading } = useAttendance();
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    userId: '',
    date: new Date().toISOString().slice(0, 10),
    shiftId: 'DAY',
    clockInTime: '',
    clockOutTime: '',
    reason: REASONS[0],
    comment: '',
  });
  const [deptCheck, setDeptCheck] = useState<{
    checking: boolean;
    departmentName: string | null;
    checkedFor: string;
  }>({ checking: false, departmentName: null, checkedFor: '' });

  useEffect(() => {
    if (user && user.role !== 'hr_manager' && user.role !== 'admin') {
      router.replace('/dashboard');
    }
  }, [user, router]);

  const checkDepartment = async (empId: string) => {
    const id = empId.trim().toUpperCase();
    if (!id || !user?.id) {
      setDeptCheck({ checking: false, departmentName: null, checkedFor: '' });
      return null;
    }
    setDeptCheck({ checking: true, departmentName: null, checkedFor: id });
    try {
      const res = await fetch(`/api/employees/${id}?requesterId=${user.id}`);
      const json = await res.json();
      const departmentName: string | null = json?.success
        ? json.data?.departmentName ?? null
        : null;
      setDeptCheck({ checking: false, departmentName, checkedFor: id });
      return departmentName;
    } catch {
      setDeptCheck({ checking: false, departmentName: null, checkedFor: id });
      return null;
    }
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.userId.trim()) errs.userId = 'กรุณาระบุ Employee ID';
    if (!form.date) errs.date = 'กรุณาระบุวันที่';
    if (!form.clockInTime) errs.clockInTime = 'กรุณาระบุเวลาเข้างาน';
    if (!form.clockOutTime) errs.clockOutTime = 'กรุณาระบุเวลาออกงาน';
    if (!form.comment.trim()) errs.comment = 'กรุณาระบุหมายเหตุ';
    return errs;
  };

  const handleSubmit = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    const targetId = form.userId.trim().toUpperCase();
    const departmentName = await checkDepartment(targetId);
    if (departmentName === null) {
      setErrors({ userId: 'ไม่พบพนักงานคนนี้ในระบบ' });
      return;
    }
    if (departmentName !== REQUIRED_DEPARTMENT) {
      setErrors({
        userId: `หน้านี้ใช้แก้ไขได้เฉพาะพนักงานแผนก ${REQUIRED_DEPARTMENT} เท่านั้น (พนักงานคนนี้อยู่แผนก ${departmentName})`,
      });
      return;
    }

    setErrors({});
    const result = await submitAdjustment({
      userId: targetId,
      date: form.date,
      shiftId: form.shiftId,
      clockInTime: `${form.date}T${form.clockInTime}:00+07:00`,
      clockOutTime: `${form.date}T${form.clockOutTime}:00+07:00`,
      reason: form.reason,
      comment: form.comment.trim(),
    });
    setToast({
      message: result.message,
      type: result.success ? 'success' : 'error',
    });
    if (result.success)
      setForm((p) => ({
        ...p,
        userId: '',
        clockInTime: '',
        clockOutTime: '',
        comment: '',
      }));
  };

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  // -------------------------------------------------------------------------
  // ปรับเวลาทำงานทีเดียวทั้งบริษัท/แผนก/ทีม (Shift Override) — เติมพื้นที่ว่าง
  // ด้านขวา และตอบโจทย์ "ปรับทีเดียวทั้งบริษัท" ตามที่ขอเพิ่ม ใช้ backend เดิม
  // /api/attendance/override ที่มีอยู่แล้ว ไม่ได้สร้างระบบใหม่
  // -------------------------------------------------------------------------
  const [departments, setDepartments] = useState<
    { id: string; name: string }[]
  >([]);
  const [ovScope, setOvScope] = useState<string>(OVERRIDE_SCOPE.DEPARTMENT);
  const [ovScopeId, setOvScopeId] = useState('');
  const [ovDate, setOvDate] = useState(new Date().toISOString().slice(0, 10));
  const [ovStartTime, setOvStartTime] = useState('');
  const [ovEndTime, setOvEndTime] = useState('');
  const [ovReason, setOvReason] = useState('');
  const [ovErrors, setOvErrors] = useState<Record<string, string>>({});
  const [ovLoading, setOvLoading] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    fetch(`/api/departments?requesterId=${user.id}`)
      .then((res) => res.json())
      .then((json) => json.success && setDepartments(json.data))
      .catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    setOvScopeId(ovScope === OVERRIDE_SCOPE.COMPANY ? 'ALL' : '');
  }, [ovScope]);

  const handleOverrideSubmit = async () => {
    const errs: Record<string, string> = {};
    if (!ovScopeId) errs.ovScopeId = 'กรุณาระบุเป้าหมาย';
    if (!ovDate) errs.ovDate = 'กรุณาระบุวันที่';
    if (!ovStartTime) errs.ovStartTime = 'กรุณาระบุเวลาเริ่มงาน';
    if (!ovEndTime) errs.ovEndTime = 'กรุณาระบุเวลาเลิกงาน';
    if (!ovReason.trim()) errs.ovReason = 'กรุณาระบุเหตุผล';
    if (Object.keys(errs).length > 0) {
      setOvErrors(errs);
      return;
    }
    setOvErrors({});
    setOvLoading(true);
    try {
      const res = await fetch('/api/attendance/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: ovScope,
          scopeId: ovScopeId,
          date: ovDate,
          startTime: ovStartTime,
          endTime: ovEndTime,
          reason: ovReason.trim(),
          createdBy: user!.id,
        }),
      });
      const json = await res.json();
      setToast({
        message: json.message || (json.success ? 'สำเร็จ' : 'เกิดข้อผิดพลาด'),
        type: json.success ? 'success' : 'error',
      });
      if (json.success) {
        setOvStartTime('');
        setOvEndTime('');
        setOvReason('');
      }
    } catch (err: any) {
      setToast({ message: err.message || 'เกิดข้อผิดพลาด', type: 'error' });
    } finally {
      setOvLoading(false);
    }
  };

  // ⚠️ ต้องอยู่หลังสุด หลัง hook ทุกตัวถูกเรียกแล้วเท่านั้น — ห้ามวางไว้
  // ก่อนหน้านี้ เพราะจะทำให้จำนวน hook ที่เรียกไม่เท่ากันระหว่าง render
  // (ตอน user ยังไม่โหลด vs โหลดเสร็จแล้ว) ซึ่งเป็นสาเหตุของ error
  // "Rendered more hooks than during the previous render."
  if (!user || (user.role !== 'hr_manager' && user.role !== 'admin')) {
    return null;
  }

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
        <h1 className="text-2xl font-bold text-gray-900">
          แก้ไขข้อมูลการเข้างาน
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          HR / Admin เท่านั้น — ทุกการแก้ไขจะถูกบันทึก Audit Log
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            แก้ไขเป็นรายบุคคล
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Employee ID" error={errors.userId}>
              <input
                type="text"
                value={form.userId}
                onChange={(e) => set('userId', e.target.value)}
                onBlur={(e) => checkDepartment(e.target.value)}
                placeholder="EMP001"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {deptCheck.checking && (
                <p className="text-xs text-gray-400 mt-1">
                  กำลังตรวจสอบแผนก...
                </p>
              )}
              {!deptCheck.checking && deptCheck.departmentName && (
                <p
                  className={`text-xs mt-1 ${
                    deptCheck.departmentName === REQUIRED_DEPARTMENT
                      ? 'text-green-600'
                      : 'text-red-500'
                  }`}
                >
                  แผนก: {deptCheck.departmentName}
                  {deptCheck.departmentName !== REQUIRED_DEPARTMENT &&
                    ` (ต้องเป็นแผนก ${REQUIRED_DEPARTMENT})`}
                </p>
              )}
            </Field>

            <Field label="วันที่" error={errors.date}>
              <input
                type="date"
                value={form.date}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => set('date', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </Field>

            <Field label="กะการทำงาน">
              <select
                value={form.shiftId}
                onChange={(e) => set('shiftId', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="DAY">กะเช้า (08:00–17:00)</option>
                <option value="NIGHT">กะดึก (20:00–05:00)</option>
                <option value="MAID">กะแม่บ้าน (07:00–16:00)</option>
              </select>
            </Field>

            <Field label="เหตุผล">
              <select
                value={form.reason}
                onChange={(e) => set('reason', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="เวลาเข้างาน" error={errors.clockInTime}>
              <input
                type="time"
                value={form.clockInTime}
                onChange={(e) => set('clockInTime', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </Field>

            <Field label="เวลาออกงาน" error={errors.clockOutTime}>
              <input
                type="time"
                value={form.clockOutTime}
                onChange={(e) => set('clockOutTime', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </Field>

            <div className="sm:col-span-2">
              <Field label="หมายเหตุ" error={errors.comment}>
                <textarea
                  value={form.comment}
                  onChange={(e) => set('comment', e.target.value)}
                  rows={3}
                  placeholder="อธิบายรายละเอียดการแก้ไข..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
                <p className="text-xs text-gray-400 mt-1">
                  {form.comment.length} ตัวอักษร
                </p>
              </Field>
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={() => router.back()}
              className="px-4 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50"
            >
              ยกเลิก
            </button>
            <button
              onClick={handleSubmit}
              disabled={actionLoading}
              className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50"
            >
              {actionLoading ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-4">
            การแก้ไขนี้จะถูกบันทึกใน Audit Log พร้อม timestamp และ Employee ID
            ของคุณ
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          <h2 className="text-base font-semibold text-gray-900 mb-1">
            ปรับเวลาทำงานทีเดียวทั้งบริษัท/แผนก/ทีม
          </h2>
          <p className="text-xs text-gray-500 mb-4">
            ใช้เมื่อเวลาเข้า-ออกงานเปลี่ยนพร้อมกันหลายคน เช่น
            เลิกงานเร็วทั้งบริษัทในวันพิเศษ — ไม่ต้องแก้ทีละคน
          </p>

          <div className="space-y-4">
            <Field label="ขอบเขต">
              <select
                value={ovScope}
                onChange={(e) => setOvScope(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={OVERRIDE_SCOPE.COMPANY}>ทั้งบริษัท</option>
                <option value={OVERRIDE_SCOPE.DEPARTMENT}>ทั้งแผนก</option>
              </select>
            </Field>

            {ovScope === OVERRIDE_SCOPE.DEPARTMENT && (
              <Field label="เลือกแผนก" error={ovErrors.ovScopeId}>
                <select
                  value={ovScopeId}
                  onChange={(e) => setOvScopeId(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">เลือกแผนก</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="วันที่" error={ovErrors.ovDate}>
                <input
                  type="date"
                  value={ovDate}
                  onChange={(e) => setOvDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </Field>
              <Field label="เวลาเข้างาน" error={ovErrors.ovStartTime}>
                <input
                  type="time"
                  value={ovStartTime}
                  onChange={(e) => setOvStartTime(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </Field>
              <Field label="เวลาเลิกงาน" error={ovErrors.ovEndTime}>
                <input
                  type="time"
                  value={ovEndTime}
                  onChange={(e) => setOvEndTime(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </Field>
            </div>

            <Field label="เหตุผล" error={ovErrors.ovReason}>
              <textarea
                value={ovReason}
                onChange={(e) => setOvReason(e.target.value)}
                rows={2}
                placeholder="เช่น วันหยุดพิเศษบริษัท, เหตุสุดวิสัย"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </Field>
          </div>

          <div className="mt-6">
            <button
              onClick={handleOverrideSubmit}
              disabled={ovLoading}
              className="w-full px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50"
            >
              {ovLoading ? 'กำลังบันทึก...' : 'ปรับเวลาให้ทั้งกลุ่ม'}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-4">
            มีผลเฉพาะวันที่ระบุเท่านั้น ไม่กระทบเวลากะมาตรฐานถาวร
          </p>
        </div>
      </div>
    </div>
  );
}
