'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth/context';
import type {
  Department,
  Position,
  EmployeeType,
  ProductionLine,
} from '@/types';
import type { FactorySettings } from '@/types/factory-settings';
import type { LeaveType, LeaveTypeCreateInput } from '@/types/leave';

type Tab =
  | 'departments'
  | 'positions'
  | 'production_lines'
  | 'factory'
  | 'leave_types';

const EMPLOYEE_TYPE_LABEL: Record<string, string> = {
  blue_collar: 'Blue Collar',
  white_collar: 'White Collar',
};

const SHIFT_LABEL: Record<string, string> = {
  DAY: 'กะเช้า',
  NIGHT: 'กะดึก',
  MAID: 'กะแม่บ้าน',
};

export default function SettingsPage() {
  const { user } = useAuth();
  const isHR = user?.role === 'admin' || user?.role === 'hr_manager';

  const [tab, setTab] = useState<Tab>('positions');

  // ── Departments ─────────────────────────────────────────
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loadingDepts, setLoadingDepts] = useState(false);
  const [deptSearch, setDeptSearch] = useState('');
  const [showAddDept, setShowAddDept] = useState(false);
  const [newDept, setNewDept] = useState({ name: '', nameEN: '' });
  const [savingDept, setSavingDept] = useState(false);
  const [editDept, setEditDept] = useState<Department | null>(null);
  const [confirmDeleteDeptId, setConfirmDeleteDeptId] = useState<string | null>(
    null
  );
  const [showInactiveDepts, setShowInactiveDepts] = useState(false);

  // ── Positions ───────────────────────────────────────────
  const [positions, setPositions] = useState<Position[]>([]);
  const [loadingPos, setLoadingPos] = useState(false);
  const [posSearch, setPosSearch] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterType, setFilterType] = useState<EmployeeType | ''>('');
  const [showAddPos, setShowAddPos] = useState(false);
  const [editPos, setEditPos] = useState<Position | null>(null);
  const [confirmDeletePosId, setConfirmDeletePosId] = useState<string | null>(
    null
  );
  const [savingPos, setSavingPos] = useState(false);
  const [newPos, setNewPos] = useState({
    code: '',
    name: '',
    description: '',
    departmentId: '',
    employeeType: 'blue_collar' as EmployeeType,
    defaultShiftId: '',
    grade: '',
    level: 1,
    isSupervisor: false,
    sortOrder: 999,
  });

  const [msg, setMsg] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // ── Factory Settings ────────────────────────────────────
  const [factory, setFactory] = useState<FactorySettings | null>(null);
  const [loadingFactory, setLoadingFactory] = useState(false);
  const [savingFactory, setSavingFactory] = useState(false);
  const [factoryForm, setFactoryForm] = useState({
    latitude: '',
    longitude: '',
    address: '',
    clockInApproveRadius: '',
    clockInFlagRadius: '',
    clockInRejectRadius: '',
    clockInMaxAccuracy: '',
  });

  // ── Leave Types ──────────────────────────────────────────
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [loadingLeaveTypes, setLoadingLeaveTypes] = useState(false);
  const [seedingLeaveTypes, setSeedingLeaveTypes] = useState(false);
  const [showAddLeaveType, setShowAddLeaveType] = useState(false);
  const [savingLeaveType, setSavingLeaveType] = useState(false);
  const [confirmDeleteLeaveTypeId, setConfirmDeleteLeaveTypeId] = useState<
    string | null
  >(null);
  const [editLeaveType, setEditLeaveType] = useState<LeaveType | null>(null);
  const [savingEditLeaveType, setSavingEditLeaveType] = useState(false);
  const [newLeaveType, setNewLeaveType] = useState({
    code: '',
    name: '',
    nameEN: '',
    entitlementType: 'fixed' as LeaveTypeCreateInput['entitlementType'],
    fixedDays: '',
    payType: 'full' as LeaveTypeCreateInput['payType'],
    payPercent: '',
    countsHolidays: false,
    advanceNoticeDays: '',
    requiresAttachment: 'never' as LeaveTypeCreateInput['requiresAttachment'],
    attachmentCondition: '',
    affectsAttendanceBonus: false,
  });

  // ── Production Lines ────────────────────────────────────────
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [loadingLines, setLoadingLines] = useState(false);
  const [lineSearch, setLineSearch] = useState('');
  const [showAddLine, setShowAddLine] = useState(false);
  const [editLine, setEditLine] = useState<ProductionLine | null>(null);
  const [savingLine, setSavingLine] = useState(false);
  const [newLine, setNewLine] = useState({
    code: '',
    name: '',
    description: '',
    sortOrder: 999,
  });

  // ── Fetch ────────────────────────────────────────────────

  const fetchDepartments = useCallback(async () => {
    if (!user?.id) return;
    setLoadingDepts(true);
    try {
      const res = await fetch(`/api/departments?requesterId=${user.id}`);
      const data = await res.json();
      if (data.success) setDepartments(data.data);
    } finally {
      setLoadingDepts(false);
    }
  }, [user?.id]);

  const fetchPositions = useCallback(async () => {
    if (!user?.id) return;
    setLoadingPos(true);
    try {
      const params = new URLSearchParams({ requesterId: user.id });
      if (filterDept) params.set('departmentId', filterDept);
      if (filterType) params.set('employeeType', filterType);
      const res = await fetch(`/api/positions?${params}`);
      const data = await res.json();
      if (data.success) setPositions(data.data);
    } finally {
      setLoadingPos(false);
    }
  }, [user?.id, filterDept, filterType]);

  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments]);
  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);
  const fetchLines = useCallback(async () => {
    if (!user?.id) return;
    setLoadingLines(true);
    try {
      const res = await fetch(`/api/production-lines?requesterId=${user.id}`);
      const data = await res.json();
      if (data.success) setLines(data.data);
    } finally {
      setLoadingLines(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchLines();
  }, [fetchLines]);

  const fetchFactory = useCallback(async () => {
    if (!user?.id) return;
    setLoadingFactory(true);
    try {
      const res = await fetch(`/api/company-settings?requesterId=${user.id}`);
      const data = await res.json();
      if (data.success) {
        const f: FactorySettings = data.data;
        setFactory(f);
        setFactoryForm({
          latitude: String(f.factoryLocation?.latitude ?? ''),
          longitude: String(f.factoryLocation?.longitude ?? ''),
          address: f.factoryLocation?.address ?? '',
          clockInApproveRadius: String(f.clockInApproveRadius ?? ''),
          clockInFlagRadius: String(f.clockInFlagRadius ?? ''),
          clockInRejectRadius: String(f.clockInRejectRadius ?? ''),
          clockInMaxAccuracy: String(f.clockInMaxAccuracy ?? ''),
        });
      }
    } finally {
      setLoadingFactory(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchFactory();
  }, [fetchFactory]);

  const handleSaveFactory = async () => {
    if (!user?.id) return;
    setSavingFactory(true);
    try {
      const res = await fetch('/api/company-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requesterId: user.id,
          latitude: parseFloat(factoryForm.latitude),
          longitude: parseFloat(factoryForm.longitude),
          address: factoryForm.address,
          clockInApproveRadius: parseFloat(factoryForm.clockInApproveRadius),
          clockInFlagRadius: parseFloat(factoryForm.clockInFlagRadius),
          clockInRejectRadius: parseFloat(factoryForm.clockInRejectRadius),
          clockInMaxAccuracy: parseFloat(factoryForm.clockInMaxAccuracy),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMsg({ type: 'success', text: 'บันทึกตำแหน่งโรงงานสำเร็จ' });
        fetchFactory();
      } else {
        setMsg({
          type: 'error',
          text: data.error?.message ?? 'เกิดข้อผิดพลาด',
        });
      }
    } finally {
      setSavingFactory(false);
    }
  };

  const fetchLeaveTypes = useCallback(async () => {
    if (!user?.id) return;
    setLoadingLeaveTypes(true);
    try {
      const res = await fetch(`/api/leave-types?requesterId=${user.id}`);
      const data = await res.json();
      if (data.success) setLeaveTypes(data.data);
    } finally {
      setLoadingLeaveTypes(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchLeaveTypes();
  }, [fetchLeaveTypes]);

  const handleAddLeaveType = async () => {
    if (!user?.id || !newLeaveType.code || !newLeaveType.name) return;
    setSavingLeaveType(true);
    try {
      const res = await fetch('/api/leave-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requesterId: user.id,
          code: newLeaveType.code,
          name: newLeaveType.name,
          nameEN: newLeaveType.nameEN,
          entitlementType: newLeaveType.entitlementType,
          fixedDays: newLeaveType.fixedDays
            ? Number(newLeaveType.fixedDays)
            : undefined,
          payType: newLeaveType.payType,
          payPercent: newLeaveType.payPercent
            ? Number(newLeaveType.payPercent)
            : undefined,
          countsHolidays: newLeaveType.countsHolidays,
          advanceNoticeDays: Number(newLeaveType.advanceNoticeDays) || 0,
          requiresAttachment: newLeaveType.requiresAttachment,
          attachmentCondition: newLeaveType.attachmentCondition || undefined,
          affectsAttendanceBonus: newLeaveType.affectsAttendanceBonus,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMsg({ type: 'success', text: 'เพิ่มประเภทการลาสำเร็จ' });
        setShowAddLeaveType(false);
        setNewLeaveType({
          code: '',
          name: '',
          nameEN: '',
          entitlementType: 'fixed',
          fixedDays: '',
          payType: 'full',
          payPercent: '',
          countsHolidays: false,
          advanceNoticeDays: '',
          requiresAttachment: 'never',
          attachmentCondition: '',
          affectsAttendanceBonus: false,
        });
        fetchLeaveTypes();
      } else {
        setMsg({
          type: 'error',
          text: data.error?.message ?? 'เกิดข้อผิดพลาด',
        });
      }
    } finally {
      setSavingLeaveType(false);
    }
  };

  const handleSaveEditLeaveType = async () => {
    if (!editLeaveType || !user?.id) return;
    setSavingEditLeaveType(true);
    try {
      const res = await fetch(`/api/leave-types/${editLeaveType.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requesterId: user.id,
          name: editLeaveType.name,
          nameEN: editLeaveType.nameEN,
          fixedDays: editLeaveType.fixedDays,
          tenureTiers: editLeaveType.tenureTiers,
          genderEntitlement: editLeaveType.genderEntitlement,
          maxOccurrencesPerYear: editLeaveType.maxOccurrencesPerYear,
          payType: editLeaveType.payType,
          payPercent: editLeaveType.payPercent,
          countsHolidays: editLeaveType.countsHolidays,
          advanceNoticeDays: editLeaveType.advanceNoticeDays,
          requiresAttachment: editLeaveType.requiresAttachment,
          attachmentCondition: editLeaveType.attachmentCondition,
          affectsAttendanceBonus: editLeaveType.affectsAttendanceBonus,
          notes: editLeaveType.notes,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMsg({ type: 'success', text: 'บันทึกสำเร็จ' });
        setEditLeaveType(null);
        fetchLeaveTypes();
      } else {
        setMsg({
          type: 'error',
          text: data.error?.message ?? 'เกิดข้อผิดพลาด',
        });
      }
    } finally {
      setSavingEditLeaveType(false);
    }
  };

  const handleToggleLeaveType = async (lt: LeaveType) => {
    if (!user?.id) return;
    const isActive = lt.active !== false;
    const url = isActive
      ? `/api/leave-types/${lt.id}?requesterId=${user.id}`
      : `/api/leave-types/${lt.id}`;
    const res = await fetch(url, {
      method: isActive ? 'DELETE' : 'PATCH',
      ...(isActive
        ? {}
        : {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requesterId: user.id, active: true }),
          }),
    });
    const data = await res.json();
    if (data.success) {
      setMsg({
        type: 'success',
        text: isActive ? 'ปิดใช้งานแล้ว' : 'เปิดใช้งานแล้ว',
      });
      fetchLeaveTypes();
    } else {
      setMsg({ type: 'error', text: data.error?.message ?? 'เกิดข้อผิดพลาด' });
    }
  };

  const handlePermanentDeleteLeaveType = async (lt: LeaveType) => {
    if (!user?.id) return;
    setConfirmDeleteLeaveTypeId(null);
    const res = await fetch(
      `/api/leave-types/${lt.id}?requesterId=${user.id}&permanent=true`,
      { method: 'DELETE' }
    );
    const data = await res.json();
    if (data.success) {
      setMsg({ type: 'success', text: 'ลบประเภทการลาถาวรสำเร็จ' });
      fetchLeaveTypes();
    } else {
      setMsg({ type: 'error', text: data.error?.message ?? 'เกิดข้อผิดพลาด' });
    }
  };

  // ระเบียบการลาจริงของบริษัท (จากประกาศฝ่ายบุคคล) — โหลดครั้งเดียวตอนตั้งค่าระบบ
  const POLICY_LEAVE_TYPES: Omit<LeaveTypeCreateInput, 'requesterId'>[] = [
    {
      code: 'SICK',
      name: 'ลาป่วย',
      nameEN: 'Sick Leave',
      color: '#EF4444',
      icon: 'heart-pulse',
      entitlementType: 'fixed',
      fixedDays: 30,
      payType: 'full',
      countsHolidays: false,
      advanceNoticeDays: 0,
      requiresAttachment: 'conditional',
      attachmentCondition:
        'ลาเกิน 2 วัน หรือลาติดต่อวันหยุด ต้องมีใบรับรองแพทย์',
      affectsAttendanceBonus: false,
      notes:
        'ยื่นภายใน 1 วันที่กลับมาทำงาน ต้องแจ้งหัวหน้างาน/ฝ่ายบุคคลภายใน 2 ชม. หลังเริ่มงาน หากลาเกิน 3 วันช่วงทดลองงาน จะถูกเลื่อนวันพ้นทดลองงาน หากเกิน 30 วัน ไม่ได้รับค่าจ้างและนับรวมวันหยุด',
      sortOrder: 1,
    },
    {
      code: 'VACATION',
      name: 'หยุดพักผ่อน',
      nameEN: 'Vacation Leave',
      color: '#10B981',
      icon: 'palm-tree',
      entitlementType: 'tenure_based',
      tenureTiers: [
        { minYears: 1, days: 10 },
        { minYears: 5, days: 12 },
        { minYears: 11, days: 15 },
        { minYears: 15, days: 18 },
      ],
      payType: 'full',
      countsHolidays: false,
      advanceNoticeDays: 3,
      requiresAttachment: 'conditional',
      attachmentCondition:
        'กรณีฉุกเฉิน (บิดา/มารดา/คู่สมรส/บุตรป่วยหรือเสียชีวิต) ต้องมีหลักฐานแนบ',
      affectsAttendanceBonus: true,
      minTenureYears: 1,
      notes:
        'ใช้ได้หลังผ่านทดลองงาน 120 วัน คำนวณตามสัดส่วนวันเริ่มงาน ไม่สามารถสะสมไปปีถัดไปได้ ยังได้รับเบี้ยขยันตามปกติ',
      sortOrder: 2,
    },
    {
      code: 'COMPENSATE',
      name: 'หยุดชดเชย',
      nameEN: 'Compensate Leave',
      color: '#6366F1',
      icon: 'calendar-check',
      entitlementType: 'fixed',
      payType: 'full',
      countsHolidays: false,
      advanceNoticeDays: 1,
      requiresAttachment: 'never',
      affectsAttendanceBonus: false,
      notes: 'ตามตารางการปฏิบัติงาน ไม่สามารถสะสมไปปีถัดไปได้',
      sortOrder: 3,
    },
    {
      code: 'MATERNITY',
      name: 'ลาคลอด',
      nameEN: 'Maternity Leave',
      color: '#EC4899',
      icon: 'baby',
      entitlementType: 'gender_based',
      genderEntitlement: { female: 120, male: 15 },
      payType: 'partial',
      countsHolidays: true,
      advanceNoticeDays: 30,
      requiresAttachment: 'always',
      attachmentCondition:
        'หญิง: ใบรับรองแพทย์ยืนยันการตั้งครรภ์ / ชาย: ทะเบียนสมรส และต้องลาภายใน 90 วันหลังคลอด',
      affectsAttendanceBonus: false,
      notes:
        'ฝ่ายหญิง 120 วัน (จ่าย 60 วัน/ไม่จ่าย 60 วัน) นับรวมวันหยุด / ฝ่ายชาย 15 วัน จ่ายเต็ม ไม่นับรวมวันหยุด',
      sortOrder: 4,
    },
    {
      code: 'SICK_NEWBORN_CARE',
      name: 'ลาเลี้ยงดูบุตรแรกคลอดเจ็บป่วย',
      nameEN: 'Paternity Leave for Sick Newborn',
      color: '#F59E0B',
      icon: 'baby',
      entitlementType: 'fixed',
      fixedDays: 15,
      payType: 'partial',
      payPercent: 50,
      countsHolidays: true,
      advanceNoticeDays: 0,
      requiresAttachment: 'always',
      attachmentCondition: 'ใบรับรองแพทย์ยืนยันการเจ็บป่วยของบุตร',
      affectsAttendanceBonus: false,
      notes:
        'ยื่นภายใน 1 วันที่กลับมาทำงาน ต้องโทรแจ้งหัวหน้างาน/ฝ่ายบุคคลหลังทราบอาการ',
      sortOrder: 5,
    },
    {
      code: 'BUSINESS_PAID',
      name: 'ลากิจ',
      nameEN: 'Business Leave (Paid)',
      color: '#8B5CF6',
      icon: 'briefcase',
      entitlementType: 'fixed',
      fixedDays: 3,
      payType: 'full',
      countsHolidays: false,
      advanceNoticeDays: 3,
      requiresAttachment: 'always',
      attachmentCondition: 'ต้องมีหลักฐานประกอบทุกครั้ง',
      affectsAttendanceBonus: false,
      notes:
        'ลาติดต่อกันได้ไม่เกินครั้งละ 3 วัน ใช้กรณีแต่งงาน/ติดต่อราชการ/ญาติป่วยหรือเสียชีวิต/หมายศาล/ภรรยาคลอดบุตร',
      sortOrder: 6,
    },
    {
      code: 'BUSINESS_UNPAID',
      name: 'ลากิจไม่ได้รับค่าจ้าง',
      nameEN: 'Business Leave (Unpaid)',
      color: '#8B5CF6',
      icon: 'briefcase',
      entitlementType: 'fixed',
      fixedDays: 15,
      payType: 'unpaid',
      countsHolidays: false,
      advanceNoticeDays: 1,
      requiresAttachment: 'conditional',
      attachmentCondition: 'ต้องมีหลักฐานแนบแล้วแต่กรณี',
      affectsAttendanceBonus: false,
      notes: 'สำหรับลากิจที่ไม่เข้าข่ายลากิจแบบได้รับค่าจ้าง',
      sortOrder: 7,
    },
    {
      code: 'MILITARY',
      name: 'ลาเพื่อรับราชการทหาร',
      nameEN: 'Military Leave',
      color: '#059669',
      icon: 'shield',
      entitlementType: 'fixed',
      fixedDays: 60,
      payType: 'full',
      countsHolidays: true,
      advanceNoticeDays: 0,
      requiresAttachment: 'always',
      attachmentCondition: 'สำเนาหมายเรียกจากทางราชการ',
      affectsAttendanceBonus: false,
      notes:
        'ยื่นทันทีที่ได้รับหมายเรียก ต้องกลับเข้าทำงานภายใน 1 วันหลังฝึกเสร็จ',
      sortOrder: 8,
    },
    {
      code: 'ORDINATION',
      name: 'ลาอุปสมบท',
      nameEN: 'Ordination Leave',
      color: '#D97706',
      icon: 'sparkles',
      entitlementType: 'fixed',
      fixedDays: 15,
      payType: 'unpaid',
      countsHolidays: true,
      advanceNoticeDays: 30,
      requiresAttachment: 'always',
      attachmentCondition: 'ใบสุทธิรับรองการบวช หรือภาพประกอบพิธีสงฆ์',
      affectsAttendanceBonus: false,
      minTenureYears: 1,
      notes:
        'อายุงานครบ 1 ปีขึ้นไป ใช้สิทธิพักร้อนร่วมได้ก่อน หากหมดจึงเป็นลากิจไม่ได้รับค่าจ้าง',
      sortOrder: 9,
    },
    {
      code: 'STERILIZATION',
      name: 'ลาทำหมัน',
      nameEN: 'Sterilization Leave',
      color: '#0EA5E9',
      icon: 'heart-pulse',
      entitlementType: 'doctor_specified',
      payType: 'full',
      countsHolidays: true,
      advanceNoticeDays: 5,
      requiresAttachment: 'always',
      attachmentCondition: 'ใบรับรองแพทย์หลังจากกลับเข้าทำงาน',
      affectsAttendanceBonus: false,
      notes:
        'ตามระยะเวลาที่แพทย์ระบุ หากติดเชื้อ/แผลอักเสบต้องใช้สิทธิลาป่วยแทน',
      sortOrder: 10,
    },
    {
      code: 'TRAINING',
      name: 'ลาฝึกอบรม',
      nameEN: 'Training Leave',
      color: '#0891B2',
      icon: 'graduation-cap',
      entitlementType: 'per_occurrence',
      fixedDays: 30,
      maxOccurrencesPerYear: 3,
      payType: 'full',
      countsHolidays: false,
      advanceNoticeDays: 7,
      requiresAttachment: 'never',
      affectsAttendanceBonus: false,
      notes: 'ตามแผนการฝึกอบรมของบริษัทฯ เท่านั้น',
      sortOrder: 11,
    },
  ];

  const handleSeedLeaveTypes = async () => {
    if (!user?.id) return;
    setSeedingLeaveTypes(true);
    let successCount = 0;
    const failures: string[] = [];
    try {
      for (const lt of POLICY_LEAVE_TYPES) {
        try {
          const res = await fetch('/api/leave-types', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requesterId: user.id, ...lt }),
          });
          const data = await res.json();
          if (res.ok && data.success) {
            successCount++;
          } else {
            failures.push(
              `${lt.name}: ${data.error?.message ?? `HTTP ${res.status}`}`
            );
          }
        } catch (err: any) {
          failures.push(`${lt.name}: ${err.message}`);
        }
      }

      if (failures.length === 0) {
        setMsg({
          type: 'success',
          text: `โหลดสำเร็จทั้งหมด ${successCount} ประเภท`,
        });
      } else {
        setMsg({
          type: 'error',
          text: `สำเร็จ ${successCount}/${
            POLICY_LEAVE_TYPES.length
          } — ที่ล้มเหลว: ${failures.join(' | ')}`,
        });
      }
      fetchLeaveTypes();
    } finally {
      setSeedingLeaveTypes(false);
    }
  };

  const handleAddLine = async () => {
    if (!newLine.code || !newLine.name || !user?.id) return;
    setSavingLine(true);
    try {
      const res = await fetch('/api/production-lines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterId: user.id, ...newLine }),
      });
      const data = await res.json();
      if (data.success) {
        setMsg({ type: 'success', text: 'เพิ่ม Production Line สำเร็จ' });
        setShowAddLine(false);
        setNewLine({ code: '', name: '', description: '', sortOrder: 999 });
        fetchLines();
      } else {
        setMsg({
          type: 'error',
          text: data.error?.message ?? 'เกิดข้อผิดพลาด',
        });
      }
    } finally {
      setSavingLine(false);
    }
  };

  const handleSaveLine = async () => {
    if (!editLine || !user?.id) return;
    setSavingLine(true);
    try {
      const res = await fetch(`/api/production-lines/${editLine.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requesterId: user.id,
          name: editLine.name,
          description: editLine.description,
          sortOrder: editLine.sortOrder,
          active: editLine.active,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMsg({ type: 'success', text: 'บันทึกสำเร็จ' });
        setEditLine(null);
        fetchLines();
      } else {
        setMsg({
          type: 'error',
          text: data.error?.message ?? 'เกิดข้อผิดพลาด',
        });
      }
    } finally {
      setSavingLine(false);
    }
  };

  const handleToggleLine = async (line: ProductionLine) => {
    if (!user?.id) return;
    const method = line.active ? 'DELETE' : 'PATCH';
    const url = line.active
      ? `/api/production-lines/${line.id}?requesterId=${user.id}`
      : `/api/production-lines/${line.id}`;
    const options: RequestInit = line.active
      ? { method }
      : {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requesterId: user.id, active: true }),
        };
    const res = await fetch(url, options);
    const data = await res.json();
    if (data.success) {
      setMsg({
        type: 'success',
        text: line.active ? 'ปิดใช้งานแล้ว' : 'เปิดใช้งานแล้ว',
      });
      fetchLines();
    }
  };

  const filteredLines = lines.filter(
    (l) =>
      !lineSearch ||
      l.name.toLowerCase().includes(lineSearch.toLowerCase()) ||
      l.code.toLowerCase().includes(lineSearch.toLowerCase())
  );

  // ── Department Actions ───────────────────────────────────

  const handleAddDept = async () => {
    if (!newDept.name.trim() || !user?.id) return;
    setSavingDept(true);
    try {
      const res = await fetch('/api/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterId: user.id, ...newDept }),
      });
      const data = await res.json();
      if (data.success) {
        setMsg({ type: 'success', text: 'เพิ่มแผนกสำเร็จ' });
        setShowAddDept(false);
        setNewDept({ name: '', nameEN: '' });
        fetchDepartments();
      } else {
        setMsg({
          type: 'error',
          text: data.error?.message ?? 'เกิดข้อผิดพลาด',
        });
      }
    } finally {
      setSavingDept(false);
    }
  };

  const handleSaveDept = async () => {
    if (!editDept || !user?.id) return;
    setSavingDept(true);
    try {
      const res = await fetch(`/api/departments/${editDept.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requesterId: user.id,
          name: editDept.name,
          nameEN: editDept.nameEN,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMsg({ type: 'success', text: 'บันทึกสำเร็จ' });
        setEditDept(null);
        fetchDepartments();
      } else {
        setMsg({
          type: 'error',
          text: data.error?.message ?? 'เกิดข้อผิดพลาด',
        });
      }
    } finally {
      setSavingDept(false);
    }
  };

  const handleToggleDept = async (dept: Department) => {
    if (!user?.id) return;
    const isActive = dept.active !== false; // undefined = ถือว่ายังใช้งานอยู่
    const method = isActive ? 'DELETE' : 'PATCH';
    const url = isActive
      ? `/api/departments/${dept.id}?requesterId=${user.id}`
      : `/api/departments/${dept.id}`;
    const options: RequestInit = isActive
      ? { method }
      : {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requesterId: user.id, active: true }),
        };
    const res = await fetch(url, options);
    const data = await res.json();
    if (data.success) {
      setMsg({
        type: 'success',
        text: isActive ? 'ปิดใช้งานแล้ว' : 'เปิดใช้งานแล้ว',
      });
      fetchDepartments();
    } else {
      setMsg({ type: 'error', text: data.error?.message ?? 'เกิดข้อผิดพลาด' });
    }
  };

  const handlePermanentDeleteDept = async (dept: Department) => {
    if (!user?.id) return;
    setConfirmDeleteDeptId(null);
    const res = await fetch(
      `/api/departments/${dept.id}?requesterId=${user.id}&permanent=true`,
      { method: 'DELETE' }
    );
    const data = await res.json();
    if (data.success) {
      setMsg({ type: 'success', text: 'ลบแผนกถาวรสำเร็จ' });
      fetchDepartments();
    } else {
      setMsg({ type: 'error', text: data.error?.message ?? 'เกิดข้อผิดพลาด' });
    }
  };

  // ── Position Actions ─────────────────────────────────────

  const handleAddPos = async () => {
    if (!newPos.code || !newPos.name || !newPos.departmentId || !user?.id)
      return;
    setSavingPos(true);
    try {
      const res = await fetch('/api/positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterId: user.id, ...newPos }),
      });
      const data = await res.json();
      if (data.success) {
        console.log('[Settings] Position created:', JSON.stringify(data.data));
        setMsg({ type: 'success', text: 'เพิ่มตำแหน่งสำเร็จ' });
        setShowAddPos(false);
        setNewPos({
          code: '',
          name: '',
          description: '',
          departmentId: '',
          employeeType: 'blue_collar',
          defaultShiftId: '',
          grade: '',
          level: 1,
          isSupervisor: false,
          sortOrder: 999,
        });
        fetchPositions();
      } else {
        setMsg({
          type: 'error',
          text: data.error?.message ?? 'เกิดข้อผิดพลาด',
        });
      }
    } finally {
      setSavingPos(false);
    }
  };

  const handleSavePos = async () => {
    if (!editPos || !user?.id) return;
    setSavingPos(true);
    try {
      const res = await fetch(`/api/positions/${editPos.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requesterId: user.id,
          name: editPos.name,
          description: editPos.description,
          departmentId: editPos.departmentId,
          employeeType: editPos.employeeType,
          defaultShiftId: editPos.defaultShiftId,
          grade: editPos.grade,
          level: editPos.level,
          isSupervisor: editPos.isSupervisor,
          sortOrder: editPos.sortOrder,
          active: editPos.active,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMsg({ type: 'success', text: 'บันทึกสำเร็จ' });
        setEditPos(null);
        fetchPositions();
      } else {
        setMsg({
          type: 'error',
          text: data.error?.message ?? 'เกิดข้อผิดพลาด',
        });
      }
    } finally {
      setSavingPos(false);
    }
  };

  const handleTogglePos = async (pos: Position) => {
    if (!user?.id) return;
    const method = pos.active ? 'DELETE' : 'PATCH';
    const url = pos.active
      ? `/api/positions/${pos.id}?requesterId=${user.id}`
      : `/api/positions/${pos.id}`;
    const options: RequestInit = pos.active
      ? { method }
      : {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requesterId: user.id, active: true }),
        };
    const res = await fetch(url, options);
    const data = await res.json();
    if (data.success) {
      setMsg({
        type: 'success',
        text: pos.active ? 'ปิดใช้งานแล้ว' : 'เปิดใช้งานแล้ว',
      });
      fetchPositions();
    }
  };

  const handlePermanentDeletePos = async (pos: Position) => {
    if (!user?.id) return;
    setConfirmDeletePosId(null);
    const res = await fetch(
      `/api/positions/${pos.id}?requesterId=${user.id}&permanent=true`,
      { method: 'DELETE' }
    );
    const data = await res.json();
    if (data.success) {
      setMsg({ type: 'success', text: 'ลบตำแหน่งถาวรสำเร็จ' });
      fetchPositions();
    } else {
      setMsg({ type: 'error', text: data.error?.message ?? 'เกิดข้อผิดพลาด' });
    }
  };

  // ── Filter ───────────────────────────────────────────────

  const filteredDepts = departments.filter(
    (d) =>
      (showInactiveDepts || d.active !== false) &&
      (!deptSearch || d.name.toLowerCase().includes(deptSearch.toLowerCase()))
  );

  const filteredPos = positions.filter(
    (p) =>
      !posSearch ||
      p.name.toLowerCase().includes(posSearch.toLowerCase()) ||
      p.code.toLowerCase().includes(posSearch.toLowerCase())
  );

  if (!isHR) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400 text-sm">ไม่มีสิทธิ์เข้าถึงหน้านี้</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">ตั้งค่าระบบ</h2>
        <p className="text-gray-500 mt-1 text-sm">
          จัดการ Master Data ของระบบ HR
        </p>
      </div>

      {msg && (
        <div
          className={`mb-4 px-4 py-3 rounded-xl text-sm ${
            msg.type === 'success'
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-600'
          }`}
        >
          {msg.text}
          <button
            onClick={() => setMsg(null)}
            className="ml-3 underline text-xs"
          >
            ปิด
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        {(
          [
            'positions',
            'departments',
            'production_lines',
            'factory',
            'leave_types',
          ] as Tab[]
        ).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'positions'
              ? 'ตำแหน่งงาน'
              : t === 'departments'
              ? 'แผนก'
              : t === 'production_lines'
              ? 'ไลน์การผลิต'
              : t === 'factory'
              ? 'ตั้งค่าโรงงาน'
              : 'ประเภทการลา'}
          </button>
        ))}
      </div>

      {/* ── POSITIONS TAB ── */}
      {tab === 'positions' && (
        <div>
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <input
              type="text"
              placeholder="ค้นหาชื่อหรือรหัสตำแหน่ง..."
              value={posSearch}
              onChange={(e) => setPosSearch(e.target.value)}
              className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={filterDept}
              onChange={(e) => setFilterDept(e.target.value)}
              className="px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">ทุกแผนก</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <select
              value={filterType}
              onChange={(e) =>
                setFilterType(e.target.value as EmployeeType | '')
              }
              className="px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">ทุกประเภท</option>
              <option value="blue_collar">Blue Collar</option>
              <option value="white_collar">White Collar</option>
            </select>
            <button
              onClick={() => setShowAddPos(true)}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              + เพิ่มตำแหน่ง
            </button>
          </div>

          {/* Add Position Form */}
          {showAddPos && (
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 mb-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">
                เพิ่มตำแหน่งใหม่
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  placeholder="รหัส (เช่น EXT_OP) *"
                  value={newPos.code}
                  onChange={(e) =>
                    setNewPos((p) => ({
                      ...p,
                      code: e.target.value.toUpperCase(),
                    }))
                  }
                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  placeholder="ชื่อตำแหน่ง *"
                  value={newPos.name}
                  onChange={(e) =>
                    setNewPos((p) => ({ ...p, name: e.target.value }))
                  }
                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <select
                  value={newPos.departmentId}
                  onChange={(e) =>
                    setNewPos((p) => ({ ...p, departmentId: e.target.value }))
                  }
                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">เลือกแผนก *</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <select
                  value={newPos.employeeType}
                  onChange={(e) =>
                    setNewPos((p) => ({
                      ...p,
                      employeeType: e.target.value as EmployeeType,
                    }))
                  }
                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="blue_collar">Blue Collar</option>
                  <option value="white_collar">White Collar</option>
                </select>
                <select
                  value={newPos.defaultShiftId}
                  onChange={(e) =>
                    setNewPos((p) => ({ ...p, defaultShiftId: e.target.value }))
                  }
                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">กะเริ่มต้น (ไม่บังคับ)</option>
                  <option value="DAY">กะเช้า</option>
                  <option value="NIGHT">กะดึก</option>
                  <option value="MAID">กะแม่บ้าน</option>
                </select>
                <input
                  placeholder="Grade (เช่น G3)"
                  value={newPos.grade}
                  onChange={(e) =>
                    setNewPos((p) => ({ ...p, grade: e.target.value }))
                  }
                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="number"
                  placeholder="ลำดับแสดงผล"
                  value={newPos.sortOrder}
                  onChange={(e) =>
                    setNewPos((p) => ({
                      ...p,
                      sortOrder: Number(e.target.value),
                    }))
                  }
                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={newPos.isSupervisor}
                    onChange={(e) =>
                      setNewPos((p) => ({
                        ...p,
                        isSupervisor: e.target.checked,
                      }))
                    }
                    className="rounded"
                  />
                  เป็น Supervisor
                </label>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleAddPos}
                  disabled={savingPos}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {savingPos ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
                <button
                  onClick={() => setShowAddPos(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 transition-colors"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          )}

          {/* Positions List */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {loadingPos ? (
              <div className="p-8 text-center text-sm text-gray-400">
                กำลังโหลด...
              </div>
            ) : filteredPos.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400">
                ไม่พบข้อมูลตำแหน่ง
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      รหัส / ชื่อ
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      แผนก
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      ประเภท
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      กะ / Grade
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      สถานะ
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredPos.map((pos) => (
                    <tr
                      key={pos.id}
                      className={`${!pos.active ? 'opacity-50' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{pos.name}</p>
                        <p className="text-xs text-gray-400">{pos.code}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {departments.find((d) => d.id === pos.departmentId)
                          ?.name ?? pos.departmentId}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {EMPLOYEE_TYPE_LABEL[pos.employeeType] ??
                          pos.employeeType}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        <p>
                          {pos.defaultShiftId
                            ? SHIFT_LABEL[pos.defaultShiftId] ??
                              pos.defaultShiftId
                            : '—'}
                        </p>
                        <p className="text-gray-400">{pos.grade || '—'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            pos.active
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {pos.active ? 'ใช้งาน' : 'ปิดใช้งาน'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => setEditPos(pos)}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            แก้ไข
                          </button>
                          <button
                            onClick={() => handleTogglePos(pos)}
                            className={`text-xs ${
                              pos.active ? 'text-red-500' : 'text-green-600'
                            } hover:underline`}
                          >
                            {pos.active ? 'ปิด' : 'เปิด'}
                          </button>
                          {confirmDeletePosId === pos.id ? (
                            <>
                              <button
                                onClick={() => handlePermanentDeletePos(pos)}
                                className="text-xs text-white bg-red-600 px-2 py-0.5 rounded hover:bg-red-700"
                              >
                                ยืนยันลบถาวร
                              </button>
                              <button
                                onClick={() => setConfirmDeletePosId(null)}
                                className="text-xs text-gray-500 hover:underline"
                              >
                                ยกเลิก
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => setConfirmDeletePosId(pos.id)}
                              className="text-xs text-red-700 hover:underline"
                              title="ลบถาวร — ใช้ได้เฉพาะตำแหน่งที่ไม่มีพนักงานผูกอยู่"
                            >
                              ลบถาวร
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── DEPARTMENTS TAB ── */}
      {tab === 'departments' && (
        <div>
          <div className="flex gap-3 mb-3">
            <input
              type="text"
              placeholder="ค้นหาแผนก..."
              value={deptSearch}
              onChange={(e) => setDeptSearch(e.target.value)}
              className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => setShowAddDept(true)}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              + เพิ่มแผนก
            </button>
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-500 mb-4 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showInactiveDepts}
              onChange={(e) => setShowInactiveDepts(e.target.checked)}
              className="rounded border-gray-300"
            />
            แสดงแผนกที่ปิดใช้งานด้วย
          </label>

          {showAddDept && (
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 mb-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">
                เพิ่มแผนกใหม่
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  placeholder="ชื่อแผนก (ภาษาไทย) *"
                  value={newDept.name}
                  onChange={(e) =>
                    setNewDept((p) => ({ ...p, name: e.target.value }))
                  }
                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  placeholder="ชื่อแผนก (ภาษาอังกฤษ)"
                  value={newDept.nameEN}
                  onChange={(e) =>
                    setNewDept((p) => ({ ...p, nameEN: e.target.value }))
                  }
                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleAddDept}
                  disabled={savingDept}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {savingDept ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
                <button
                  onClick={() => setShowAddDept(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 transition-colors"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {loadingDepts ? (
              <div className="p-8 text-center text-sm text-gray-400">
                กำลังโหลด...
              </div>
            ) : filteredDepts.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400">
                ไม่พบข้อมูลแผนก
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      ชื่อแผนก
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      ชื่อภาษาอังกฤษ
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      สถานะ
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredDepts.map((dept) => {
                    const isActive = dept.active !== false;
                    return (
                      <tr
                        key={dept.id}
                        className={!isActive ? 'opacity-50' : ''}
                      >
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {dept.name}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {dept.nameEN}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              isActive
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {isActive ? 'ใช้งาน' : 'ปิดใช้งาน'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => setEditDept(dept)}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              แก้ไข
                            </button>
                            <button
                              onClick={() => handleToggleDept(dept)}
                              className={`text-xs ${
                                isActive ? 'text-red-500' : 'text-green-600'
                              } hover:underline`}
                            >
                              {isActive ? 'ปิด' : 'เปิด'}
                            </button>
                            {confirmDeleteDeptId === dept.id ? (
                              <>
                                <button
                                  onClick={() =>
                                    handlePermanentDeleteDept(dept)
                                  }
                                  className="text-xs text-white bg-red-600 px-2 py-0.5 rounded hover:bg-red-700"
                                >
                                  ยืนยันลบถาวร
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteDeptId(null)}
                                  className="text-xs text-gray-500 hover:underline"
                                >
                                  ยกเลิก
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => setConfirmDeleteDeptId(dept.id)}
                                className="text-xs text-red-700 hover:underline"
                                title="ลบถาวร — ใช้ได้เฉพาะแผนกที่ไม่มีตำแหน่ง/พนักงานผูกอยู่"
                              >
                                ลบถาวร
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Edit Position Modal */}
      {/* ── PRODUCTION LINES TAB ── */}
      {tab === 'production_lines' && (
        <div>
          <div className="flex gap-3 mb-4">
            <input
              type="text"
              placeholder="ค้นหาไลน์การผลิต..."
              value={lineSearch}
              onChange={(e) => setLineSearch(e.target.value)}
              className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => setShowAddLine(true)}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              + เพิ่มไลน์
            </button>
          </div>

          {showAddLine && (
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 mb-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">
                เพิ่มไลน์การผลิตใหม่
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  placeholder="รหัส (เช่น LINE_A) *"
                  value={newLine.code}
                  onChange={(e) =>
                    setNewLine((p) => ({
                      ...p,
                      code: e.target.value.toUpperCase(),
                    }))
                  }
                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  placeholder="ชื่อไลน์ *"
                  value={newLine.name}
                  onChange={(e) =>
                    setNewLine((p) => ({ ...p, name: e.target.value }))
                  }
                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  placeholder="คำอธิบาย"
                  value={newLine.description}
                  onChange={(e) =>
                    setNewLine((p) => ({ ...p, description: e.target.value }))
                  }
                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="number"
                  placeholder="ลำดับแสดงผล"
                  value={newLine.sortOrder}
                  onChange={(e) =>
                    setNewLine((p) => ({
                      ...p,
                      sortOrder: Number(e.target.value),
                    }))
                  }
                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleAddLine}
                  disabled={savingLine}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {savingLine ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
                <button
                  onClick={() => setShowAddLine(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 transition-colors"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {loadingLines ? (
              <div className="p-8 text-center text-sm text-gray-400">
                กำลังโหลด...
              </div>
            ) : filteredLines.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400">
                ไม่พบข้อมูลไลน์การผลิต
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      รหัส / ชื่อ
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      คำอธิบาย
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      สถานะ
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredLines.map((line) => (
                    <tr
                      key={line.id}
                      className={!line.active ? 'opacity-50' : ''}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{line.name}</p>
                        <p className="text-xs text-gray-400">{line.code}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {line.description || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            line.active
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {line.active ? 'ใช้งาน' : 'ปิดใช้งาน'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => setEditLine(line)}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            แก้ไข
                          </button>
                          <button
                            onClick={() => handleToggleLine(line)}
                            className={`text-xs ${
                              line.active ? 'text-red-500' : 'text-green-600'
                            } hover:underline`}
                          >
                            {line.active ? 'ปิด' : 'เปิด'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── FACTORY SETTINGS TAB ── */}
      {tab === 'factory' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 max-w-4xl">
          <h3 className="text-base font-semibold text-gray-900 mb-1">
            ตำแหน่งโรงงาน (สำหรับตรวจสอบ GPS ตอนเช็คอิน)
          </h3>
          <p className="text-xs text-gray-500 mb-5">
            ค่านี้คือจุดอ้างอิงที่ระบบใช้เทียบระยะห่างตอนพนักงานเช็คอิน —
            ปรับได้เองโดยไม่ต้องแก้โค้ด
          </p>

          {loadingFactory ? (
            <div className="text-sm text-gray-400">กำลังโหลด...</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Latitude
                  </label>
                  <input
                    type="text"
                    value={factoryForm.latitude}
                    onChange={(e) =>
                      setFactoryForm((p) => ({
                        ...p,
                        latitude: e.target.value,
                      }))
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Longitude
                  </label>
                  <input
                    type="text"
                    value={factoryForm.longitude}
                    onChange={(e) =>
                      setFactoryForm((p) => ({
                        ...p,
                        longitude: e.target.value,
                      }))
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  ที่อยู่ (แสดงผลเฉยๆ ไม่ใช้คำนวณ)
                </label>
                <input
                  type="text"
                  value={factoryForm.address}
                  onChange={(e) =>
                    setFactoryForm((p) => ({ ...p, address: e.target.value }))
                  }
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    รัศมีอนุมัติอัตโนมัติ (เมตร)
                  </label>
                  <input
                    type="number"
                    value={factoryForm.clockInApproveRadius}
                    onChange={(e) =>
                      setFactoryForm((p) => ({
                        ...p,
                        clockInApproveRadius: e.target.value,
                      }))
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    รัศมีที่ยัง Flag แต่เข้าได้ (เมตร)
                  </label>
                  <input
                    type="number"
                    value={factoryForm.clockInFlagRadius}
                    onChange={(e) =>
                      setFactoryForm((p) => ({
                        ...p,
                        clockInFlagRadius: e.target.value,
                      }))
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    รัศมีปฏิเสธ (เมตร)
                  </label>
                  <input
                    type="number"
                    value={factoryForm.clockInRejectRadius}
                    onChange={(e) =>
                      setFactoryForm((p) => ({
                        ...p,
                        clockInRejectRadius: e.target.value,
                      }))
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    ความแม่นยำ GPS สูงสุดที่ยอมรับ (เมตร)
                  </label>
                  <input
                    type="number"
                    value={factoryForm.clockInMaxAccuracy}
                    onChange={(e) =>
                      setFactoryForm((p) => ({
                        ...p,
                        clockInMaxAccuracy: e.target.value,
                      }))
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleSaveFactory}
                  disabled={savingFactory}
                  className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingFactory ? 'กำลังบันทึก...' : 'บันทึกตำแหน่งโรงงาน'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── LEAVE TYPES TAB ── */}
      {tab === 'leave_types' && (
        <div>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="flex-1 text-sm text-gray-500 flex items-center">
              ทั้งหมด {leaveTypes.length} ประเภท
            </div>
            <button
              onClick={handleSeedLeaveTypes}
              disabled={seedingLeaveTypes}
              className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {seedingLeaveTypes
                ? 'กำลังโหลด...'
                : 'โหลดข้อมูลเริ่มต้นตามระเบียบบริษัท (11 ประเภท)'}
            </button>
            <button
              onClick={() => setShowAddLeaveType(true)}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              + เพิ่มประเภทการลา
            </button>
          </div>

          {showAddLeaveType && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">
                เพิ่มประเภทการลาใหม่ (แบบพื้นฐาน)
              </h3>
              <p className="text-xs text-gray-400 mb-4">
                ฟอร์มนี้รองรับเฉพาะประเภทแบบง่าย (จำนวนวันคงที่) —
                ประเภทที่ซับซ้อน เช่น สิทธิตามอายุงาน (พักผ่อน) หรือตามเพศ
                (ลาคลอด) ใช้ปุ่ม &quot;โหลดข้อมูลเริ่มต้นตามระเบียบบริษัท&quot;
                ด้านบนแทน
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <input
                  placeholder="รหัส เช่น BEREAVEMENT *"
                  value={newLeaveType.code}
                  onChange={(e) =>
                    setNewLeaveType((p) => ({
                      ...p,
                      code: e.target.value.toUpperCase(),
                    }))
                  }
                  className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  placeholder="ชื่อไทย *"
                  value={newLeaveType.name}
                  onChange={(e) =>
                    setNewLeaveType((p) => ({ ...p, name: e.target.value }))
                  }
                  className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  placeholder="ชื่ออังกฤษ"
                  value={newLeaveType.nameEN}
                  onChange={(e) =>
                    setNewLeaveType((p) => ({ ...p, nameEN: e.target.value }))
                  }
                  className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="number"
                  placeholder="จำนวนวันที่ได้สิทธิ"
                  value={newLeaveType.fixedDays}
                  onChange={(e) =>
                    setNewLeaveType((p) => ({
                      ...p,
                      fixedDays: e.target.value,
                    }))
                  }
                  className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <select
                  value={newLeaveType.payType}
                  onChange={(e) =>
                    setNewLeaveType((p) => ({
                      ...p,
                      payType: e.target.value as typeof p.payType,
                    }))
                  }
                  className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="full">ได้รับค่าจ้างเต็ม</option>
                  <option value="partial">ได้รับค่าจ้างบางส่วน</option>
                  <option value="unpaid">ไม่ได้รับค่าจ้าง</option>
                </select>
                {newLeaveType.payType === 'partial' && (
                  <input
                    type="number"
                    placeholder="จ่าย % เช่น 50"
                    value={newLeaveType.payPercent}
                    onChange={(e) =>
                      setNewLeaveType((p) => ({
                        ...p,
                        payPercent: e.target.value,
                      }))
                    }
                    className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                )}
                <input
                  type="number"
                  placeholder="ต้องยื่นล่วงหน้า (วัน)"
                  value={newLeaveType.advanceNoticeDays}
                  onChange={(e) =>
                    setNewLeaveType((p) => ({
                      ...p,
                      advanceNoticeDays: e.target.value,
                    }))
                  }
                  className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <select
                  value={newLeaveType.requiresAttachment}
                  onChange={(e) =>
                    setNewLeaveType((p) => ({
                      ...p,
                      requiresAttachment: e.target
                        .value as typeof p.requiresAttachment,
                    }))
                  }
                  className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="never">ไม่ต้องมีหลักฐาน</option>
                  <option value="conditional">
                    ต้องมีหลักฐานแบบมีเงื่อนไข
                  </option>
                  <option value="always">ต้องมีหลักฐานทุกครั้ง</option>
                </select>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={newLeaveType.countsHolidays}
                    onChange={(e) =>
                      setNewLeaveType((p) => ({
                        ...p,
                        countsHolidays: e.target.checked,
                      }))
                    }
                    className="rounded"
                  />
                  นับรวมวันหยุด
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={newLeaveType.affectsAttendanceBonus}
                    onChange={(e) =>
                      setNewLeaveType((p) => ({
                        ...p,
                        affectsAttendanceBonus: e.target.checked,
                      }))
                    }
                    className="rounded"
                  />
                  ยังได้รับเบี้ยขยัน
                </label>
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={handleAddLeaveType}
                  disabled={savingLeaveType}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {savingLeaveType ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
                <button
                  onClick={() => setShowAddLeaveType(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 transition-colors"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          )}

          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
            {loadingLeaveTypes ? (
              <div className="text-center py-10 text-sm text-gray-400">
                กำลังโหลด...
              </div>
            ) : leaveTypes.length === 0 ? (
              <div className="text-center py-10 text-sm text-gray-400">
                ยังไม่มีประเภทการลา — กด
                &quot;โหลดข้อมูลเริ่มต้นตามระเบียบบริษัท&quot;
                ด้านบนเพื่อเริ่มต้น
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      ประเภท
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      สิทธิ
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      ค่าจ้าง
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      ล่วงหน้า
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      สถานะ
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {leaveTypes.map((lt) => {
                    const isActive = lt.active !== false;
                    const entitlementLabel =
                      lt.entitlementType === 'tenure_based'
                        ? `ตามอายุงาน (${lt.tenureTiers
                            ?.map((t) => `${t.minYears}ปี=${t.days}วัน`)
                            .join(', ')})`
                        : lt.entitlementType === 'gender_based'
                        ? `ชาย ${lt.genderEntitlement?.male ?? '-'} / หญิง ${
                            lt.genderEntitlement?.female ?? '-'
                          } วัน`
                        : lt.entitlementType === 'doctor_specified'
                        ? 'ตามที่แพทย์ระบุ'
                        : lt.entitlementType === 'per_occurrence'
                        ? `${lt.fixedDays ?? '-'} วัน / ${
                            lt.maxOccurrencesPerYear ?? '-'
                          } ครั้งปี`
                        : `${lt.fixedDays ?? '-'} วัน`;
                    const payLabel =
                      lt.payType === 'full'
                        ? 'เต็ม'
                        : lt.payType === 'partial'
                        ? `${lt.payPercent ?? '?'}%`
                        : 'ไม่จ่าย';
                    return (
                      <tr key={lt.id} className={!isActive ? 'opacity-50' : ''}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{lt.name}</p>
                          <p className="text-xs text-gray-400">{lt.nameEN}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs max-w-xs">
                          {entitlementLabel}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{payLabel}</td>
                        <td className="px-4 py-3 text-gray-600">
                          {lt.advanceNoticeDays} วัน
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              isActive
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {isActive ? 'ใช้งาน' : 'ปิดใช้งาน'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => setEditLeaveType(lt)}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              แก้ไข
                            </button>
                            <button
                              onClick={() => handleToggleLeaveType(lt)}
                              className={`text-xs ${
                                isActive ? 'text-red-500' : 'text-green-600'
                              } hover:underline`}
                            >
                              {isActive ? 'ปิด' : 'เปิด'}
                            </button>
                            {confirmDeleteLeaveTypeId === lt.id ? (
                              <>
                                <button
                                  onClick={() =>
                                    handlePermanentDeleteLeaveType(lt)
                                  }
                                  className="text-xs text-white bg-red-600 px-2 py-0.5 rounded hover:bg-red-700"
                                >
                                  ยืนยันลบถาวร
                                </button>
                                <button
                                  onClick={() =>
                                    setConfirmDeleteLeaveTypeId(null)
                                  }
                                  className="text-xs text-gray-500 hover:underline"
                                >
                                  ยกเลิก
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() =>
                                  setConfirmDeleteLeaveTypeId(lt.id)
                                }
                                className="text-xs text-red-700 hover:underline"
                              >
                                ลบถาวร
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
      {editPos && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl">
            <h3 className="text-base font-semibold text-gray-900 mb-4">
              แก้ไขตำแหน่ง — {editPos.code}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                placeholder="ชื่อตำแหน่ง *"
                value={editPos.name}
                onChange={(e) =>
                  setEditPos((p) => (p ? { ...p, name: e.target.value } : p))
                }
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <select
                value={editPos.departmentId}
                onChange={(e) =>
                  setEditPos((p) =>
                    p ? { ...p, departmentId: e.target.value } : p
                  )
                }
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <select
                value={editPos.employeeType}
                onChange={(e) =>
                  setEditPos((p) =>
                    p
                      ? { ...p, employeeType: e.target.value as EmployeeType }
                      : p
                  )
                }
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="blue_collar">Blue Collar</option>
                <option value="white_collar">White Collar</option>
              </select>
              <select
                value={editPos.defaultShiftId ?? ''}
                onChange={(e) =>
                  setEditPos((p) =>
                    p ? { ...p, defaultShiftId: e.target.value } : p
                  )
                }
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">ไม่ระบุกะ</option>
                <option value="DAY">กะเช้า</option>
                <option value="NIGHT">กะดึก</option>
                <option value="MAID">กะแม่บ้าน</option>
              </select>
              <input
                placeholder="Grade"
                value={editPos.grade ?? ''}
                onChange={(e) =>
                  setEditPos((p) => (p ? { ...p, grade: e.target.value } : p))
                }
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="number"
                placeholder="ลำดับ"
                value={editPos.sortOrder}
                onChange={(e) =>
                  setEditPos((p) =>
                    p ? { ...p, sortOrder: Number(e.target.value) } : p
                  )
                }
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={editPos.isSupervisor}
                  onChange={(e) =>
                    setEditPos((p) =>
                      p ? { ...p, isSupervisor: e.target.checked } : p
                    )
                  }
                  className="rounded"
                />
                เป็น Supervisor
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={editPos.active}
                  onChange={(e) =>
                    setEditPos((p) =>
                      p ? { ...p, active: e.target.checked } : p
                    )
                  }
                  className="rounded"
                />
                เปิดใช้งาน
              </label>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleSavePos}
                disabled={savingPos}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {savingPos ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
              <button
                onClick={() => setEditPos(null)}
                className="px-4 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 transition-colors"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Department Modal */}
      {editDept && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-base font-semibold text-gray-900 mb-4">
              แก้ไขแผนก
            </h3>
            <div className="space-y-3">
              <input
                placeholder="ชื่อแผนก (ภาษาไทย) *"
                value={editDept.name}
                onChange={(e) =>
                  setEditDept((p) => (p ? { ...p, name: e.target.value } : p))
                }
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                placeholder="ชื่อแผนก (ภาษาอังกฤษ)"
                value={editDept.nameEN}
                onChange={(e) =>
                  setEditDept((p) => (p ? { ...p, nameEN: e.target.value } : p))
                }
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleSaveDept}
                disabled={savingDept}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {savingDept ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
              <button
                onClick={() => setEditDept(null)}
                className="px-4 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 transition-colors"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Edit Production Line Modal */}
      {editLine && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-base font-semibold text-gray-900 mb-4">
              แก้ไขไลน์การผลิต — {editLine.code}
            </h3>
            <div className="space-y-3">
              <input
                placeholder="ชื่อไลน์ *"
                value={editLine.name}
                onChange={(e) =>
                  setEditLine((p) => (p ? { ...p, name: e.target.value } : p))
                }
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                placeholder="คำอธิบาย"
                value={editLine.description ?? ''}
                onChange={(e) =>
                  setEditLine((p) =>
                    p ? { ...p, description: e.target.value } : p
                  )
                }
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="number"
                placeholder="ลำดับ"
                value={editLine.sortOrder}
                onChange={(e) =>
                  setEditLine((p) =>
                    p ? { ...p, sortOrder: Number(e.target.value) } : p
                  )
                }
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={editLine.active}
                  onChange={(e) =>
                    setEditLine((p) =>
                      p ? { ...p, active: e.target.checked } : p
                    )
                  }
                  className="rounded"
                />
                เปิดใช้งาน
              </label>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleSaveLine}
                disabled={savingLine}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {savingLine ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
              <button
                onClick={() => setEditLine(null)}
                className="px-4 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 transition-colors"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Leave Type Modal */}
      {editLeaveType && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl max-h-[85vh] overflow-y-auto">
            <h3 className="text-base font-semibold text-gray-900 mb-1">
              แก้ไข — {editLeaveType.name}
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              รหัส {editLeaveType.code} · แบบ {editLeaveType.entitlementType}
            </p>

            <div className="space-y-3">
              <input
                placeholder="ชื่อไทย"
                value={editLeaveType.name}
                onChange={(e) =>
                  setEditLeaveType((p) =>
                    p ? { ...p, name: e.target.value } : p
                  )
                }
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                placeholder="ชื่ออังกฤษ"
                value={editLeaveType.nameEN}
                onChange={(e) =>
                  setEditLeaveType((p) =>
                    p ? { ...p, nameEN: e.target.value } : p
                  )
                }
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              {/* entitlement-specific fields */}
              {(editLeaveType.entitlementType === 'fixed' ||
                editLeaveType.entitlementType === 'doctor_specified' ||
                editLeaveType.entitlementType === 'per_occurrence') && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    จำนวนวันที่ได้สิทธิ
                  </label>
                  <input
                    type="number"
                    value={editLeaveType.fixedDays ?? ''}
                    onChange={(e) =>
                      setEditLeaveType((p) =>
                        p ? { ...p, fixedDays: Number(e.target.value) } : p
                      )
                    }
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              {editLeaveType.entitlementType === 'per_occurrence' && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    จำนวนครั้งสูงสุดต่อปี
                  </label>
                  <input
                    type="number"
                    value={editLeaveType.maxOccurrencesPerYear ?? ''}
                    onChange={(e) =>
                      setEditLeaveType((p) =>
                        p
                          ? {
                              ...p,
                              maxOccurrencesPerYear: Number(e.target.value),
                            }
                          : p
                      )
                    }
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              {editLeaveType.entitlementType === 'tenure_based' && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    สิทธิตามอายุงาน (ปีขั้นต่ำ = จำนวนวัน)
                  </label>
                  <div className="space-y-2">
                    {(editLeaveType.tenureTiers ?? []).map((tier, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <input
                          type="number"
                          value={tier.minYears}
                          onChange={(e) =>
                            setEditLeaveType((p) => {
                              if (!p) return p;
                              const tiers = [...(p.tenureTiers ?? [])];
                              tiers[idx] = {
                                ...tiers[idx],
                                minYears: Number(e.target.value),
                              };
                              return { ...p, tenureTiers: tiers };
                            })
                          }
                          className="w-20 px-2 py-1.5 rounded-lg border border-gray-200 text-sm"
                        />
                        <span className="text-xs text-gray-400">ปี =</span>
                        <input
                          type="number"
                          value={tier.days}
                          onChange={(e) =>
                            setEditLeaveType((p) => {
                              if (!p) return p;
                              const tiers = [...(p.tenureTiers ?? [])];
                              tiers[idx] = {
                                ...tiers[idx],
                                days: Number(e.target.value),
                              };
                              return { ...p, tenureTiers: tiers };
                            })
                          }
                          className="w-20 px-2 py-1.5 rounded-lg border border-gray-200 text-sm"
                        />
                        <span className="text-xs text-gray-400">วัน</span>
                        <button
                          onClick={() =>
                            setEditLeaveType((p) => {
                              if (!p) return p;
                              const tiers = (p.tenureTiers ?? []).filter(
                                (_, i) => i !== idx
                              );
                              return { ...p, tenureTiers: tiers };
                            })
                          }
                          className="text-xs text-red-500 hover:underline ml-1"
                        >
                          ลบ
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() =>
                        setEditLeaveType((p) =>
                          p
                            ? {
                                ...p,
                                tenureTiers: [
                                  ...(p.tenureTiers ?? []),
                                  { minYears: 0, days: 0 },
                                ],
                              }
                            : p
                        )
                      }
                      className="text-xs text-blue-600 hover:underline"
                    >
                      + เพิ่มระดับ
                    </button>
                  </div>
                </div>
              )}

              {editLeaveType.entitlementType === 'gender_based' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      สิทธิ (ชาย) วัน
                    </label>
                    <input
                      type="number"
                      value={editLeaveType.genderEntitlement?.male ?? ''}
                      onChange={(e) =>
                        setEditLeaveType((p) =>
                          p
                            ? {
                                ...p,
                                genderEntitlement: {
                                  ...p.genderEntitlement,
                                  male: Number(e.target.value),
                                },
                              }
                            : p
                        )
                      }
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      สิทธิ (หญิง) วัน
                    </label>
                    <input
                      type="number"
                      value={editLeaveType.genderEntitlement?.female ?? ''}
                      onChange={(e) =>
                        setEditLeaveType((p) =>
                          p
                            ? {
                                ...p,
                                genderEntitlement: {
                                  ...p.genderEntitlement,
                                  female: Number(e.target.value),
                                },
                              }
                            : p
                        )
                      }
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    ค่าจ้าง
                  </label>
                  <select
                    value={editLeaveType.payType}
                    onChange={(e) =>
                      setEditLeaveType((p) =>
                        p
                          ? {
                              ...p,
                              payType: e.target.value as LeaveType['payType'],
                            }
                          : p
                      )
                    }
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="full">เต็ม</option>
                    <option value="partial">บางส่วน</option>
                    <option value="unpaid">ไม่จ่าย</option>
                  </select>
                </div>
                {editLeaveType.payType === 'partial' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      จ่าย %
                    </label>
                    <input
                      type="number"
                      value={editLeaveType.payPercent ?? ''}
                      onChange={(e) =>
                        setEditLeaveType((p) =>
                          p ? { ...p, payPercent: Number(e.target.value) } : p
                        )
                      }
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  ต้องยื่นล่วงหน้า (วัน)
                </label>
                <input
                  type="number"
                  value={editLeaveType.advanceNoticeDays}
                  onChange={(e) =>
                    setEditLeaveType((p) =>
                      p
                        ? { ...p, advanceNoticeDays: Number(e.target.value) }
                        : p
                    )
                  }
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  หลักฐานประกอบ
                </label>
                <select
                  value={editLeaveType.requiresAttachment}
                  onChange={(e) =>
                    setEditLeaveType((p) =>
                      p
                        ? {
                            ...p,
                            requiresAttachment: e.target
                              .value as LeaveType['requiresAttachment'],
                          }
                        : p
                    )
                  }
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="never">ไม่ต้องมีหลักฐาน</option>
                  <option value="conditional">ต้องมีแบบมีเงื่อนไข</option>
                  <option value="always">ต้องมีทุกครั้ง</option>
                </select>
              </div>

              {editLeaveType.requiresAttachment !== 'never' && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    เงื่อนไขหลักฐาน
                  </label>
                  <input
                    value={editLeaveType.attachmentCondition ?? ''}
                    onChange={(e) =>
                      setEditLeaveType((p) =>
                        p ? { ...p, attachmentCondition: e.target.value } : p
                      )
                    }
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={editLeaveType.countsHolidays}
                  onChange={(e) =>
                    setEditLeaveType((p) =>
                      p ? { ...p, countsHolidays: e.target.checked } : p
                    )
                  }
                  className="rounded"
                />
                นับรวมวันหยุด
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={editLeaveType.affectsAttendanceBonus}
                  onChange={(e) =>
                    setEditLeaveType((p) =>
                      p ? { ...p, affectsAttendanceBonus: e.target.checked } : p
                    )
                  }
                  className="rounded"
                />
                ยังได้รับเบี้ยขยัน
              </label>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  หมายเหตุ/เงื่อนไขเพิ่มเติม
                </label>
                <textarea
                  value={editLeaveType.notes ?? ''}
                  onChange={(e) =>
                    setEditLeaveType((p) =>
                      p ? { ...p, notes: e.target.value } : p
                    )
                  }
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={handleSaveEditLeaveType}
                disabled={savingEditLeaveType}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {savingEditLeaveType ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
              <button
                onClick={() => setEditLeaveType(null)}
                className="px-4 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 transition-colors"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
