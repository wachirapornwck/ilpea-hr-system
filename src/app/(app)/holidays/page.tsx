'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import PageHeader from '@/components/layout/PageHeader';
import HolidayDonutChart from '@/components/holidays/HolidayDonutChart';
import HolidayDetailDrawer from '@/components/holidays/HolidayDetailDrawer';
import HolidayTypeManageModal from '@/components/holidays/HolidayTypeManageModal';
import { useAuth } from '@/lib/auth/context';
import { cn } from '@/lib/utils';
import type { Holiday } from '@/types/holiday';

const THAI_MONTHS = [
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
const THAI_DAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

function toBuddhistYear(y: number) {
  return y + 543;
}

// ⚠️ ROOT CAUSE ของบั๊ก "ลงวันที่ 1 แต่ปฏิทินขึ้นวันที่ 2":
// date.toISOString() แปลงเวลาเป็น UTC ก่อน slice ถ้า browser อยู่ timezone
// UTC+7 (ไทย) เที่ยงคืนวันที่ 2 ตามเวลาท้องถิ่นจะกลายเป็น 17:00 ของวันที่ 1
// ใน UTC ทำให้ toISOString() คืนค่าวันที่ 1 ทั้งที่ cell นั้นควรจะเป็นวันที่ 2
// ห้ามใช้ .toISOString() กับ Date ที่สร้างจาก local calendar grid เด็ดขาด —
// ต้องดึง year/month/date จาก local component ตรงๆ แทน
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// =============================================================================
// CSV Import — ไม่มี library แปลง CSV/Excel ติดตั้งในโปรเจกต์เลย (เช็ค
// package.json แล้ว) จึงรองรับเฉพาะ CSV ด้วย parser ง่ายๆ ที่เขียนเอง ไม่ต้อง
// เพิ่ม dependency ใหม่ — ถ้าไฟล์เป็น .xlsx ต้อง save as CSV ก่อน
// =============================================================================

interface ParsedImportRow {
  rowNumber: number;
  name: string;
  nameEN?: string;
  date: string;
  type: string;
  description?: string;
  repeatEveryYear: boolean;
  error?: string;
}

// =============================================================================
// Birthday Entry — shape returned by GET /api/employees/birthdays.
// Defined locally (not a shared types file) per explicit scope of this phase:
// this data is used in isolation on the Holiday Calendar page only, for now.
// =============================================================================
interface BirthdayEntry {
  id: string;
  firstNameTH: string;
  lastNameTH: string;
  nickname?: string;
  departmentName: string;
  birthMonth: number; // 1-12
  birthDay: number; // 1-31
  daysUntilNextBirthday: number;
}

const IMPORT_TEMPLATE_HEADERS = [
  'name',
  'nameEN',
  'date',
  'type',
  'description',
  'repeatEveryYear',
];

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map((s) => s.trim());
}

function parseHolidayCsv(text: string): ParsedImportRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const rows: ParsedImportRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const get = (key: string) => {
      const idx = headers.indexOf(key.toLowerCase());
      return idx >= 0 ? (cells[idx] ?? '').trim() : '';
    };

    const name = get('name');
    const date = get('date');
    const type = get('type');
    const nameEN = get('nameEN');
    const description = get('description');
    const repeatRaw = get('repeatEveryYear').toLowerCase();
    const repeatEveryYear = ['true', '1', 'yes', 'y'].includes(repeatRaw);

    let error: string | undefined;
    if (!name) error = 'ไม่มีชื่อวันหยุด (name)';
    else if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
      error = 'วันที่ไม่ถูกต้อง ต้องเป็น YYYY-MM-DD (date)';
    else if (!type) error = 'ไม่มีประเภทวันหยุด (type)';

    rows.push({
      rowNumber: i + 1,
      name,
      nameEN: nameEN || undefined,
      date,
      type,
      description: description || undefined,
      repeatEveryYear,
      error,
    });
  }

  return rows;
}

function rowsToParsedImportRows(
  data: Record<string, any>[],
  dateToStr: (v: any) => string
): ParsedImportRow[] {
  return data.map((raw, i) => {
    // header key อาจมาแบบ case ต่างกัน (Excel มักรักษา case ตามที่พิมพ์)
    const keys = Object.keys(raw).reduce((acc, k) => {
      acc[k.toLowerCase()] = k;
      return acc;
    }, {} as Record<string, string>);
    const get = (key: string) => {
      const actualKey = keys[key.toLowerCase()];
      return actualKey !== undefined ? String(raw[actualKey] ?? '').trim() : '';
    };

    const name = get('name');
    const rawDate = keys['date'] !== undefined ? raw[keys['date']] : '';
    const date = dateToStr(rawDate);
    const type = get('type');
    const nameEN = get('nameen');
    const description = get('description');
    const repeatRaw = get('repeateveryyear').toLowerCase();
    const repeatEveryYear = ['true', '1', 'yes', 'y'].includes(repeatRaw);

    let error: string | undefined;
    if (!name) error = 'ไม่มีชื่อวันหยุด (name)';
    else if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
      error =
        'วันที่ไม่ถูกต้อง ต้องเป็น YYYY-MM-DD หรือ date cell ใน Excel (date)';
    else if (!type) error = 'ไม่มีประเภทวันหยุด (type)';

    return {
      rowNumber: i + 2, // +2 เพราะแถว 1 คือ header
      name,
      nameEN: nameEN || undefined,
      date,
      type,
      description: description || undefined,
      repeatEveryYear,
      error,
    };
  });
}

// แปลงค่าวันที่จากไฟล์ Excel เป็น "YYYY-MM-DD" — รองรับทั้งกรณีที่ cell
// ถูกจัดรูปแบบเป็นวันที่จริง (จะได้ JS Date จาก cellDates:true) และกรณีที่
// เป็นข้อความธรรมดา (พิมพ์ "2026-01-01" มาตรงๆ)
function excelValueToDateStr(v: any): string {
  if (v instanceof Date) return toLocalDateStr(v);
  const s = String(v ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return '';
}

async function parseHolidayXlsx(file: File): Promise<ParsedImportRow[]> {
  // dynamic import กัน xlsx (ไลบรารีขนาดค่อนข้างใหญ่) ไม่ให้ไปรวมอยู่ใน
  // bundle หลักของหน้านี้ — โหลดเฉพาะตอนผู้ใช้เลือกไฟล์ .xlsx จริงๆ เท่านั้น
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const data = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
    defval: '',
  });
  return rowsToParsedImportRows(data, excelValueToDateStr);
}

function downloadCsvTemplate() {
  const sample = [
    IMPORT_TEMPLATE_HEADERS.join(','),
    'วันขึ้นปีใหม่,"New Year\'s Day",2026-01-01,Public Holiday,,true',
    'วันหยุดพิเศษบริษัท,,2026-02-14,Company Holiday,ปิดทำการกรณีพิเศษ,false',
  ].join('\r\n');
  // ใส่ BOM (\uFEFF) ไว้หน้าไฟล์ ป้องกัน Excel อ่านภาษาไทยเพี้ยน
  const blob = new Blob(['\uFEFF' + sample], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'holiday-import-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// สีตาม "ประเภท" แบบ pattern-match คำสำคัญ — ไม่ fix เป็น union เพราะ type
// เป็นข้อความอิสระ (เพิ่มประเภทใหม่ได้โดยไม่ต้องแก้โค้ด) ประเภทที่ไม่ตรงคำ
// แนะนำเลยจะได้สีเทาเข้ม (slate) เป็นค่า default แทนการ error
function getHolidayColor(h: Holiday): {
  hex: string;
  bg: string;
  text: string;
} {
  if (h.isActive === false)
    return { hex: '#94A3B8', bg: 'bg-gray-100', text: 'text-gray-500' };
  const t = h.type.toLowerCase();
  if (t.includes('public'))
    return { hex: '#F43F5E', bg: 'bg-rose-50', text: 'text-rose-600' };
  if (t.includes('company'))
    return { hex: '#10B981', bg: 'bg-emerald-50', text: 'text-emerald-600' };
  if (t.includes('special'))
    return { hex: '#F59E0B', bg: 'bg-amber-50', text: 'text-amber-600' };
  if (t.includes('substitute'))
    return { hex: '#6366F1', bg: 'bg-indigo-50', text: 'text-indigo-600' };
  return { hex: '#64748B', bg: 'bg-slate-100', text: 'text-slate-600' };
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
      className={cn(
        'fixed bottom-6 right-6 z-50 max-w-sm px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-start gap-2',
        type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
      )}
    >
      <span>{type === 'success' ? '✓' : '✕'}</span>
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="opacity-70 hover:opacity-100">
        ×
      </button>
    </div>
  );
}

const emptyForm = {
  name: '',
  nameEN: '',
  date: toLocalDateStr(new Date()),
  endDate: toLocalDateStr(new Date()),
  type: '',
  description: '',
  repeatEveryYear: false,
};

const TABLE_PAGE_SIZE = 5;

export default function HolidaysPage() {
  const { user } = useAuth();
  // Mirrors the backend's assertRequesterIsHR() role check exactly
  // (admin/hr_manager) — UI-only gating, backend remains the source of
  // truth/enforcement. Not department-aware by design; that is scoped as a
  // separate, system-wide Permission Enhancement per current roadmap.
  const isHR = user?.role === 'admin' || user?.role === 'hr_manager';

  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);

  // Birthday data — completely isolated from Holiday state/loading above.
  // Not rendered anywhere yet (Step 1 only wires up the fetch).
  const [birthdays, setBirthdays] = useState<BirthdayEntry[]>([]);
  const [birthdaysLoading, setBirthdaysLoading] = useState(true);

  // Holiday Type master data (Phase D Step 1) — same isolated
  // fetch/loading pattern as birthdays above. Dropdown/filter wiring is a
  // later step; this step only fetches and stores the data + opens the
  // management modal.
  const [holidayTypes, setHolidayTypes] = useState<
    { id: string; name: string; isActive: boolean }[]
  >([]);
  const [holidayTypesLoading, setHolidayTypesLoading] = useState(true);
  const [showTypeManageModal, setShowTypeManageModal] = useState(false);

  const [viewMode, setViewMode] = useState<'month' | 'week' | 'list'>('month');
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth()); // 0-11

  const [calType, setCalType] = useState('');
  const [calSearch, setCalSearch] = useState('');
  // Year Filter — intentionally separate from `currentYear` (which drives
  // Calendar Navigation only). This filters Summary/Statistics/Table
  // client-side against already-fetched `holidays`, never refetches.
  const [listYearFilter, setListYearFilter] = useState(() =>
    String(today.getFullYear())
  );

  const [drawerHoliday, setDrawerHoliday] = useState<Holiday | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [drawerConfirmingDelete, setDrawerConfirmingDelete] = useState(false);

  const [showCloneModal, setShowCloneModal] = useState(false);
  const [cloneSourceYear, setCloneSourceYear] = useState(today.getFullYear());
  const [cloneTargetYear, setCloneTargetYear] = useState(
    today.getFullYear() + 1
  );
  const [cloning, setCloning] = useState(false);

  const [showImportModal, setShowImportModal] = useState(false);
  const [importFileName, setImportFileName] = useState('');
  const [importRows, setImportRows] = useState<ParsedImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    created: number;
    failed: string[];
  } | null>(null);

  // Recent Holidays table state
  const [tableSearch, setTableSearch] = useState('');
  const [tableSortField, setTableSortField] = useState<
    'date' | 'name' | 'type' | 'createdAt'
  >('createdAt');
  const [tableSortDir, setTableSortDir] = useState<'asc' | 'desc'>('desc');
  const [tablePage, setTablePage] = useState(1);

  const fetchHolidays = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/holidays?requesterId=${user.id}`);
      const json = await res.json();
      if (json.success) setHolidays(json.data);
      else
        setToast({
          message: json.error?.message ?? 'โหลดข้อมูลไม่สำเร็จ',
          type: 'error',
        });
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchHolidays();
  }, [fetchHolidays]);

  // Birthday fetch — same convention as fetchHolidays above, but kept in its
  // own function/effect/loading flag so it can never affect Holiday state.
  const fetchBirthdays = useCallback(async () => {
    if (!user?.id) return;
    setBirthdaysLoading(true);
    try {
      const res = await fetch(
        `/api/employees/birthdays?requesterId=${user.id}`
      );
      const json = await res.json();
      if (json.success) setBirthdays(json.data);
      else
        setToast({
          message: json.error?.message ?? 'โหลดข้อมูลวันเกิดไม่สำเร็จ',
          type: 'error',
        });
    } finally {
      setBirthdaysLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchBirthdays();
  }, [fetchBirthdays]);

  // Holiday Type fetch (Phase D Step 1) — same isolated convention as
  // fetchBirthdays above. Stores both active and inactive; which subset to
  // use where (dropdown vs filter vs legacy fallback) is wired in the next
  // step, not this one.
  const fetchHolidayTypes = useCallback(async () => {
    if (!user?.id) return;
    setHolidayTypesLoading(true);
    try {
      const res = await fetch(`/api/holiday-types?requesterId=${user.id}`);
      const json = await res.json();
      if (json.success) setHolidayTypes(json.data);
      else
        setToast({
          message: json.error?.message ?? 'โหลดข้อมูลประเภทวันหยุดไม่สำเร็จ',
          type: 'error',
        });
    } finally {
      setHolidayTypesLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchHolidayTypes();
  }, [fetchHolidayTypes]);

  const availableTypes = useMemo(() => {
    // Legacy types: any h.type value that still exists in real holiday
    // data but isn't (or no longer is) an active holidayTypes entry —
    // kept in the filter so those holidays remain findable.
    const fromData = Array.from(new Set(holidays.map((h) => h.type))).filter(
      Boolean
    );
    const activeTypeNames = holidayTypes
      .filter((t) => t.isActive)
      .map((t) => t.name);
    return Array.from(new Set([...activeTypeNames, ...fromData]));
  }, [holidays, holidayTypes]);

  // ── Calendar grid for current month ──────────────────────
  const calendarWeeks = useMemo(() => {
    const firstOfMonth = new Date(currentYear, currentMonth, 1);
    const startOffset = firstOfMonth.getDay(); // 0=Sun
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

    const cells: { date: Date; inMonth: boolean }[] = [];
    for (let i = startOffset - 1; i >= 0; i--) {
      cells.push({
        date: new Date(currentYear, currentMonth - 1, daysInPrevMonth - i),
        inMonth: false,
      });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({
        date: new Date(currentYear, currentMonth, d),
        inMonth: true,
      });
    }
    while (cells.length % 7 !== 0 || cells.length < 42) {
      const last = cells[cells.length - 1].date;
      const next = new Date(last);
      next.setDate(next.getDate() + 1);
      cells.push({ date: next, inMonth: false });
      if (cells.length >= 42) break;
    }

    const weeks: { date: Date; inMonth: boolean }[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  }, [currentYear, currentMonth]);

  const holidaysByDate = useMemo(() => {
    const map = new Map<string, Holiday[]>();
    let filtered = holidays;
    if (calType) filtered = filtered.filter((h) => h.type === calType);
    if (calSearch.trim()) {
      const q = calSearch.trim().toLowerCase();
      filtered = filtered.filter((h) => h.name.toLowerCase().includes(q));
    }
    for (const h of filtered) {
      const arr = map.get(h.date) ?? [];
      arr.push(h);
      map.set(h.date, arr);
    }
    return map;
  }, [holidays, calType, calSearch]);

  // Birthdays recur every year, so they're keyed by "MM-DD" (month/day only)
  // rather than a full date like holidaysByDate — a birthday on 1990-05-12
  // must match every May 12th cell regardless of calendar year.
  const birthdaysByMonthDay = useMemo(() => {
    const map = new Map<string, BirthdayEntry[]>();
    for (const b of birthdays) {
      const key = `${String(b.birthMonth).padStart(2, '0')}-${String(
        b.birthDay
      ).padStart(2, '0')}`;
      const arr = map.get(key) ?? [];
      arr.push(b);
      map.set(key, arr);
    }
    return map;
  }, [birthdays]);

  const todayStr = toLocalDateStr(today);

  // ── Upcoming holidays (active, today or later) ───────────
  const upcomingHolidays = useMemo(() => {
    return holidays
      .filter((h) => h.isActive !== false && h.date >= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 4);
  }, [holidays, todayStr]);

  const daysUntil = (dateStr: string) => {
    const diff = Math.round(
      (new Date(dateStr + 'T00:00:00').getTime() -
        new Date(todayStr + 'T00:00:00').getTime()) /
        (1000 * 60 * 60 * 24)
    );
    return diff;
  };

  // ── Upcoming Holidays widget — normalized event model ─────
  // Merges upcomingHolidays (Holiday[]) and birthdays (BirthdayEntry[]) into
  // one common shape so the widget can render both from a single list,
  // sorted by days-until. Holiday styling/behavior (colors, click-to-open
  // drawer) is untouched — birthdays get their own 🎂 presentation.
  // Scoped to the Upcoming Holidays widget only; Calendar/Statistics/Table
  // are not touched by this normalization.
  type UpcomingEvent =
    | { kind: 'holiday'; key: string; daysUntil: number; holiday: Holiday }
    | {
        kind: 'birthday';
        key: string;
        daysUntil: number;
        birthday: BirthdayEntry;
      };

  const upcomingEvents = useMemo<UpcomingEvent[]>(() => {
    const holidayEvents: UpcomingEvent[] = upcomingHolidays.map((h) => ({
      kind: 'holiday',
      key: `holiday-${h.id}`,
      daysUntil: daysUntil(h.date),
      holiday: h,
    }));

    const birthdayEvents: UpcomingEvent[] = birthdays.map((b) => ({
      kind: 'birthday',
      key: `birthday-${b.id}`,
      daysUntil: b.daysUntilNextBirthday,
      birthday: b,
    }));

    return [...holidayEvents, ...birthdayEvents]
      .sort((a, b) => a.daysUntil - b.daysUntil)
      .slice(0, 4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upcomingHolidays, birthdays, todayStr]);

  // ── Year Filter options — derived from actual holiday.date values only ───
  const availableYears = useMemo(() => {
    const years = new Set(holidays.map((h) => h.date.slice(0, 4)));
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [holidays]);

  // ── Holiday summary (donut) — respects listYearFilter (not currentYear) ──
  const summary = useMemo(() => {
    const yearFiltered = listYearFilter
      ? holidays.filter((h) => h.date.startsWith(listYearFilter))
      : holidays;
    const countByBucket = {
      public: 0,
      company: 0,
      special: 0,
      substitute: 0,
      other: 0,
      inactive: 0,
    };
    for (const h of yearFiltered) {
      if (h.isActive === false) {
        countByBucket.inactive++;
        continue;
      }
      const t = h.type.toLowerCase();
      if (t.includes('public')) countByBucket.public++;
      else if (t.includes('company')) countByBucket.company++;
      else if (t.includes('special')) countByBucket.special++;
      else if (t.includes('substitute')) countByBucket.substitute++;
      else countByBucket.other++;
    }
    return { ...countByBucket, total: yearFiltered.length };
  }, [holidays, listYearFilter]);

  // ── Statistics Cards — reuses `summary` (Public/Company counts) and
  // `upcomingHolidays[0]` (next holiday only — Holiday-specific, not the
  // merged Holiday+Birthday upcomingEvents list) without recomputing either.
  const statsCards = useMemo(() => {
    const next = upcomingHolidays[0];
    return {
      total: summary.total,
      public: summary.public,
      company: summary.company,
      next: next ? { name: next.name, days: daysUntil(next.date) } : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary, upcomingHolidays, todayStr]);

  // ── Recent Holidays table ─────────────────────────────────
  const tableFiltered = useMemo(() => {
    let items = [...holidays];
    if (listYearFilter) {
      items = items.filter((h) => h.date.startsWith(listYearFilter));
    }
    if (tableSearch.trim()) {
      const q = tableSearch.trim().toLowerCase();
      items = items.filter((h) => h.name.toLowerCase().includes(q));
    }
    items.sort((a, b) => {
      const av = (a[tableSortField] ?? '') as string;
      const bv = (b[tableSortField] ?? '') as string;
      const cmp = av.localeCompare(bv);
      return tableSortDir === 'asc' ? cmp : -cmp;
    });
    return items;
  }, [holidays, listYearFilter, tableSearch, tableSortField, tableSortDir]);

  const tableTotalPages = Math.max(
    1,
    Math.ceil(tableFiltered.length / TABLE_PAGE_SIZE)
  );
  const tablePaged = tableFiltered.slice(
    (tablePage - 1) * TABLE_PAGE_SIZE,
    tablePage * TABLE_PAGE_SIZE
  );

  const toggleTableSort = (field: typeof tableSortField) => {
    if (tableSortField === field) {
      setTableSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setTableSortField(field);
      setTableSortDir('asc');
    }
    setTablePage(1);
  };

  // ── CRUD handlers ─────────────────────────────────────────
  const openAddModal = () => {
    setEditing(null);
    const firstActiveType = holidayTypes.find((t) => t.isActive);
    setForm({ ...emptyForm, type: firstActiveType?.name ?? '' });
    setFormError('');
    setShowModal(true);
  };

  const openEditModal = (h: Holiday) => {
    setDrawerHoliday(null);
    setEditing(h);
    setForm({
      name: h.name,
      nameEN: h.nameEN ?? '',
      date: h.date,
      endDate: h.date,
      type: h.type,
      description: h.description ?? '',
      repeatEveryYear: h.repeatEveryYear ?? false,
    });
    setFormError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!user?.id) return;
    if (!form.name.trim()) return setFormError('กรุณาระบุชื่อวันหยุด');
    if (!form.date) return setFormError('กรุณาระบุวันที่เริ่ม');
    if (!editing && !form.endDate)
      return setFormError('กรุณาระบุวันที่สิ้นสุด');
    if (!editing && form.endDate < form.date) {
      return setFormError('วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม');
    }
    if (!form.type.trim()) return setFormError('กรุณาระบุประเภทวันหยุด');
    setFormError('');
    setSaving(true);
    try {
      if (editing) {
        // แก้ไข — 1 doc เดิม 1 วัน เหมือนเดิม
        const res = await fetch(`/api/holidays/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requesterId: user.id,
            name: form.name.trim(),
            nameEN: form.nameEN.trim() || undefined,
            date: form.date,
            type: form.type.trim(),
            description: form.description.trim() || undefined,
            repeatEveryYear: form.repeatEveryYear,
          }),
        });
        const json = await res.json();
        if (json.success) {
          setToast({ message: json.message, type: 'success' });
          setShowModal(false);
          fetchHolidays();
        } else {
          setFormError(json.error?.message ?? 'เกิดข้อผิดพลาด');
        }
        return;
      }

      // เพิ่มใหม่ — รองรับช่วงวันที่ สร้างทีละวันแยกกัน (แต่ละวันคือ 1 doc
      // เพราะ field `date` ของ Holiday ต้องเป็นวันเดียวเสมอ — 5 route ของ
      // Attendance เช็คแบบ exact-date match ไม่รองรับ date range)
      const dates: string[] = [];
      const cursor = new Date(form.date + 'T00:00:00');
      const end = new Date(form.endDate + 'T00:00:00');
      while (cursor <= end) {
        dates.push(toLocalDateStr(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }

      let created = 0;
      const failed: string[] = [];
      for (const d of dates) {
        const res = await fetch('/api/holidays', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requesterId: user.id,
            name: form.name.trim(),
            nameEN: form.nameEN.trim() || undefined,
            date: d,
            type: form.type.trim(),
            description: form.description.trim() || undefined,
            repeatEveryYear: form.repeatEveryYear,
          }),
        });
        const json = await res.json();
        if (json.success) {
          created++;
        } else {
          failed.push(`${d}: ${json.error?.message ?? 'ผิดพลาด'}`);
        }
      }

      if (created > 0) {
        setToast({
          message:
            dates.length === 1
              ? 'เพิ่มวันหยุดสำเร็จ'
              : `เพิ่มวันหยุดสำเร็จ ${created}/${dates.length} วัน${
                  failed.length > 0 ? ` (ข้าม: ${failed.join(' | ')})` : ''
                }`,
          type: 'success',
        });
        setShowModal(false);
        fetchHolidays();
      } else {
        setFormError(failed.join(' | ') || 'เกิดข้อผิดพลาด');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (h: Holiday) => {
    if (!user?.id) return;
    const isActive = h.isActive !== false;
    const url = isActive
      ? `/api/holidays/${h.id}?requesterId=${user.id}`
      : `/api/holidays/${h.id}`;
    const res = await fetch(url, {
      method: isActive ? 'DELETE' : 'PATCH',
      ...(isActive
        ? {}
        : {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requesterId: user.id, isActive: true }),
          }),
    });
    const json = await res.json();
    if (json.success) {
      setToast({
        message: isActive ? 'ปิดใช้งานแล้ว' : 'เปิดใช้งานแล้ว',
        type: 'success',
      });
      fetchHolidays();
    } else {
      setToast({
        message: json.error?.message ?? 'เกิดข้อผิดพลาด',
        type: 'error',
      });
    }
  };

  const handlePermanentDelete = async (h: Holiday) => {
    if (!user?.id) return;
    setConfirmDeleteId(null);
    setDrawerConfirmingDelete(false);
    setDrawerHoliday(null);
    const res = await fetch(
      `/api/holidays/${h.id}?requesterId=${user.id}&permanent=true`,
      {
        method: 'DELETE',
      }
    );
    const json = await res.json();
    if (json.success) {
      setToast({ message: 'ลบวันหยุดถาวรสำเร็จ', type: 'success' });
      fetchHolidays();
    } else {
      setToast({
        message: json.error?.message ?? 'เกิดข้อผิดพลาด',
        type: 'error',
      });
    }
  };

  const goToday = () => {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
  };
  const goPrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };
  const goNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const handleImportFileSelect = (file: File) => {
    setImportFileName(file.name);
    setImportResult(null);
    const isExcel = /\.xlsx?$/i.test(file.name);

    if (isExcel) {
      parseHolidayXlsx(file)
        .then((rows) => {
          setImportRows(rows);
          if (rows.length === 0) {
            setToast({
              message: 'ไม่พบข้อมูลในไฟล์ หรือไฟล์ไม่ตรงตามรูปแบบที่กำหนด',
              type: 'error',
            });
          }
        })
        .catch((err) => {
          setToast({
            message: `อ่านไฟล์ Excel ไม่สำเร็จ: ${err.message}`,
            type: 'error',
          });
        });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target?.result ?? '');
      const rows = parseHolidayCsv(text);
      setImportRows(rows);
      if (rows.length === 0) {
        setToast({
          message: 'ไม่พบข้อมูลในไฟล์ หรือไฟล์ไม่ตรงตามรูปแบบที่กำหนด',
          type: 'error',
        });
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleConfirmImport = async () => {
    if (!user?.id) return;
    const validRows = importRows.filter((r) => !r.error);
    if (validRows.length === 0) return;

    setImporting(true);
    let created = 0;
    const failed: string[] = [];
    try {
      for (const row of validRows) {
        const res = await fetch('/api/holidays', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requesterId: user.id,
            name: row.name,
            nameEN: row.nameEN,
            date: row.date,
            type: row.type,
            description: row.description,
            repeatEveryYear: row.repeatEveryYear,
          }),
        });
        const json = await res.json();
        if (json.success) {
          created++;
        } else {
          failed.push(
            `แถว ${row.rowNumber} (${row.date} ${row.name}): ${
              json.error?.message ?? 'ผิดพลาด'
            }`
          );
        }
      }
      setImportResult({ created, failed });
      if (created > 0) fetchHolidays();
    } finally {
      setImporting(false);
    }
  };

  const closeImportModal = () => {
    setShowImportModal(false);
    setImportFileName('');
    setImportRows([]);
    setImportResult(null);
  };

  const notReady = (feature: string) =>
    setToast({
      message: `${feature} — ยังไม่พร้อมใช้งาน (อยู่ระหว่างเตรียมโครงสร้าง)`,
      type: 'error',
    });

  // ── Export Holiday CSV — Frontend-only, uses tableFiltered (already
  // Year Filter + Search-filtered, matches what's visible in the table).
  // No library, no package install — same pattern as Company Events Export,
  // written independently here (Holiday module stays self-contained).
  const escapeHolidayCsvField = (value: string): string => {
    if (/[",\n]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  const handleExportHolidaysCsv = () => {
    if (tableFiltered.length === 0) {
      setToast({ message: 'ไม่มีข้อมูลให้ Export', type: 'error' });
      return;
    }

    const headers = [
      'Date',
      'Name',
      'Name (EN)',
      'Type',
      'Description',
      'Repeat Every Year',
      'Status',
    ];
    const rows = tableFiltered.map((h) => [
      h.date,
      h.name,
      h.nameEN ?? '',
      h.type,
      h.description ?? '',
      h.repeatEveryYear ? 'Yes' : 'No',
      h.isActive === false ? 'Inactive' : 'Active',
    ]);

    const csvContent = [headers, ...rows]
      .map((row) =>
        row.map((field) => escapeHolidayCsvField(String(field))).join(',')
      )
      .join('\r\n');

    const blob = new Blob(['\uFEFF' + csvContent], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `holidays-${toLocalDateStr(new Date())}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCloneRecurring = async () => {
    if (!user?.id) return;
    setCloning(true);
    try {
      const res = await fetch('/api/holidays/clone-recurring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requesterId: user.id,
          sourceYear: cloneSourceYear,
          targetYear: cloneTargetYear,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setToast({ message: json.message, type: 'success' });
        setShowCloneModal(false);
        fetchHolidays();
      } else {
        setToast({
          message: json.error?.message ?? 'เกิดข้อผิดพลาด',
          type: 'error',
        });
      }
    } finally {
      setCloning(false);
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

      <PageHeader title="Company Calendar" subtitle="ปฏิทินวันหยุดบริษัท" />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex bg-gray-100 rounded-xl p-1">
          {(['month', 'week', 'list'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setViewMode(v)}
              className={cn(
                'px-4 py-1.5 text-sm font-medium rounded-lg transition-colors',
                viewMode === v
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {v === 'month' ? 'เดือน' : v === 'week' ? 'สัปดาห์' : 'รายการ'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={goPrevMonth}
            className="w-8 h-8 flex items-center justify-center border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            ‹
          </button>
          <span className="text-sm font-semibold text-gray-900 min-w-[140px] text-center">
            {THAI_MONTHS[currentMonth]} {toBuddhistYear(currentYear)}
          </span>
          <button
            onClick={goNextMonth}
            className="w-8 h-8 flex items-center justify-center border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            ›
          </button>
        </div>

        <button
          onClick={goToday}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          วันนี้
        </button>

        <select
          value={calType}
          onChange={(e) => setCalType(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">ทุกประเภท</option>
          {availableTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <select
          value={listYearFilter}
          onChange={(e) => setListYearFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">ทุกปี</option>
          {availableYears.map((y) => (
            <option key={y} value={y}>
              {toBuddhistYear(Number(y))}
            </option>
          ))}
        </select>

        <input
          value={calSearch}
          onChange={(e) => setCalSearch(e.target.value)}
          placeholder="ค้นหาวันหยุด..."
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-40"
        />

        {isHR && (
          <button
            onClick={openAddModal}
            className="ml-auto bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
          >
            + เพิ่มวันหยุด
          </button>
        )}
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 mb-1">วันหยุดทั้งหมดปีนี้</p>
          <p className="text-2xl font-bold text-gray-900">{statsCards.total}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 mb-1">Public Holiday</p>
          <p className="text-2xl font-bold text-rose-600">
            {statsCards.public}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 mb-1">Company Holiday</p>
          <p className="text-2xl font-bold text-emerald-600">
            {statsCards.company}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 mb-1">วันหยุดถัดไป</p>
          {statsCards.next ? (
            <>
              <p className="text-2xl font-bold text-blue-600">
                อีก {statsCards.next.days} วัน
              </p>
              <p className="text-xs text-gray-400 truncate">
                {statsCards.next.name}
              </p>
            </>
          ) : (
            <p className="text-2xl font-bold text-gray-300">—</p>
          )}
        </div>
      </div>

      {/* Main grid: 70/30 */}
      <div className="grid grid-cols-1 xl:grid-cols-10 gap-6 mb-6">
        {/* Left — Calendar (70%) */}
        <div className="xl:col-span-7 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          {viewMode !== 'month' ? (
            <div className="py-20 text-center text-gray-400 text-sm">
              มุมมอง{viewMode === 'week' ? 'สัปดาห์' : 'รายการ'} —
              เตรียมโครงสร้างไว้แล้ว ยังไม่เปิดใช้งานในเฟสนี้
            </div>
          ) : loading ? (
            <div className="py-20 text-center text-gray-400 text-sm">
              กำลังโหลด...
            </div>
          ) : (
            <>
              <div className="grid grid-cols-7 mb-2">
                {THAI_DAYS.map((d, i) => (
                  <div
                    key={d}
                    className={cn(
                      'text-center text-xs font-medium py-2',
                      i === 0 || i === 6 ? 'text-red-400' : 'text-gray-400'
                    )}
                  >
                    {d}
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                {calendarWeeks.map((week, wi) => (
                  <div key={wi} className="grid grid-cols-7 gap-1">
                    {week.map(({ date, inMonth }, di) => {
                      const dateStr = toLocalDateStr(date);
                      const dayHolidays = holidaysByDate.get(dateStr) ?? [];
                      const monthDayKey = `${String(
                        date.getMonth() + 1
                      ).padStart(2, '0')}-${String(date.getDate()).padStart(
                        2,
                        '0'
                      )}`;
                      const dayBirthdays =
                        birthdaysByMonthDay.get(monthDayKey) ?? [];
                      const isToday = dateStr === todayStr;
                      return (
                        <div
                          key={di}
                          className={cn(
                            'min-h-[84px] rounded-lg p-1.5 border',
                            inMonth ? 'border-gray-100' : 'border-transparent',
                            !inMonth && 'opacity-40'
                          )}
                        >
                          <span
                            className={cn(
                              'inline-flex items-center justify-center w-6 h-6 text-xs rounded-full',
                              isToday
                                ? 'bg-blue-600 text-white font-semibold'
                                : di === 0 || di === 6
                                ? 'text-red-500'
                                : 'text-gray-700'
                            )}
                          >
                            {date.getDate()}
                          </span>
                          <div className="mt-1 space-y-0.5">
                            {dayHolidays.slice(0, 2).map((h) => {
                              const c = getHolidayColor(h);
                              return (
                                <button
                                  key={h.id}
                                  onClick={() => setDrawerHoliday(h)}
                                  title={`${h.name} — ${h.type}`}
                                  className={cn(
                                    'w-full text-left text-[10px] px-1.5 py-0.5 rounded truncate block',
                                    c.bg,
                                    c.text
                                  )}
                                >
                                  {h.name}
                                </button>
                              );
                            })}
                            {dayHolidays.length <= 2 &&
                              dayBirthdays
                                .slice(0, 2 - dayHolidays.length)
                                .map((b) => (
                                  <div
                                    key={b.id}
                                    title={`🎂 ${b.firstNameTH} ${b.lastNameTH}`}
                                    className="w-full text-left text-[10px] px-1.5 py-0.5 rounded truncate block bg-pink-50 text-pink-600"
                                  >
                                    🎂 {b.nickname || b.firstNameTH}
                                  </div>
                                ))}
                            {dayHolidays.length + dayBirthdays.length > 2 && (
                              <p className="text-[10px] text-gray-400 px-1">
                                +{dayHolidays.length + dayBirthdays.length - 2}{' '}
                                เพิ่มเติม
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-gray-100">
                {[
                  { label: 'Public Holiday', hex: '#F43F5E' },
                  { label: 'Company Holiday', hex: '#10B981' },
                  { label: 'Special Holiday', hex: '#F59E0B' },
                  { label: 'Substitute Holiday', hex: '#6366F1' },
                  { label: 'Inactive', hex: '#94A3B8' },
                  { label: 'Birthday', hex: '#EC4899' },
                ].map((l) => (
                  <div
                    key={l.label}
                    className="flex items-center gap-1.5 text-xs text-gray-500"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: l.hex }}
                    />
                    {l.label}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Right — 30% */}
        <div className="xl:col-span-3 space-y-6">
          {/* Upcoming Holidays */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">
              Upcoming Events
            </h3>
            {upcomingEvents.length === 0 ? (
              <p className="text-sm text-gray-400">ไม่มีกิจกรรมที่จะถึง</p>
            ) : (
              <div className="space-y-3">
                {upcomingEvents.map((ev) => {
                  if (ev.kind === 'holiday') {
                    const h = ev.holiday;
                    const c = getHolidayColor(h);
                    const d = new Date(h.date + 'T00:00:00');
                    return (
                      <button
                        key={ev.key}
                        onClick={() => setDrawerHoliday(h)}
                        className="w-full flex items-center gap-3 text-left hover:bg-gray-50 rounded-xl p-1.5 -m-1.5 transition-colors"
                      >
                        <div
                          className={cn(
                            'w-11 h-11 rounded-xl flex flex-col items-center justify-center shrink-0',
                            c.bg
                          )}
                        >
                          <span
                            className={cn(
                              'text-sm font-bold leading-none',
                              c.text
                            )}
                          >
                            {d.getDate()}
                          </span>
                          <span className={cn('text-[9px]', c.text)}>
                            {THAI_MONTHS[d.getMonth()].slice(0, 3)}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {h.name}
                          </p>
                          <p className="text-xs text-gray-400">{h.type}</p>
                        </div>
                        <span className="text-xs text-gray-400 shrink-0">
                          อีก {ev.daysUntil} วัน
                        </span>
                      </button>
                    );
                  }

                  // Birthday event — own presentation, holiday styling above
                  // is unchanged.
                  const b = ev.birthday;
                  const fullName = `${b.firstNameTH} ${b.lastNameTH}`.trim();
                  return (
                    <div
                      key={ev.key}
                      className="w-full flex items-center gap-3 rounded-xl p-1.5 -m-1.5"
                    >
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-pink-50">
                        <span className="text-lg leading-none">🎂</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {fullName}
                        </p>
                        {b.nickname && (
                          <p className="text-xs text-gray-400 truncate">
                            ({b.nickname})
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">
                        อีก {ev.daysUntil} วัน
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Holiday Summary */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">
              Holiday Summary{' '}
              <span className="text-xs font-normal text-gray-400">(ปีนี้)</span>
            </h3>
            <HolidayDonutChart
              centerLabel="วันหยุดทั้งหมด"
              centerValue={summary.total}
              segments={[
                {
                  label: 'Public Holiday',
                  value: summary.public,
                  color: 'rose',
                  hex: '#F43F5E',
                },
                {
                  label: 'Company Holiday',
                  value: summary.company,
                  color: 'emerald',
                  hex: '#10B981',
                },
                {
                  label: 'Special Holiday',
                  value: summary.special,
                  color: 'amber',
                  hex: '#F59E0B',
                },
                {
                  label: 'Substitute Holiday',
                  value: summary.substitute,
                  color: 'indigo',
                  hex: '#6366F1',
                },
                {
                  label: 'Other',
                  value: summary.other,
                  color: 'violet',
                  hex: '#A855F7',
                },
                {
                  label: 'Inactive',
                  value: summary.inactive,
                  color: 'gray',
                  hex: '#94A3B8',
                },
              ]}
            />
          </div>

          {/* Quick Actions */}
          {isHR && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">
                Quick Actions
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={openAddModal}
                  className="flex flex-col items-center gap-1.5 py-3 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  <span className="text-lg">➕</span>
                  <span className="text-xs text-gray-600">เพิ่มวันหยุด</span>
                </button>
                <button
                  onClick={() => {
                    setCloneSourceYear(currentYear);
                    setCloneTargetYear(currentYear + 1);
                    setShowCloneModal(true);
                  }}
                  className="flex flex-col items-center gap-1.5 py-3 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  <span className="text-lg">🔁</span>
                  <span className="text-xs text-gray-600">คัดลอกไปปีถัดไป</span>
                </button>
                <button
                  onClick={() => setShowImportModal(true)}
                  className="flex flex-col items-center gap-1.5 py-3 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  <span className="text-lg">📥</span>
                  <span className="text-xs text-gray-600">Import วันหยุด</span>
                </button>
                <button
                  onClick={handleExportHolidaysCsv}
                  className="flex flex-col items-center gap-1.5 py-3 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  <span className="text-lg">📤</span>
                  <span className="text-xs text-gray-600">Export วันหยุด</span>
                </button>
                <button
                  onClick={() => setShowTypeManageModal(true)}
                  className="flex flex-col items-center gap-1.5 py-3 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors col-span-2"
                >
                  <span className="text-lg">🏷️</span>
                  <span className="text-xs text-gray-600">จัดการประเภท</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recent Holidays table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h3 className="text-sm font-semibold text-gray-900">
            Recent Holidays
          </h3>
          <input
            value={tableSearch}
            onChange={(e) => {
              setTableSearch(e.target.value);
              setTablePage(1);
            }}
            placeholder="ค้นหา..."
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
          />
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th
                className="text-left px-5 py-3 text-xs font-medium text-gray-500 cursor-pointer select-none"
                onClick={() => toggleTableSort('date')}
              >
                วันที่{' '}
                {tableSortField === 'date' &&
                  (tableSortDir === 'asc' ? '↑' : '↓')}
              </th>
              <th
                className="text-left px-5 py-3 text-xs font-medium text-gray-500 cursor-pointer select-none"
                onClick={() => toggleTableSort('name')}
              >
                ชื่อวันหยุด{' '}
                {tableSortField === 'name' &&
                  (tableSortDir === 'asc' ? '↑' : '↓')}
              </th>
              <th
                className="text-left px-5 py-3 text-xs font-medium text-gray-500 cursor-pointer select-none"
                onClick={() => toggleTableSort('type')}
              >
                ประเภท{' '}
                {tableSortField === 'type' &&
                  (tableSortDir === 'asc' ? '↑' : '↓')}
              </th>
              <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">
                สถานะ
              </th>
              <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">
                สร้างโดย
              </th>
              <th
                className="text-left px-5 py-3 text-xs font-medium text-gray-500 cursor-pointer select-none"
                onClick={() => toggleTableSort('createdAt')}
              >
                สร้างเมื่อ{' '}
                {tableSortField === 'createdAt' &&
                  (tableSortDir === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr>
                <td colSpan={7} className="text-center py-10 text-gray-400">
                  กำลังโหลด...
                </td>
              </tr>
            ) : tablePaged.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-10 text-gray-400">
                  ไม่พบวันหยุด
                </td>
              </tr>
            ) : (
              tablePaged.map((h) => {
                const isActive = h.isActive !== false;
                const c = getHolidayColor(h);
                return (
                  <tr
                    key={h.id}
                    className={cn(
                      'cursor-pointer hover:bg-gray-50',
                      !isActive && 'opacity-50'
                    )}
                    onClick={() => setDrawerHoliday(h)}
                  >
                    <td className="px-5 py-3 font-medium text-gray-900 whitespace-nowrap">
                      {h.date}
                    </td>
                    <td className="px-5 py-3 text-gray-900">{h.name}</td>
                    <td className="px-5 py-3">
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded-full text-xs font-medium',
                          c.bg,
                          c.text
                        )}
                      >
                        {h.type}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={cn(
                          'inline-flex px-2 py-0.5 rounded-full text-xs font-medium',
                          isActive
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        )}
                      >
                        {isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs">
                      {h.createdBy}
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {new Date(h.createdAt).toLocaleDateString('th-TH')}
                    </td>
                    <td
                      className="px-5 py-3 text-right whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isHR ? (
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => openEditModal(h)}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            แก้ไข
                          </button>
                          <button
                            onClick={() => handleToggleActive(h)}
                            className={cn(
                              'text-xs hover:underline',
                              isActive ? 'text-red-500' : 'text-green-600'
                            )}
                          >
                            {isActive ? 'ปิด' : 'เปิด'}
                          </button>
                          {confirmDeleteId === h.id ? (
                            <>
                              <button
                                onClick={() => handlePermanentDelete(h)}
                                className="text-xs text-white bg-red-600 px-2 py-0.5 rounded hover:bg-red-700"
                              >
                                ยืนยันลบถาวร
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="text-xs text-gray-500 hover:underline"
                              >
                                ยกเลิก
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteId(h.id)}
                              className="text-xs text-red-700 hover:underline"
                            >
                              ลบถาวร
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {tableTotalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-4 text-sm text-gray-500">
            <span>
              แสดง {(tablePage - 1) * TABLE_PAGE_SIZE + 1}–
              {Math.min(tablePage * TABLE_PAGE_SIZE, tableFiltered.length)} จาก{' '}
              {tableFiltered.length}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                disabled={tablePage <= 1}
                className="px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40"
              >
                ก่อนหน้า
              </button>
              <span className="px-2 py-1.5">
                หน้า {tablePage}/{tableTotalPages}
              </span>
              <button
                onClick={() =>
                  setTablePage((p) => Math.min(tableTotalPages, p + 1))
                }
                disabled={tablePage >= tableTotalPages}
                className="px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40"
              >
                ถัดไป
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Drawer */}
      <HolidayDetailDrawer
        holiday={drawerHoliday}
        canManage={isHR}
        onClose={() => {
          setDrawerHoliday(null);
          setDrawerConfirmingDelete(false);
        }}
        onEdit={openEditModal}
        onToggleActive={(h) => {
          handleToggleActive(h);
          setDrawerHoliday(null);
        }}
        onRequestDelete={(h) => {
          if (drawerConfirmingDelete) {
            handlePermanentDelete(h);
          } else {
            setDrawerConfirmingDelete(true);
          }
        }}
      />

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl max-h-[85vh] overflow-y-auto">
            <h3 className="text-base font-semibold text-gray-900 mb-4">
              {editing ? `แก้ไขวันหยุด — ${editing.name}` : 'เพิ่มวันหยุดใหม่'}
            </h3>

            {formError && (
              <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {formError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  ชื่อวันหยุด *
                </label>
                <input
                  value={form.name}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, name: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  ชื่อภาษาอังกฤษ
                </label>
                <input
                  value={form.nameEN}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, nameEN: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    {editing ? 'วันที่ *' : 'วันที่เริ่ม *'}
                  </label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        date: e.target.value,
                        // ถ้าวันสิ้นสุดเดิมมาก่อนวันเริ่มใหม่ ให้เลื่อนตามไปด้วย
                        endDate:
                          p.endDate < e.target.value
                            ? e.target.value
                            : p.endDate,
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {!editing && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      วันที่สิ้นสุด *
                    </label>
                    <input
                      type="date"
                      value={form.endDate}
                      min={form.date}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, endDate: e.target.value }))
                      }
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
              </div>
              {!editing && form.endDate > form.date && (
                <p className="text-xs text-blue-600 -mt-1">
                  จะสร้างวันหยุด &quot;{form.name || '(ชื่อวันหยุด)'}&quot;
                  ทุกวันตั้งแต่ {form.date} ถึง {form.endDate} แยกทีละวัน (
                  {daysUntil(form.endDate) - daysUntil(form.date) + 1} วัน)
                </p>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  ประเภท *
                </label>
                <select
                  value={form.type}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, type: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="" disabled>
                    เลือกประเภทวันหยุด
                  </option>
                  {/* Legacy fallback — shown only while editing a holiday
                      whose existing type isn't in the active master list.
                      Not required to change; stays selectable so the value
                      is preserved if the user doesn't touch this field. */}
                  {editing &&
                    editing.type &&
                    !holidayTypes.some(
                      (t) => t.isActive && t.name === editing.type
                    ) && (
                      <option value={editing.type}>
                        {editing.type} (เดิม)
                      </option>
                    )}
                  {holidayTypes
                    .filter((t) => t.isActive)
                    .map((t) => (
                      <option key={t.id} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  ต้องการเพิ่มประเภทใหม่? ไปที่ Quick Actions →
                  &quot;จัดการประเภท&quot;
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  รายละเอียด (ไม่บังคับ)
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, description: e.target.value }))
                  }
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.repeatEveryYear}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      repeatEveryYear: e.target.checked,
                    }))
                  }
                  className="rounded"
                />
                วันหยุดประจำ (ทำเครื่องหมายไว้เพื่อคัดลอกไปปีถัดไปได้ในอนาคต)
              </label>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 transition-colors"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clone Recurring Holidays to New Year Modal */}
      {showCloneModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-base font-semibold text-gray-900 mb-1">
              คัดลอกวันหยุดประจำไปปีถัดไป
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              คัดลอกเฉพาะวันหยุดที่ทำเครื่องหมาย &quot;วันหยุดประจำ&quot;
              ไว้ตอนสร้าง — ถ้าวันที่ปลายทางมีวันหยุดอยู่แล้วจะข้ามให้อัตโนมัติ
            </p>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  จากปี (พ.ศ. {toBuddhistYear(cloneSourceYear)})
                </label>
                <input
                  type="number"
                  value={cloneSourceYear}
                  onChange={(e) => setCloneSourceYear(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  ไปปี (พ.ศ. {toBuddhistYear(cloneTargetYear)})
                </label>
                <input
                  type="number"
                  value={cloneTargetYear}
                  onChange={(e) => setCloneTargetYear(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleCloneRecurring}
                disabled={cloning}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {cloning ? 'กำลังคัดลอก...' : 'คัดลอก'}
              </button>
              <button
                onClick={() => setShowCloneModal(false)}
                className="px-4 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 transition-colors"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Holidays Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-xl max-h-[85vh] overflow-y-auto">
            <h3 className="text-base font-semibold text-gray-900 mb-1">
              Import วันหยุดจากไฟล์ CSV
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              รองรับไฟล์ .csv และ .xlsx — คอลัมน์ที่ต้องมี:{' '}
              <code className="bg-gray-100 px-1 rounded">
                {IMPORT_TEMPLATE_HEADERS.join(', ')}
              </code>
            </p>

            <button
              onClick={downloadCsvTemplate}
              className="text-xs text-blue-600 hover:underline mb-4"
            >
              📄 ดาวน์โหลดไฟล์ตัวอย่าง (Template CSV — เปิดด้วย Excel แล้ว Save
              As .xlsx ได้เช่นกัน)
            </button>

            <div className="mb-4">
              <input
                type="file"
                accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImportFileSelect(file);
                }}
                className="text-sm"
              />
              {importFileName && (
                <p className="text-xs text-gray-500 mt-1">
                  ไฟล์: {importFileName}
                </p>
              )}
            </div>

            {importRows.length > 0 && !importResult && (
              <>
                <div className="border border-gray-100 rounded-xl overflow-hidden mb-4 max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-gray-50">
                      <tr className="border-b border-gray-100">
                        <th className="text-left px-3 py-2 font-medium text-gray-500">
                          แถว
                        </th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">
                          ชื่อ
                        </th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">
                          วันที่
                        </th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">
                          ประเภท
                        </th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">
                          สถานะ
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {importRows.map((r) => (
                        <tr
                          key={r.rowNumber}
                          className={r.error ? 'bg-red-50' : ''}
                        >
                          <td className="px-3 py-1.5 text-gray-500">
                            {r.rowNumber}
                          </td>
                          <td className="px-3 py-1.5 text-gray-900">
                            {r.name || '-'}
                          </td>
                          <td className="px-3 py-1.5 text-gray-600">
                            {r.date || '-'}
                          </td>
                          <td className="px-3 py-1.5 text-gray-600">
                            {r.type || '-'}
                          </td>
                          <td className="px-3 py-1.5">
                            {r.error ? (
                              <span className="text-red-600">{r.error}</span>
                            ) : (
                              <span className="text-green-600">
                                พร้อมนำเข้า
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-500 mb-4">
                  พบ {importRows.length} แถว — พร้อมนำเข้า{' '}
                  {importRows.filter((r) => !r.error).length} แถว
                  {importRows.some((r) => r.error) &&
                    ` (มีปัญหา ${
                      importRows.filter((r) => r.error).length
                    } แถว จะถูกข้าม)`}
                </p>
              </>
            )}

            {importResult && (
              <div className="mb-4 space-y-2">
                <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  นำเข้าสำเร็จ {importResult.created} รายการ
                </div>
                {importResult.failed.length > 0 && (
                  <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 max-h-32 overflow-y-auto">
                    {importResult.failed.map((f, i) => (
                      <p key={i}>{f}</p>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2">
              {!importResult ? (
                <>
                  <button
                    onClick={handleConfirmImport}
                    disabled={
                      importing ||
                      importRows.filter((r) => !r.error).length === 0
                    }
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {importing ? 'กำลังนำเข้า...' : 'นำเข้าข้อมูล'}
                  </button>
                  <button
                    onClick={closeImportModal}
                    className="px-4 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    ยกเลิก
                  </button>
                </>
              ) : (
                <button
                  onClick={closeImportModal}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  ปิด
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Holiday Type Management Modal (Phase D Step 1) */}
      <HolidayTypeManageModal
        isOpen={showTypeManageModal}
        onClose={() => {
          setShowTypeManageModal(false);
          fetchHolidayTypes();
        }}
      />
    </div>
  );
}
