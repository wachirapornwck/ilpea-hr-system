'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import { useEmployeeDetail } from '@/lib/hooks/useEmployees';
import type {
  UpdateEmployeePayload,
  Department,
  Position,
  ProductionLine,
} from '@/types';
import type { LeaveType } from '@/types/leave';

const EMPLOYEE_TYPE_LABEL: Record<string, string> = {
  blue_collar: 'Blue Collar',
  white_collar: 'White Collar',
};
const SHIFT_LABEL: Record<string, string> = {
  DAY: 'กะเช้า (08:00–17:00)',
  NIGHT: 'กะดึก (20:00–05:00)',
  MAID: 'กะแม่บ้าน (07:30–16:30)',
};
const ROLE_LABEL: Record<string, string> = {
  employee: 'พนักงาน',
  manager: 'ผู้จัดการ',
  hr_manager: 'HR Manager',
  admin: 'Admin',
};
const TITLE_PREFIX_LABEL: Record<string, string> = {
  mr: 'นาย',
  mrs: 'นาง',
  miss: 'นางสาว',
  other: 'อื่นๆ',
};
const STATUS_CLASS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-red-100 text-red-600',
};
const STATUS_LABEL: Record<string, string> = {
  active: 'ปกติ',
  inactive: 'ระงับแล้ว',
};

// ── Phase IA-1: Age (computed, display-only, never persisted) ──
function calculateAge(dateOfBirth?: string): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

// ── Employment Information: Probation & Eligibility (computed, display-only,
// never persisted). Confirmed business rules:
// - Probation period: 90 calendar days from Start Date (first actual working
//   day, not contract signing date). Calendar days include weekends/holidays.
// - Annual leave eligibility: 119 calendar days from Start Date, same rule.
const PROBATION_DAYS = 90;
const LEAVE_ELIGIBILITY_DAYS = 119;

function addCalendarDays(dateStr: string, days: number): Date | null {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  return d;
}

function calculateYearsOfService(startDate?: string): number | null {
  if (!startDate) return null;
  const start = new Date(startDate);
  if (isNaN(start.getTime())) return null;
  const today = new Date();
  let years = today.getFullYear() - start.getFullYear();
  const monthDiff = today.getMonth() - start.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < start.getDate())) {
    years--;
  }
  return years;
}

interface PageProps {
  params: { id: string };
}

export default function EmployeeDetailPage({ params }: PageProps) {
  const { user } = useAuth();
  const router = useRouter();
  const isHR = user?.role === 'admin' || user?.role === 'hr_manager';

  const { employee, loading, error, update, disable } = useEmployeeDetail(
    params.id
  );

  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<UpdateEmployeePayload>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);
  const [disableReason, setDisableReason] = useState('');
  const [disabling, setDisabling] = useState(false);

  const [showChangePIN, setShowChangePIN] = useState(false);
  const [pinData, setPinData] = useState({
    currentPin: '',
    newPin: '',
    confirmPin: '',
  });
  const [changingPIN, setChangingPIN] = useState(false);
  const [pinMsg, setPinMsg] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [productionLines, setProductionLines] = useState<ProductionLine[]>([]);
  const [loadingDepts, setLoadingDepts] = useState(false);
  const [loadingPositions, setLoadingPositions] = useState(false);
  const [loadingLines, setLoadingLines] = useState(false);

  // Leave balance summary card — same GET /api/leave-balances endpoint used
  // by /leave and /leave-balances, filtered to this employee + current year.
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [leaveBalances, setLeaveBalances] = useState<Record<string, number>>(
    {}
  );
  const [loadingLeaveBalance, setLoadingLeaveBalance] = useState(true);
  const CURRENT_YEAR = new Date().getFullYear();

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

  useEffect(() => {
    if (!user?.id) return;
    setLoadingLines(true);
    fetch(`/api/production-lines?requesterId=${user.id}&active=true`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setProductionLines(data.data);
      })
      .catch(console.error)
      .finally(() => setLoadingLines(false));
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    fetch(`/api/leave-types?requesterId=${user.id}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setLeaveTypes(
            (json.data as LeaveType[])
              .filter((lt) => lt.active !== false)
              .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
          );
        }
      })
      .catch(console.error);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !params.id) return;
    setLoadingLeaveBalance(true);
    fetch(
      `/api/leave-balances?requesterId=${user.id}&userId=${params.id}&year=${CURRENT_YEAR}`
    )
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setLeaveBalances(json.data.balances || {});
      })
      .catch(console.error)
      .finally(() => setLoadingLeaveBalance(false));
  }, [user?.id, params.id, CURRENT_YEAR]);

  const loadPositions = useCallback(
    (departmentId: string) => {
      if (!user?.id || !departmentId) return;
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

  const handleEditStart = () => {
    if (!employee) return;
    setEditData({
      departmentId: employee.departmentId,
      positionId: employee.positionId,
      shiftId: employee.shiftId,
      employmentStatus: employee.employmentStatus,
      employeeType: employee.employeeType,
      role: employee.role,
      firstNameTH: employee.firstNameTH,
      lastNameTH: employee.lastNameTH,
      firstNameEN: employee.firstNameEN,
      lastNameEN: employee.lastNameEN,
      nickname: employee.nickname ?? '',
      phone: employee.phone ?? '',
      lineId: employee.lineId ?? '',
      address: employee.address ?? '',
      emergencyContactName: employee.emergencyContactName ?? '',
      emergencyContactPhone: employee.emergencyContactPhone ?? '',
      emergencyContactRelation: employee.emergencyContactRelation ?? '',
      dateOfBirth: employee.dateOfBirth ?? '',
      productionLineId: employee.productionLineId ?? '',
      titlePrefix: employee.titlePrefix,
      titlePrefixOther: employee.titlePrefixOther ?? '',
      probationEndDate: employee.probationEndDate ?? '',
      terminationDate: employee.terminationDate ?? undefined,
      hrRemark: employee.hrRemark ?? '',
    });
    loadPositions(employee.departmentId);
    setIsEditing(true);
    setSaveMsg(null);
  };

  const handleDepartmentChange = (departmentId: string) => {
    setEditData((p) => ({ ...p, departmentId, positionId: '' }));
    setPositions([]);
    loadPositions(departmentId);
  };

  const handleSave = async () => {
    // Schema v2 — only client validation needed per Phase D scope; date
    // fields are validated server-side already.
    if (
      editData.titlePrefix === 'other' &&
      !editData.titlePrefixOther?.trim()
    ) {
      setSaveMsg({ type: 'error', text: 'กรุณากรอกคำนำหน้า' });
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    const result = await update(editData);
    setSaving(false);
    setSaveMsg({
      type: result.success ? 'success' : 'error',
      text: result.message,
    });
    if (result.success) setIsEditing(false);
  };

  const handleDisable = async () => {
    setDisabling(true);
    const result = await disable(disableReason || undefined);
    setDisabling(false);
    setShowDisableConfirm(false);
    setSaveMsg({
      type: result.success ? 'success' : 'error',
      text: result.message,
    });
  };

  const handleChangePin = async () => {
    if (!user?.id) return;
    if (!/^\d{6}$/.test(pinData.newPin)) {
      setPinMsg({ type: 'error', text: 'PIN ต้องเป็นตัวเลข 6 หลัก' });
      return;
    }
    if (pinData.newPin !== pinData.confirmPin) {
      setPinMsg({ type: 'error', text: 'PIN ใหม่ไม่ตรงกัน' });
      return;
    }
    setChangingPIN(true);
    setPinMsg(null);
    try {
      const res = await fetch(`/api/employees/${params.id}/change-pin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requesterId: user.id,
          currentPin: pinData.currentPin || undefined,
          newPin: pinData.newPin,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPinMsg({ type: 'success', text: 'เปลี่ยน PIN สำเร็จ' });
        setPinData({ currentPin: '', newPin: '', confirmPin: '' });
        setTimeout(() => setShowChangePIN(false), 1500);
      } else {
        setPinMsg({
          type: 'error',
          text: data.error?.message ?? 'เกิดข้อผิดพลาด',
        });
      }
    } catch {
      setPinMsg({ type: 'error', text: 'เกิดข้อผิดพลาด กรุณาลองใหม่' });
    } finally {
      setChangingPIN(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-gray-100 animate-pulse rounded" />
        <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-4 bg-gray-100 animate-pulse rounded w-3/4"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error || !employee) {
    return (
      <div className="text-center py-16">
        <p className="text-red-500 text-sm">{error ?? 'ไม่พบข้อมูลพนักงาน'}</p>
        <button
          onClick={() => router.back()}
          className="mt-4 text-blue-600 text-sm hover:underline"
        >
          ← กลับ
        </button>
      </div>
    );
  }

  // Phase IA-1: computed once per render, display-only, never sent to
  // editData/handleSave.
  const age = calculateAge(employee.dateOfBirth);

  // Employment Information: computed once per render, display-only, never
  // sent to editData/handleSave. probationEndDate itself remains the
  // editable "Actual Probation End" field, unchanged.
  const expectedProbationEndDate = employee.startDate
    ? addCalendarDays(employee.startDate, PROBATION_DAYS)
    : null;
  const annualLeaveEligibleDate = employee.startDate
    ? addCalendarDays(employee.startDate, LEAVE_ELIGIBILITY_DAYS)
    : null;
  const yearsOfService = calculateYearsOfService(employee.startDate);

  return (
    <div>
      {/* Breadcrumb + Actions */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <button
            onClick={() => router.push('/employees')}
            className="hover:text-blue-600 transition-colors"
          >
            พนักงาน
          </button>
          <span>/</span>
          <span className="text-gray-900 font-medium">
            {employee.firstNameTH} {employee.lastNameTH}
          </span>
        </div>
        {isHR && (
          <div className="flex gap-2">
            {!isEditing ? (
              <>
                <button
                  onClick={handleEditStart}
                  className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
                >
                  แก้ไข
                </button>
                <button
                  onClick={() => {
                    setShowChangePIN(true);
                    setPinMsg(null);
                  }}
                  className="px-4 py-2 text-sm font-medium bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors"
                >
                  เปลี่ยน PIN
                </button>
                {employee.employmentStatus === 'active' && (
                  <button
                    onClick={() => setShowDisableConfirm(true)}
                    className="px-4 py-2 text-sm font-medium bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors"
                  >
                    ระงับบัญชี
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  onClick={() => setIsEditing(false)}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {saveMsg && (
        <div
          className={`mb-4 px-4 py-3 rounded-xl text-sm ${
            saveMsg.type === 'success'
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-600'
          }`}
        >
          {saveMsg.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left — Profile */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center mb-4">
              {employee.profileImage ? (
                <img
                  src={employee.profileImage}
                  alt=""
                  className="w-20 h-20 rounded-full object-cover"
                />
              ) : (
                <span className="text-blue-600 font-bold text-2xl">
                  {employee.firstNameEN.charAt(0)}
                  {employee.lastNameEN.charAt(0)}
                </span>
              )}
            </div>
            <p className="font-semibold text-gray-900 text-lg">
              {employee.firstNameTH} {employee.lastNameTH}
            </p>
            <p className="text-sm text-gray-500">
              {employee.firstNameEN} {employee.lastNameEN}
            </p>
            <p className="text-xs text-gray-400 mt-1">{employee.employeeId}</p>
            {employee.nickname && (
              <p className="text-xs text-gray-400">({employee.nickname})</p>
            )}
            <span
              className={`mt-3 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                STATUS_CLASS[employee.employmentStatus] ??
                'bg-gray-100 text-gray-600'
              }`}
            >
              {STATUS_LABEL[employee.employmentStatus] ??
                employee.employmentStatus}
            </span>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">
              การเข้างานวันนี้
            </h4>
            <p className="text-xs text-gray-400">ยังไม่มีข้อมูลวันนี้</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">
              วันลาคงเหลือ (ปีนี้)
            </h4>
            {loadingLeaveBalance ? (
              <p className="text-xs text-gray-400">กำลังโหลด...</p>
            ) : leaveTypes.length === 0 ? (
              <p className="text-xs text-gray-400">ยังไม่มีประเภทการลาในระบบ</p>
            ) : Object.keys(leaveBalances).length === 0 ? (
              <p className="text-xs text-gray-400">
                ยังไม่มีการตั้งค่ายอดวันลาสำหรับปีนี้
              </p>
            ) : (
              <div className="space-y-1.5">
                {leaveTypes.map((lt) => (
                  <div key={lt.id} className="flex justify-between text-xs">
                    <span className="text-gray-500">{lt.name}</span>
                    <span className="font-medium text-gray-900">
                      {leaveBalances[lt.code] !== undefined
                        ? `${leaveBalances[lt.code]} วัน`
                        : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Onboarding Checklist — Phase 1: static UI only, not wired to
              any API or computed state yet. Deferred to a later phase. */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">
              Employee Onboarding
            </h4>
            <div className="space-y-2">
              {loadingLeaveBalance ? (
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span>…</span>
                  <span>Leave Balance Configured</span>
                </div>
              ) : Object.keys(leaveBalances).length > 0 ? (
                <div className="flex items-center gap-2 text-xs text-green-700">
                  <span>☑</span>
                  <span>Leave Balance Configured</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <span className="text-gray-400">☐</span>
                  <span>Leave Balance Configured</span>
                </div>
              )}
              {loading ? (
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span>…</span>
                  <span>PIN Configured</span>
                </div>
              ) : employee.mustChangePIN === false ? (
                <div className="flex items-center gap-2 text-xs text-green-700">
                  <span>☑</span>
                  <span>PIN Configured</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <span className="text-gray-400">☐</span>
                  <span>PIN Configured</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <span className="text-gray-400">☐</span>
                <span>Department Assigned</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <span className="text-gray-400">☐</span>
                <span>Position Assigned</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <span className="text-gray-400">☐</span>
                <span>Shift Assigned</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right — Details */}
        <div className="lg:col-span-2 space-y-4">
          {/* Employee Identity — Phase IA-1 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <h4 className="text-sm font-semibold text-gray-900 mb-4">
              ข้อมูลประจำตัว
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="รหัสพนักงาน">{employee.employeeId}</Field>

              <Field label="คำนำหน้า">
                {isEditing ? (
                  <select
                    value={editData.titlePrefix ?? ''}
                    onChange={(e) => {
                      const value = (e.target.value || undefined) as any;
                      setEditData((p) => ({
                        ...p,
                        titlePrefix: value,
                        // Mirrors Phase B server rule: titlePrefixOther is
                        // only kept when titlePrefix is 'other'.
                        titlePrefixOther:
                          value === 'other' ? p.titlePrefixOther : undefined,
                      }));
                    }}
                    className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— เลือกคำนำหน้า —</option>
                    <option value="mr">นาย</option>
                    <option value="mrs">นาง</option>
                    <option value="miss">นางสาว</option>
                    <option value="other">อื่นๆ</option>
                  </select>
                ) : employee.titlePrefix ? (
                  employee.titlePrefix === 'other' ? (
                    employee.titlePrefixOther || TITLE_PREFIX_LABEL.other
                  ) : (
                    TITLE_PREFIX_LABEL[employee.titlePrefix] ??
                    employee.titlePrefix
                  )
                ) : (
                  '—'
                )}
              </Field>

              {isEditing && editData.titlePrefix === 'other' && (
                <Field label="ระบุคำนำหน้า">
                  <input
                    value={editData.titlePrefixOther ?? ''}
                    onChange={(e) =>
                      setEditData((p) => ({
                        ...p,
                        titlePrefixOther: e.target.value,
                      }))
                    }
                    placeholder="กรอกคำนำหน้า"
                    className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </Field>
              )}

              <Field label="ชื่อ (ไทย)">
                {isEditing ? (
                  <input
                    value={editData.firstNameTH ?? ''}
                    onChange={(e) =>
                      setEditData((p) => ({
                        ...p,
                        firstNameTH: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  employee.firstNameTH
                )}
              </Field>

              <Field label="นามสกุล (ไทย)">
                {isEditing ? (
                  <input
                    value={editData.lastNameTH ?? ''}
                    onChange={(e) =>
                      setEditData((p) => ({
                        ...p,
                        lastNameTH: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  employee.lastNameTH
                )}
              </Field>

              <Field label="ชื่อ (อังกฤษ)">
                {isEditing ? (
                  <input
                    value={editData.firstNameEN ?? ''}
                    onChange={(e) =>
                      setEditData((p) => ({
                        ...p,
                        firstNameEN: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  employee.firstNameEN
                )}
              </Field>

              <Field label="นามสกุล (อังกฤษ)">
                {isEditing ? (
                  <input
                    value={editData.lastNameEN ?? ''}
                    onChange={(e) =>
                      setEditData((p) => ({
                        ...p,
                        lastNameEN: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  employee.lastNameEN
                )}
              </Field>

              <Field label="ชื่อเล่น">
                {isEditing ? (
                  <input
                    value={editData.nickname ?? ''}
                    onChange={(e) =>
                      setEditData((p) => ({ ...p, nickname: e.target.value }))
                    }
                    className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="ชื่อเล่น"
                  />
                ) : (
                  employee.nickname ?? '—'
                )}
              </Field>

              <Field label="เพศ">
                {employee.gender === 'male' ? 'ชาย' : 'หญิง'}
              </Field>

              <Field label="วันเกิด">
                {isEditing ? (
                  <input
                    type="date"
                    value={editData.dateOfBirth ?? ''}
                    onChange={(e) =>
                      setEditData((p) => ({
                        ...p,
                        dateOfBirth: e.target.value || undefined,
                      }))
                    }
                    max={
                      new Date(Date.now() - 18 * 365.25 * 24 * 60 * 60 * 1000)
                        .toISOString()
                        .split('T')[0]
                    }
                    className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : employee.dateOfBirth ? (
                  new Date(employee.dateOfBirth).toLocaleDateString('th-TH', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })
                ) : (
                  '—'
                )}
              </Field>

              <Field label="อายุ">{age !== null ? `${age} ปี` : '—'}</Field>
            </div>
          </div>

          {/* Work Info */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <h4 className="text-sm font-semibold text-gray-900 mb-4">
              ข้อมูลการทำงาน
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="แผนก">
                {isEditing ? (
                  <select
                    value={editData.departmentId ?? ''}
                    onChange={(e) => handleDepartmentChange(e.target.value)}
                    disabled={loadingDepts}
                    className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  >
                    <option value="">— เลือกแผนก —</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  employee.departmentName
                )}
              </Field>

              <Field label="ตำแหน่ง">
                {isEditing ? (
                  <select
                    value={editData.positionId ?? ''}
                    onChange={(e) =>
                      setEditData((p) => ({ ...p, positionId: e.target.value }))
                    }
                    disabled={loadingPositions || !editData.departmentId}
                    className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
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
                ) : (
                  employee.positionName
                )}
              </Field>

              <Field label="ประเภทพนักงาน">
                {isEditing ? (
                  <select
                    value={editData.employeeType ?? ''}
                    onChange={(e) =>
                      setEditData((p) => ({
                        ...p,
                        employeeType: e.target.value as any,
                      }))
                    }
                    className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="blue_collar">Blue Collar</option>
                    <option value="white_collar">White Collar</option>
                  </select>
                ) : (
                  EMPLOYEE_TYPE_LABEL[employee.employeeType] ??
                  employee.employeeType
                )}
              </Field>

              <Field label="กะ">
                {isEditing ? (
                  <select
                    value={editData.shiftId ?? ''}
                    onChange={(e) =>
                      setEditData((p) => ({
                        ...p,
                        shiftId: e.target.value || null,
                      }))
                    }
                    className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— (White Collar)</option>
                    <option value="DAY">กะเช้า</option>
                    <option value="NIGHT">กะดึก</option>
                    <option value="MAID">กะแม่บ้าน</option>
                  </select>
                ) : employee.shiftId ? (
                  SHIFT_LABEL[employee.shiftId] ?? employee.shiftId
                ) : (
                  '—'
                )}
              </Field>

              <Field label="บทบาท">
                {isEditing ? (
                  <select
                    value={editData.role ?? ''}
                    onChange={(e) =>
                      setEditData((p) => ({
                        ...p,
                        role: e.target.value as any,
                      }))
                    }
                    className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="employee">พนักงาน</option>
                    <option value="manager">ผู้จัดการ</option>
                    <option value="hr_manager">HR Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                ) : (
                  ROLE_LABEL[employee.role] ?? employee.role
                )}
              </Field>

              <Field label="วันเริ่มงาน">{employee.startDate}</Field>

              <Field label="วันที่คาดว่าจะผ่านทดลองงาน (คำนวณ)">
                {expectedProbationEndDate
                  ? expectedProbationEndDate.toLocaleDateString('th-TH', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })
                  : '—'}
              </Field>

              <Field label="ไลน์การผลิต">
                {isEditing ? (
                  <select
                    value={editData.productionLineId ?? ''}
                    onChange={(e) =>
                      setEditData((p) => ({
                        ...p,
                        productionLineId: e.target.value || undefined,
                      }))
                    }
                    disabled={loadingLines}
                    className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  >
                    <option value="">— ไม่ระบุ —</option>
                    {productionLines.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                ) : employee.productionLineId ? (
                  productionLines.find(
                    (l) => l.id === employee.productionLineId
                  )?.name ?? '—'
                ) : (
                  '—'
                )}
              </Field>

              <Field label="วันที่ผ่านทดลองงาน">
                {isEditing ? (
                  <input
                    type="date"
                    value={editData.probationEndDate ?? ''}
                    onChange={(e) =>
                      setEditData((p) => ({
                        ...p,
                        probationEndDate: e.target.value || undefined,
                      }))
                    }
                    className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : employee.probationEndDate ? (
                  new Date(employee.probationEndDate).toLocaleDateString(
                    'th-TH',
                    { year: 'numeric', month: 'long', day: 'numeric' }
                  )
                ) : (
                  '—'
                )}
              </Field>

              <Field label="วันที่มีสิทธิ์ลาพักร้อน (คำนวณ)">
                {annualLeaveEligibleDate
                  ? annualLeaveEligibleDate.toLocaleDateString('th-TH', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })
                  : '—'}
              </Field>

              <Field label="อายุงาน (คำนวณ)">
                {yearsOfService !== null ? `${yearsOfService} ปี` : '—'}
              </Field>

              <Field label="วันที่สิ้นสุดการทำงาน">
                {isEditing ? (
                  <input
                    type="date"
                    value={editData.terminationDate ?? ''}
                    onChange={(e) =>
                      setEditData((p) => ({
                        ...p,
                        terminationDate: e.target.value || undefined,
                      }))
                    }
                    className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : employee.terminationDate ? (
                  new Date(employee.terminationDate).toLocaleDateString(
                    'th-TH',
                    { year: 'numeric', month: 'long', day: 'numeric' }
                  )
                ) : (
                  '—'
                )}
              </Field>

              {/* Readonly — auto-set by the disable endpoint, never
                  editable, never shown in Edit Mode's inputs. */}
              {employee.disabledAt && (
                <Field label="วันที่ระงับบัญชี (ระบบ)">
                  {new Date(employee.disabledAt).toLocaleDateString('th-TH', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </Field>
              )}
              {employee.disabledReason && (
                <Field label="เหตุผลที่ระงับบัญชี">
                  {employee.disabledReason}
                </Field>
              )}
            </div>
          </div>

          {/* Contact Info */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <h4 className="text-sm font-semibold text-gray-900 mb-4">
              ข้อมูลติดต่อ
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="เบอร์โทรศัพท์">
                {isEditing ? (
                  <input
                    value={editData.phone ?? ''}
                    onChange={(e) =>
                      setEditData((p) => ({ ...p, phone: e.target.value }))
                    }
                    className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0812345678"
                  />
                ) : (
                  employee.phone ?? '—'
                )}
              </Field>
              <Field label="LINE ID">
                {isEditing ? (
                  <input
                    value={editData.lineId ?? ''}
                    onChange={(e) =>
                      setEditData((p) => ({ ...p, lineId: e.target.value }))
                    }
                    className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="line_id"
                  />
                ) : (
                  employee.lineId ?? '—'
                )}
              </Field>
              <Field label="ที่อยู่" className="sm:col-span-2">
                {isEditing ? (
                  <textarea
                    value={editData.address ?? ''}
                    onChange={(e) =>
                      setEditData((p) => ({ ...p, address: e.target.value }))
                    }
                    rows={2}
                    className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                ) : (
                  employee.address ?? '—'
                )}
              </Field>
              {/* ── Schema v2 ── */}
              <Field label="HR Remark" className="sm:col-span-2">
                {isEditing ? (
                  <textarea
                    value={editData.hrRemark ?? ''}
                    onChange={(e) =>
                      setEditData((p) => ({ ...p, hrRemark: e.target.value }))
                    }
                    rows={2}
                    className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                ) : (
                  employee.hrRemark ?? '—'
                )}
              </Field>
            </div>
          </div>

          {/* Emergency Contact */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <h4 className="text-sm font-semibold text-gray-900 mb-4">
              ผู้ติดต่อฉุกเฉิน
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="ชื่อ">
                {isEditing ? (
                  <input
                    value={editData.emergencyContactName ?? ''}
                    onChange={(e) =>
                      setEditData((p) => ({
                        ...p,
                        emergencyContactName: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  employee.emergencyContactName ?? '—'
                )}
              </Field>
              <Field label="ความสัมพันธ์">
                {isEditing ? (
                  <input
                    value={editData.emergencyContactRelation ?? ''}
                    onChange={(e) =>
                      setEditData((p) => ({
                        ...p,
                        emergencyContactRelation: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  employee.emergencyContactRelation ?? '—'
                )}
              </Field>
              <Field label="เบอร์โทร">
                {isEditing ? (
                  <input
                    value={editData.emergencyContactPhone ?? ''}
                    onChange={(e) =>
                      setEditData((p) => ({
                        ...p,
                        emergencyContactPhone: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  employee.emergencyContactPhone ?? '—'
                )}
              </Field>
            </div>
          </div>
        </div>
      </div>

      {/* Change PIN Modal */}
      {showChangePIN && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-base font-semibold text-gray-900 mb-4">
              เปลี่ยน PIN — {employee.firstNameTH} {employee.lastNameTH}
            </h3>
            {pinMsg && (
              <div
                className={`mb-3 px-3 py-2 rounded-lg text-sm ${
                  pinMsg.type === 'success'
                    ? 'bg-green-50 text-green-700'
                    : 'bg-red-50 text-red-600'
                }`}
              >
                {pinMsg.text}
              </div>
            )}
            <div className="space-y-3">
              {params.id === user?.id && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    PIN ปัจจุบัน
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={pinData.currentPin}
                    onChange={(e) =>
                      setPinData((p) => ({
                        ...p,
                        currentPin: e.target.value.replace(/\D/g, ''),
                      }))
                    }
                    placeholder="••••••"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  PIN ใหม่ (6 หลัก)
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={pinData.newPin}
                  onChange={(e) =>
                    setPinData((p) => ({
                      ...p,
                      newPin: e.target.value.replace(/\D/g, ''),
                    }))
                  }
                  placeholder="••••••"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  ยืนยัน PIN ใหม่
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={pinData.confirmPin}
                  onChange={(e) =>
                    setPinData((p) => ({
                      ...p,
                      confirmPin: e.target.value.replace(/\D/g, ''),
                    }))
                  }
                  placeholder="••••••"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-4">
              <button
                onClick={() => {
                  setShowChangePIN(false);
                  setPinData({ currentPin: '', newPin: '', confirmPin: '' });
                  setPinMsg(null);
                }}
                disabled={changingPIN}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleChangePin}
                disabled={changingPIN}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {changingPIN ? 'กำลังบันทึก...' : 'เปลี่ยน PIN'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Disable Confirm Modal */}
      {showDisableConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-base font-semibold text-gray-900 mb-2">
              ระงับบัญชีพนักงาน
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {employee.firstNameTH} {employee.lastNameTH} (
              {employee.employeeId}) จะไม่สามารถเข้าสู่ระบบได้อีก
            </p>
            <textarea
              value={disableReason}
              onChange={(e) => setDisableReason(e.target.value)}
              placeholder="เหตุผล (ไม่บังคับ)"
              rows={3}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none mb-4"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDisableConfirm(false)}
                disabled={disabling}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleDisable}
                disabled={disabling}
                className="px-4 py-2 text-sm text-white bg-red-500 rounded-xl hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {disabling ? 'กำลังดำเนินการ...' : 'ยืนยันระงับบัญชี'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
  className = '',
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <div className="text-sm text-gray-900">{children}</div>
    </div>
  );
}
