'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import { useEmployeeCreate } from '@/lib/hooks/useEmployees';
import type {
  CreateEmployeePayload,
  Department,
  Position,
  TitlePrefix,
} from '@/types';

type FormData = Omit<CreateEmployeePayload, 'pin' | 'titlePrefix'> & {
  pin: string;
  confirmPin: string;
  titlePrefix: '' | TitlePrefix; // '' = not selected yet (UI-only state)
};

const INITIAL_FORM: FormData = {
  employeeId: '',
  firstNameEN: '',
  lastNameEN: '',
  firstNameTH: '',
  lastNameTH: '',
  nickname: '',
  gender: 'male',
  role: 'employee',
  employeeType: 'blue_collar',
  positionId: '',
  departmentId: '',
  shiftId: 'DAY',
  startDate: new Date().toISOString().split('T')[0],
  phone: '',
  lineId: '',
  address: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  emergencyContactRelation: '',
  // ── Schema v2 ──
  titlePrefix: '',
  titlePrefixOther: '',
  dateOfBirth: '',
  probationEndDate: '',
  terminationDate: '',
  hrRemark: '',
  pin: '',
  confirmPin: '',
};

function cls(error?: string): string {
  const base =
    'w-full px-3 py-2 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-colors';
  if (error) return base + ' border-red-300 focus:ring-red-400';
  return base + ' border-gray-200 focus:ring-blue-500';
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
      <h4 className="text-sm font-semibold text-gray-900 mb-4">{title}</h4>
      {children}
    </div>
  );
}

function FormField({
  label,
  error,
  children,
  className,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

export default function NewEmployeePage() {
  const { user } = useAuth();
  const router = useRouter();
  const { create, loading } = useEmployeeCreate();

  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>(
    {}
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  // ── Master Data ─────────────────────────────────────────────────────────
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loadingDepts, setLoadingDepts] = useState(false);
  const [loadingPositions, setLoadingPositions] = useState(false);

  // โหลด departments เมื่อเปิดหน้า
  useEffect(() => {
    if (!user?.id) return;
    setLoadingDepts(true);
    fetch(`/api/departments?requesterId=${user.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setDepartments(data.data);
      })
      .catch(console.error)
      .finally(() => setLoadingDepts(false));
  }, [user?.id]);

  // โหลด positions เมื่อ departmentId เปลี่ยน
  const loadPositions = useCallback(
    (departmentId: string) => {
      if (!user?.id || !departmentId) {
        setPositions([]);
        return;
      }
      setLoadingPositions(true);
      fetch(
        `/api/positions?requesterId=${user.id}&departmentId=${departmentId}&active=true`
      )
        .then((r) => r.json())
        .then((data) => {
          if (data.success) setPositions(data.data);
        })
        .catch(console.error)
        .finally(() => setLoadingPositions(false));
    },
    [user?.id]
  );

  const isHR = user?.role === 'admin' || user?.role === 'hr_manager';

  if (!isHR) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400 text-sm">ไม่มีสิทธิ์เข้าถึงหน้านี้</p>
        <button
          onClick={() => router.back()}
          className="mt-4 text-blue-600 text-sm hover:underline"
        >
          ← กลับ
        </button>
      </div>
    );
  }

  const set = (field: keyof FormData, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'employeeType') {
        next.shiftId = value === 'white_collar' ? '' : 'DAY';
      }
      if (field === 'departmentId') {
        next.positionId = '';
        loadPositions(value);
      }
      return next;
    });
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const validate = (): boolean => {
    const e: Partial<Record<keyof FormData, string>> = {};
    if (!form.employeeId.trim()) e.employeeId = 'กรุณากรอกรหัสพนักงาน';
    if (!form.firstNameEN.trim()) e.firstNameEN = 'กรุณากรอกชื่อ (EN)';
    if (!form.lastNameEN.trim()) e.lastNameEN = 'กรุณากรอกนามสกุล (EN)';
    if (!form.firstNameTH.trim()) e.firstNameTH = 'กรุณากรอกชื่อ (TH)';
    if (!form.lastNameTH.trim()) e.lastNameTH = 'กรุณากรอกนามสกุล (TH)';
    if (!form.departmentId) e.departmentId = 'กรุณาเลือกแผนก';
    if (!form.positionId) e.positionId = 'กรุณาเลือกตำแหน่ง';
    if (!form.startDate) e.startDate = 'กรุณากรอกวันเริ่มงาน';
    if (!form.pin || !/^\d{6}$/.test(form.pin))
      e.pin = 'PIN ต้องเป็นตัวเลข 6 หลัก';
    if (form.pin !== form.confirmPin) e.confirmPin = 'PIN ไม่ตรงกัน';
    // Schema v2 — only client validation needed per Phase C scope; date
    // format/business-rule validation is already handled server-side.
    if (form.titlePrefix === 'other' && !form.titlePrefixOther?.trim()) {
      e.titlePrefixOther = 'กรุณากรอกคำนำหน้า';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitError(null);
    setSubmitSuccess(null);

    const { confirmPin, ...payload } = form;
    const result = await create({
      ...payload,
      employeeId: payload.employeeId.toUpperCase(),
      shiftId: payload.shiftId || null,
      nickname: payload.nickname || undefined,
      phone: payload.phone || undefined,
      lineId: payload.lineId || undefined,
      address: payload.address || undefined,
      emergencyContactName: payload.emergencyContactName || undefined,
      emergencyContactPhone: payload.emergencyContactPhone || undefined,
      emergencyContactRelation: payload.emergencyContactRelation || undefined,
      // ── Schema v2 — same "send undefined when not set" pattern as the
      // fields above; titlePrefixOther mirrors Phase B's server-side rule
      // (only kept when titlePrefix === 'other', trimmed).
      titlePrefix: payload.titlePrefix || undefined,
      titlePrefixOther:
        payload.titlePrefix === 'other'
          ? payload.titlePrefixOther?.trim()
          : undefined,
      dateOfBirth: payload.dateOfBirth || undefined,
      probationEndDate: payload.probationEndDate || undefined,
      terminationDate: payload.terminationDate || undefined,
      hrRemark: payload.hrRemark || undefined,
    });

    if (result.success) {
      setSubmitSuccess(result.message);
      setTimeout(() => {
        router.push('/employees/' + result.id);
      }, 1200);
    } else {
      setSubmitError(result.message);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <button
            onClick={() => router.push('/employees')}
            className="hover:text-blue-600 transition-colors"
          >
            พนักงาน
          </button>
          <span>/</span>
          <span className="text-gray-900 font-medium">เพิ่มพนักงานใหม่</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => router.back()}
            disabled={loading}
            className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </div>

      {submitSuccess && (
        <div className="mb-4 px-4 py-3 bg-green-50 text-green-700 text-sm rounded-xl">
          {submitSuccess}
        </div>
      )}
      {submitError && (
        <div className="mb-4 px-4 py-3 bg-red-50 text-red-600 text-sm rounded-xl">
          {submitError}
        </div>
      )}

      <div className="space-y-4">
        {/* ข้อมูลพื้นฐาน */}
        <Section title="ข้อมูลพื้นฐาน">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="รหัสพนักงาน *" error={errors.employeeId}>
              <input
                value={form.employeeId}
                onChange={(e) =>
                  set('employeeId', e.target.value.toUpperCase())
                }
                placeholder="EMP030"
                className={cls(errors.employeeId)}
              />
            </FormField>
            <FormField label="เพศ">
              <select
                value={form.gender}
                onChange={(e) => set('gender', e.target.value)}
                className={cls()}
              >
                <option value="male">ชาย</option>
                <option value="female">หญิง</option>
              </select>
            </FormField>
            <FormField label="ชื่อ (EN) *" error={errors.firstNameEN}>
              <input
                value={form.firstNameEN}
                onChange={(e) => set('firstNameEN', e.target.value)}
                placeholder="Somchai"
                className={cls(errors.firstNameEN)}
              />
            </FormField>
            <FormField label="นามสกุล (EN) *" error={errors.lastNameEN}>
              <input
                value={form.lastNameEN}
                onChange={(e) => set('lastNameEN', e.target.value)}
                placeholder="Jaidee"
                className={cls(errors.lastNameEN)}
              />
            </FormField>
            <FormField label="ชื่อ (TH) *" error={errors.firstNameTH}>
              <input
                value={form.firstNameTH}
                onChange={(e) => set('firstNameTH', e.target.value)}
                placeholder="สมชาย"
                className={cls(errors.firstNameTH)}
              />
            </FormField>
            <FormField label="นามสกุล (TH) *" error={errors.lastNameTH}>
              <input
                value={form.lastNameTH}
                onChange={(e) => set('lastNameTH', e.target.value)}
                placeholder="ใจดี"
                className={cls(errors.lastNameTH)}
              />
            </FormField>
            <FormField label="ชื่อเล่น">
              <input
                value={form.nickname}
                onChange={(e) => set('nickname', e.target.value)}
                placeholder="ชาย"
                className={cls()}
              />
            </FormField>
            <FormField label="วันเริ่มงาน *" error={errors.startDate}>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => set('startDate', e.target.value)}
                className={cls(errors.startDate)}
              />
            </FormField>
            {/* ── Schema v2 ── */}
            <FormField label="คำนำหน้า">
              <select
                value={form.titlePrefix}
                onChange={(e) => set('titlePrefix', e.target.value)}
                className={cls()}
              >
                <option value="">— เลือกคำนำหน้า —</option>
                <option value="mr">นาย</option>
                <option value="mrs">นาง</option>
                <option value="miss">นางสาว</option>
                <option value="other">อื่นๆ</option>
              </select>
            </FormField>
            {form.titlePrefix === 'other' && (
              <FormField label="ระบุคำนำหน้า" error={errors.titlePrefixOther}>
                <input
                  value={form.titlePrefixOther}
                  onChange={(e) => set('titlePrefixOther', e.target.value)}
                  placeholder="กรอกคำนำหน้า"
                  className={cls(errors.titlePrefixOther)}
                />
              </FormField>
            )}
            <FormField label="วันเกิด">
              <input
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => set('dateOfBirth', e.target.value)}
                className={cls()}
              />
            </FormField>
          </div>
        </Section>

        {/* ข้อมูลการทำงาน */}
        <Section title="ข้อมูลการทำงาน">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="แผนก *" error={errors.departmentId}>
              <select
                value={form.departmentId}
                onChange={(e) => set('departmentId', e.target.value)}
                disabled={loadingDepts}
                className={cls(errors.departmentId)}
              >
                <option value="">
                  {loadingDepts ? 'กำลังโหลด...' : '— เลือกแผนก —'}
                </option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="ตำแหน่ง *" error={errors.positionId}>
              <select
                value={form.positionId}
                onChange={(e) => set('positionId', e.target.value)}
                disabled={!form.departmentId || loadingPositions}
                className={cls(errors.positionId)}
              >
                <option value="">
                  {loadingPositions ? 'กำลังโหลด...' : '— เลือกตำแหน่ง —'}
                </option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="ประเภทพนักงาน">
              <select
                value={form.employeeType}
                onChange={(e) => set('employeeType', e.target.value)}
                className={cls()}
              >
                <option value="blue_collar">Blue Collar</option>
                <option value="white_collar">White Collar</option>
              </select>
            </FormField>
            <FormField label="กะ">
              <select
                value={form.shiftId ?? ''}
                onChange={(e) => set('shiftId', e.target.value)}
                disabled={form.employeeType === 'white_collar'}
                className={cls()}
              >
                <option value="">— (White Collar) —</option>
                <option value="DAY">กะเช้า (08:00–17:00)</option>
                <option value="NIGHT">กะดึก (20:00–05:00)</option>
                <option value="MAID">กะแม่บ้าน (07:30–16:30)</option>
              </select>
            </FormField>
            <FormField label="บทบาท">
              <select
                value={form.role}
                onChange={(e) => set('role', e.target.value)}
                className={cls()}
              >
                <option value="employee">พนักงาน</option>
                <option value="manager">ผู้จัดการ</option>
                <option value="hr_manager">HR Manager</option>
                <option value="admin">Admin</option>
              </select>
            </FormField>
            {/* ── Schema v2 ── */}
            <FormField label="วันที่ผ่านทดลองงาน">
              <input
                type="date"
                value={form.probationEndDate}
                onChange={(e) => set('probationEndDate', e.target.value)}
                className={cls()}
              />
            </FormField>
            <FormField label="วันที่สิ้นสุดการทำงาน">
              <input
                type="date"
                value={form.terminationDate}
                onChange={(e) => set('terminationDate', e.target.value)}
                className={cls()}
              />
            </FormField>
          </div>
        </Section>

        {/* ข้อมูลติดต่อ */}
        <Section title="ข้อมูลติดต่อ">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="เบอร์โทรศัพท์">
              <input
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="0812345678"
                className={cls()}
              />
            </FormField>
            <FormField label="LINE ID">
              <input
                value={form.lineId}
                onChange={(e) => set('lineId', e.target.value)}
                placeholder="line_id"
                className={cls()}
              />
            </FormField>
            <FormField label="ที่อยู่" className="sm:col-span-2">
              <textarea
                value={form.address}
                onChange={(e) => set('address', e.target.value)}
                rows={2}
                className={cls() + ' resize-none'}
              />
            </FormField>
            {/* ── Schema v2 ── */}
            <FormField label="HR Remark" className="sm:col-span-2">
              <textarea
                value={form.hrRemark}
                onChange={(e) => set('hrRemark', e.target.value)}
                rows={2}
                className={cls() + ' resize-none'}
              />
            </FormField>
          </div>
        </Section>

        {/* ผู้ติดต่อฉุกเฉิน */}
        <Section title="ผู้ติดต่อฉุกเฉิน">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="ชื่อ">
              <input
                value={form.emergencyContactName}
                onChange={(e) => set('emergencyContactName', e.target.value)}
                className={cls()}
              />
            </FormField>
            <FormField label="ความสัมพันธ์">
              <input
                value={form.emergencyContactRelation}
                onChange={(e) =>
                  set('emergencyContactRelation', e.target.value)
                }
                placeholder="พ่อ / แม่ / คู่สมรส"
                className={cls()}
              />
            </FormField>
            <FormField label="เบอร์โทร">
              <input
                value={form.emergencyContactPhone}
                onChange={(e) => set('emergencyContactPhone', e.target.value)}
                placeholder="0812345678"
                className={cls()}
              />
            </FormField>
          </div>
        </Section>

        {/* PIN */}
        <Section title="ตั้ง PIN เริ่มต้น">
          <p className="text-xs text-gray-400 mb-4">
            พนักงานจะถูกบังคับเปลี่ยน PIN เมื่อเข้าสู่ระบบครั้งแรก
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="PIN (6 หลัก) *" error={errors.pin}>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={form.pin}
                onChange={(e) => set('pin', e.target.value.replace(/\D/g, ''))}
                placeholder="••••••"
                className={cls(errors.pin)}
              />
            </FormField>
            <FormField label="ยืนยัน PIN *" error={errors.confirmPin}>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={form.confirmPin}
                onChange={(e) =>
                  set('confirmPin', e.target.value.replace(/\D/g, ''))
                }
                placeholder="••••••"
                className={cls(errors.confirmPin)}
              />
            </FormField>
          </div>
        </Section>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button
          onClick={() => router.back()}
          disabled={loading}
          className="px-6 py-2.5 text-sm text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50"
        >
          ยกเลิก
        </button>
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="px-6 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {loading ? 'กำลังบันทึก...' : 'เพิ่มพนักงาน'}
        </button>
      </div>
    </div>
  );
}
