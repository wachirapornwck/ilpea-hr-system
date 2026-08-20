'use client';

// =============================================================================
// src/app/(app)/events/page.tsx
// =============================================================================
// Company Events — Step 1 skeleton: fetch + Month Calendar + Search + Type
// Filter only. No CRUD, no modal, no drawer, no department selector, no
// statistics, no year filter, no Sidebar entry yet (all later steps).
//
// Intentionally NOT a copy of holidays/page.tsx — state, useMemo, and
// helpers below are written fresh for this module. Only the *shape* of a
// few concepts (month navigation, calendar grid math, fetch pattern,
// search/type filter pattern) mirrors what's proven to work there. No
// Holiday-specific logic (Birthday, Donut Chart, Clone/Import/Export,
// Quick Actions, getHolidayColor, HolidayDetailDrawer) is present.
// =============================================================================

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import PageHeader from '@/components/layout/PageHeader';
import { useAuth } from '@/lib/auth/context';
import { cn } from '@/lib/utils';

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

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Shape returned by GET /api/company-events — defined locally per this
// project's convention (no shared type file for this module, same as how
// BirthdayEntry is scoped to the page that consumes it).
interface CompanyEvent {
  id: string;
  title: string;
  description: string;
  date: string; // YYYY-MM-DD
  type: string;
  isAllDay: boolean;
  startTime: string | null; // "HH:MM"
  endTime: string | null; // "HH:MM"
  attendeeUserIds: string[];
  visibilityScope: 'company' | 'departments';
  visibleDepartmentIds: string[];
  createdBy: string;
  createdByName: string;
  createdByDepartmentId: string;
  createdByDepartment: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Own color mapping — intentionally not getHolidayColor(). Fixed palette
// keyed by lowercased type, with a stable fallback for any unrecognized
// type string (types are free-form, same as Holiday's `type` field).
const EVENT_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  'customer visit': { bg: 'bg-blue-50', text: 'text-blue-700' },
  shipment: { bg: 'bg-amber-50', text: 'text-amber-700' },
  training: { bg: 'bg-purple-50', text: 'text-purple-700' },
  maintenance: { bg: 'bg-orange-50', text: 'text-orange-700' },
  'internal announcement': { bg: 'bg-teal-50', text: 'text-teal-700' },
};
const EVENT_TYPE_FALLBACK = { bg: 'bg-slate-50', text: 'text-slate-700' };

const TABLE_PAGE_SIZE = 10;

function getEventTypeColor(type: string): { bg: string; text: string } {
  return EVENT_TYPE_COLORS[type.toLowerCase()] ?? EVENT_TYPE_FALLBACK;
}

export default function EventsPage() {
  const { user } = useAuth();

  const [events, setEvents] = useState<CompanyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);

  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // ── View toggle (Calendar default) + Table pagination ──
  const [viewMode, setViewMode] = useState<'calendar' | 'table'>('calendar');
  const [tablePage, setTablePage] = useState(1);

  // ── Add/Edit Modal state ──────────────────────────────────────────────
  const emptyForm = {
    title: '',
    description: '',
    date: '',
    type: 'Other',
    startTime: '',
    endTime: '',
    visibilityScope: 'company' as 'company' | 'departments',
    visibleDepartmentIds: [] as string[],
    attendeeUserIds: [] as string[],
  };
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CompanyEvent | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  // Attendee picker — selected people shown by name/nickname (resolved via
  // a small local cache, see attendeeNameCache below), search-as-you-type
  // against GET /api/employees since the org can have 20+ employees and
  // that endpoint paginates (PAGE_SIZE=20 server-side).
  const [attendeeSearch, setAttendeeSearch] = useState('');
  const [attendeeSearchResults, setAttendeeSearchResults] = useState<
    { id: string; name: string; departmentName: string }[]
  >([]);
  const [attendeeSearchLoading, setAttendeeSearchLoading] = useState(false);
  const [attendeeNameCache, setAttendeeNameCache] = useState<
    Record<string, string>
  >({});

  // ── Detail Drawer state ────────────────────────────────────────────────
  const [showDrawer, setShowDrawer] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Department options for the multi-select — id/name only, per
  // GET /api/departments response shape (no other fields assumed).
  interface DepartmentOption {
    id: string;
    name: string;
  }
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);

  const fetchDepartments = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`/api/departments?requesterId=${user.id}`);
      const json = await res.json();
      if (json.success) {
        setDepartments(
          json.data.map((d: { id: string; name: string }) => ({
            id: d.id,
            name: d.name,
          }))
        );
      }
    } catch {
      // Non-fatal: department checkboxes just won't have options yet.
    }
  }, [user?.id]);

  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments]);

  const openAddModal = () => {
    setEditingEvent(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEditModal = (e: CompanyEvent) => {
    setEditingEvent(e);
    setForm({
      title: e.title,
      description: e.description,
      date: e.date,
      type: e.type,
      startTime: e.startTime ?? '',
      endTime: e.endTime ?? '',
      visibilityScope: e.visibilityScope,
      visibleDepartmentIds: e.visibleDepartmentIds,
      attendeeUserIds: e.attendeeUserIds ?? [],
    });
    if (e.attendeeUserIds && e.attendeeUserIds.length > 0) {
      resolveAttendeeNames(e.attendeeUserIds);
    }
    setShowDrawer(false);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingEvent(null);
    setForm(emptyForm);
    setAttendeeSearch('');
    setAttendeeSearchResults([]);
  };

  const openDrawer = (e: CompanyEvent) => {
    setEditingEvent(e);
    setConfirmingDelete(false);
    if (e.attendeeUserIds && e.attendeeUserIds.length > 0) {
      resolveAttendeeNames(e.attendeeUserIds);
    }
    setShowDrawer(true);
  };

  const closeDrawer = () => {
    setShowDrawer(false);
    setEditingEvent(null);
    setConfirmingDelete(false);
  };

  const toggleDepartment = (id: string) => {
    setForm((f) => ({
      ...f,
      visibleDepartmentIds: f.visibleDepartmentIds.includes(id)
        ? f.visibleDepartmentIds.filter((x) => x !== id)
        : [...f.visibleDepartmentIds, id],
    }));
  };

  const toggleAttendee = (id: string) => {
    setForm((f) => ({
      ...f,
      attendeeUserIds: f.attendeeUserIds.includes(id)
        ? f.attendeeUserIds.filter((x) => x !== id)
        : [...f.attendeeUserIds, id],
    }));
  };

  // Resolves attendee IDs to display names via /api/employees/directory,
  // caching results so repeated renders/edits don't re-fetch known names.
  const resolveAttendeeNames = useCallback(
    async (ids: string[]) => {
      if (!user?.id) return;
      const missing = ids.filter((id) => !attendeeNameCache[id]);
      if (missing.length === 0) return;
      const resolved: Record<string, string> = {};
      await Promise.all(
        missing.map(async (id) => {
          try {
            const res = await fetch(
              `/api/employees/directory?requesterId=${
                user.id
              }&search=${encodeURIComponent(id)}`
            );
            const json = await res.json();
            if (json.success) {
              const match = (json.data ?? []).find(
                (p: { id: string }) => p.id === id
              );
              resolved[id] = match ? match.name : id;
            } else {
              resolved[id] = id;
            }
          } catch {
            resolved[id] = id;
          }
        })
      );
      setAttendeeNameCache((prev) => ({ ...prev, ...resolved }));
    },
    [user?.id, attendeeNameCache]
  );

  // Search-as-you-type against /api/employees/directory (debounced 400ms) —
  // the endpoint caps results at 20 and this project has 20+ employees, so
  // a live search box is required rather than loading everyone at once.
  useEffect(() => {
    if (!attendeeSearch.trim() || !user?.id) {
      setAttendeeSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setAttendeeSearchLoading(true);
      try {
        const res = await fetch(
          `/api/employees/directory?requesterId=${
            user.id
          }&search=${encodeURIComponent(attendeeSearch.trim())}`
        );
        const json = await res.json();
        if (json.success) {
          setAttendeeSearchResults(json.data);
          setAttendeeNameCache((prev) => {
            const next = { ...prev };
            for (const p of json.data as { id: string; name: string }[]) {
              next[p.id] = p.name;
            }
            return next;
          });
        }
      } finally {
        setAttendeeSearchLoading(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [attendeeSearch, user?.id]);

  // Client-side validation only — mirrors backend just enough to give
  // immediate feedback; the backend remains the source of truth and
  // re-validates everything itself (not duplicated further here).
  const validateForm = (): string | null => {
    if (!form.title.trim()) return 'กรุณาระบุชื่อ Event';
    if (!form.date) return 'กรุณาระบุวันที่';
    if (!form.visibilityScope) return 'กรุณาเลือก Visibility';
    if (
      form.visibilityScope === 'departments' &&
      form.visibleDepartmentIds.length === 0
    ) {
      return 'กรุณาเลือกอย่างน้อย 1 แผนก';
    }
    if (
      (form.startTime && !form.endTime) ||
      (!form.startTime && form.endTime)
    ) {
      return 'กรุณาระบุเวลาเริ่มและเวลาสิ้นสุดให้ครบทั้งคู่';
    }
    if (form.startTime && form.endTime && form.endTime <= form.startTime) {
      return 'เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม';
    }
    return null;
  };

  const handleSave = async () => {
    if (!user?.id) return;
    const err = validateForm();
    if (err) {
      setToast({ message: err, type: 'error' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        requesterId: user.id,
        title: form.title.trim(),
        description: form.description.trim(),
        date: form.date,
        type: form.type.trim() || 'Other',
        startTime: form.startTime || undefined,
        endTime: form.endTime || undefined,
        visibilityScope: form.visibilityScope,
        visibleDepartmentIds:
          form.visibilityScope === 'departments'
            ? form.visibleDepartmentIds
            : [],
        attendeeUserIds: form.attendeeUserIds,
      };
      const url = editingEvent
        ? `/api/company-events/${editingEvent.id}`
        : '/api/company-events';
      const method = editingEvent ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        setToast({
          message: editingEvent
            ? 'Event updated successfully'
            : 'Event created successfully',
          type: 'success',
        });
        closeModal();
        fetchEvents();
      } else {
        setToast({
          message: json.error?.message ?? 'บันทึกไม่สำเร็จ',
          type: 'error',
        });
      }
    } finally {
      setSaving(false);
    }
  };

  // ── Delete (soft-delete only — permanent delete not exposed in this UI) ──
  const handleDelete = async (e: CompanyEvent) => {
    if (!user?.id) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/company-events/${e.id}?requesterId=${user.id}`,
        { method: 'DELETE' }
      );
      const json = await res.json();
      if (json.success) {
        setToast({ message: 'Event deleted successfully', type: 'success' });
        closeDrawer();
        fetchEvents();
      } else {
        setToast({
          message: json.error?.message ?? 'ลบไม่สำเร็จ',
          type: 'error',
        });
      }
    } finally {
      setDeleting(false);
      setConfirmingDelete(false);
    }
  };

  // Resolves visibleDepartmentIds to department names using the already-
  // fetched `departments` state — no additional API call, per this Step's
  // requirement.
  const getDepartmentNames = (ids: string[]): string => {
    if (ids.length === 0) return '—';
    return ids
      .map((id) => departments.find((d) => d.id === id)?.name ?? id)
      .join(', ');
  };

  // ── Export CSV — Frontend-only, uses tableRows (already Search/Type/
  // Active-filtered, no new fetch). No library, no package install. ──
  const escapeCsvField = (value: string): string => {
    if (/[",\n]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  const handleExportCsv = () => {
    if (tableRows.length === 0) {
      setToast({ message: 'No events to export', type: 'error' });
      return;
    }

    const headers = [
      'Date',
      'Title',
      'Type',
      'Visibility',
      'Visible Departments',
      'Created By',
      'Creator Department',
      'Description',
    ];
    const rows = tableRows.map((e) => [
      e.date,
      e.title,
      e.type,
      e.visibilityScope === 'company' ? 'Company-wide' : 'Departments',
      e.visibilityScope === 'company'
        ? 'Company-wide'
        : getDepartmentNames(e.visibleDepartmentIds),
      e.createdByName,
      e.createdByDepartment,
      e.description,
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((field) => escapeCsvField(String(field))).join(','))
      .join('\r\n');

    // UTF-8 BOM so Excel opens Thai text correctly.
    const blob = new Blob(['\uFEFF' + csvContent], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `company-events-${toLocalDateStr(new Date())}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ── Import CSV — Frontend-only, reuses POST /api/company-events per row.
  // No library, no package install. ──
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const handleImportClick = () => {
    importFileInputRef.current?.click();
  };

  // Minimal CSV line parser (handles quoted fields with embedded commas
  // and "" escaped quotes). Does not support multi-line quoted fields.
  const parseCsvLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (inQuotes) {
        if (char === '"') {
          if (line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += char;
        }
      } else if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  };

  const handleImportCsv = async (rawText: string) => {
    if (!user?.id) return;

    // Strip UTF-8 BOM if present.
    const text = rawText.charCodeAt(0) === 0xfeff ? rawText.slice(1) : rawText;
    const lines = text.split(/\r\n|\n/).filter((l) => l.trim() !== '');
    if (lines.length < 2) {
      setToast({ message: 'ไม่พบข้อมูลในไฟล์', type: 'error' });
      return;
    }

    const headerCols = parseCsvLine(lines[0]).map((h) => h.trim());
    const colIndex = {
      date: headerCols.indexOf('Date'),
      title: headerCols.indexOf('Title'),
      type: headerCols.indexOf('Type'),
      visibility: headerCols.indexOf('Visibility'),
      visibleDepartments: headerCols.indexOf('Visible Departments'),
      description: headerCols.indexOf('Description'),
    };

    setImporting(true);
    let successCount = 0;
    let failCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      const get = (idx: number) => (idx >= 0 ? (cols[idx] ?? '').trim() : '');

      const dateVal = get(colIndex.date);
      const titleVal = get(colIndex.title);
      const typeVal = get(colIndex.type);
      const visibilityRaw = get(colIndex.visibility);
      const visibleDeptsRaw = get(colIndex.visibleDepartments);
      const descriptionVal = get(colIndex.description);

      // ── Validation — skip row, count as failed, never throw ──
      if (!dateVal || !titleVal) {
        failCount++;
        continue;
      }

      let visibilityScope: 'company' | 'departments' | null = null;
      if (visibilityRaw === 'Company-wide') visibilityScope = 'company';
      else if (visibilityRaw === 'Departments') visibilityScope = 'departments';
      if (!visibilityScope) {
        failCount++;
        continue;
      }

      let visibleDepartmentIds: string[] = [];
      if (visibilityScope === 'departments') {
        const names = visibleDeptsRaw
          .split(',')
          .map((n) => n.trim())
          .filter((n) => n.length > 0);
        const ids: string[] = [];
        let allFound = names.length > 0;
        for (const name of names) {
          const dept = departments.find((d) => d.name === name);
          if (!dept) {
            allFound = false;
            break;
          }
          ids.push(dept.id);
        }
        if (!allFound) {
          failCount++;
          continue;
        }
        visibleDepartmentIds = ids;
      }

      try {
        const res = await fetch('/api/company-events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requesterId: user.id,
            title: titleVal,
            description: descriptionVal,
            date: dateVal,
            type: typeVal || 'Other',
            visibilityScope,
            visibleDepartmentIds,
          }),
        });
        const json = await res.json();
        if (json.success) successCount++;
        else failCount++;
      } catch {
        failCount++;
      }
    }

    setImporting(false);
    setToast({
      message:
        failCount > 0
          ? `Imported ${successCount} events\n${failCount} failed`
          : `Imported ${successCount} events`,
      type: failCount > 0 ? 'error' : 'success',
    });
    fetchEvents();
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file next time
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      handleImportCsv(String(reader.result));
    };
    reader.readAsText(file, 'utf-8');
  };

  const fetchEvents = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/company-events?requesterId=${user.id}`);
      const json = await res.json();
      if (json.success) setEvents(json.data);
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
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    setTablePage(1);
  }, [search, typeFilter]);

  // ── Month grid calculation (own copy — same math as Holiday, not shared) ──
  const calendarWeeks = useMemo(() => {
    const firstOfMonth = new Date(currentYear, currentMonth, 1);
    const startDay = firstOfMonth.getDay(); // 0=Sun
    const gridStart = new Date(currentYear, currentMonth, 1 - startDay);

    const cells: { date: Date; inMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      cells.push({ date: d, inMonth: d.getMonth() === currentMonth });
    }

    const weeks: { date: Date; inMonth: boolean }[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  }, [currentYear, currentMonth]);

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
  const goToday = () => {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
  };

  const todayStr = toLocalDateStr(today);

  // ── Type Filter options — derived from actual event.type values only ──
  const availableTypes = useMemo(() => {
    return Array.from(new Set(events.map((e) => e.type))).sort();
  }, [events]);

  // ── Search + Type filter applied first, then grouped by date for the grid ──
  const filteredEvents = useMemo(() => {
    let items = events.filter((e) => e.isActive !== false);
    if (typeFilter) items = items.filter((e) => e.type === typeFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter((e) => e.title.toLowerCase().includes(q));
    }
    return items;
  }, [events, typeFilter, search]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CompanyEvent[]>();
    for (const e of filteredEvents) {
      const arr = map.get(e.date) ?? [];
      arr.push(e);
      map.set(e.date, arr);
    }
    return map;
  }, [filteredEvents]);

  // ── Statistics Cards — reuses `events` (all, unfiltered by search/type)
  // and `todayStr` (already computed above). No new state, no new fetch.
  const statsCards = useMemo(() => {
    const activeEvents = events.filter((e) => e.isActive !== false);

    const total = activeEvents.length;
    const companyWide = activeEvents.filter(
      (e) => e.visibilityScope === 'company'
    ).length;
    const departmentScoped = activeEvents.filter(
      (e) => e.visibilityScope === 'departments'
    ).length;

    const upcoming = activeEvents
      .filter((e) => e.date >= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date))[0];

    const daysUntilUpcoming = upcoming
      ? Math.round(
          (new Date(upcoming.date + 'T00:00:00').getTime() -
            new Date(todayStr + 'T00:00:00').getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : null;

    return {
      total,
      companyWide,
      departmentScoped,
      upcoming,
      daysUntilUpcoming,
    };
  }, [events, todayStr]);

  // ── Table View — sorted Date ASC, reuses filteredEvents (same
  // search/type filter as Calendar), paginated client-side. ──
  const tableRows = useMemo(() => {
    return [...filteredEvents].sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredEvents]);

  const tableTotalPages = Math.max(
    1,
    Math.ceil(tableRows.length / TABLE_PAGE_SIZE)
  );
  const tablePaginated = tableRows.slice(
    (tablePage - 1) * TABLE_PAGE_SIZE,
    tablePage * TABLE_PAGE_SIZE
  );

  // ── Permission Gating — per this Step's spec exactly ──
  const isHR = user?.role === 'admin' || user?.role === 'hr_manager';
  const canManage = isHR || editingEvent?.createdBy === user?.id;

  // Upcoming list for the right-hand panel — presentation-only derived
  // value (same filter as statsCards.upcoming, extended to a short list).
  // Does not touch CRUD/permissions/API — read-only view of `events`.
  const upcomingList = useMemo(() => {
    return events
      .filter((e) => e.isActive !== false && e.date >= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 5);
  }, [events, todayStr]);

  const formatShortDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return `${d.getDate()} ${THAI_MONTHS[d.getMonth()].slice(0, 3)}`;
  };

  const ringTotal = statsCards.companyWide + statsCards.departmentScoped;
  const companyRatio = ringTotal > 0 ? statsCards.companyWide / ringTotal : 0;
  const RING_R = 40;
  const RING_C = 2 * Math.PI * RING_R;

  return (
    <div>
      <PageHeader title="Company Events" subtitle="ปฏิทินกิจกรรมองค์กร" />

      {toast && (
        <div
          className={cn(
            'fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg whitespace-pre-line',
            toast.type === 'success'
              ? 'bg-green-600 text-white'
              : 'bg-red-600 text-white'
          )}
        >
          {toast.message}
        </div>
      )}

      {/* Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-50 rounded-xl p-1">
            <button
              onClick={goPrevMonth}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:shadow-sm transition-all"
            >
              ‹
            </button>
            <span className="text-sm font-semibold text-slate-900 min-w-[130px] text-center">
              {THAI_MONTHS[currentMonth]} {toBuddhistYear(currentYear)}
            </span>
            <button
              onClick={goNextMonth}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:shadow-sm transition-all"
            >
              ›
            </button>
          </div>
          <button
            onClick={goToday}
            className="px-3 py-1.5 text-sm font-medium text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
          >
            วันนี้
          </button>

          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-sm">
              ⌕
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหา Event..."
              className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400 w-40"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto max-w-[280px]">
            <button
              onClick={() => setTypeFilter('')}
              className={cn(
                'shrink-0 px-3 py-1.5 text-xs font-medium rounded-full transition-colors',
                typeFilter === ''
                  ? 'bg-violet-600 text-white'
                  : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
              )}
            >
              ทั้งหมด
            </button>
            {availableTypes.map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={cn(
                  'shrink-0 px-3 py-1.5 text-xs font-medium rounded-full transition-colors',
                  typeFilter === t
                    ? 'bg-violet-600 text-white'
                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                )}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <div className="flex bg-slate-50 rounded-xl p-1">
              <button
                onClick={() => setViewMode('calendar')}
                className={cn(
                  'px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors',
                  viewMode === 'calendar'
                    ? 'bg-white text-violet-600 shadow-sm'
                    : 'text-slate-400 hover:text-slate-600'
                )}
              >
                เดือน
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={cn(
                  'px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors',
                  viewMode === 'table'
                    ? 'bg-white text-violet-600 shadow-sm'
                    : 'text-slate-400 hover:text-slate-600'
                )}
              >
                รายการ
              </button>
            </div>

            <button
              onClick={handleExportCsv}
              title="Export CSV"
              className="w-9 h-9 flex items-center justify-center text-sm border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
            >
              ⭳
            </button>
            <button
              onClick={handleImportClick}
              disabled={importing}
              title={importing ? 'กำลัง Import...' : 'Import CSV'}
              className="w-9 h-9 flex items-center justify-center text-sm border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              ⭱
            </button>
            <input
              ref={importFileInputRef}
              type="file"
              accept=".csv"
              onChange={handleImportFileChange}
              className="hidden"
            />

            <button
              onClick={openAddModal}
              className="bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors shadow-sm shadow-violet-200"
            >
              + Add Event
            </button>
          </div>
        </div>
      </div>

      {/* Main 2-column layout: Calendar/Table (left) + Summary panel (right) */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2">
          {/* Calendar */}
          {viewMode === 'calendar' && (
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
              {loading ? (
                <div className="py-20 text-center text-slate-400 text-sm">
                  กำลังโหลด...
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-7 gap-1 mb-2">
                    {THAI_DAYS.map((d) => (
                      <div
                        key={d}
                        className="text-center text-xs font-semibold text-slate-400 py-1"
                      >
                        {d}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1.5">
                    {calendarWeeks.map((week, wi) =>
                      week.map(({ date, inMonth }, di) => {
                        const dateStr = toLocalDateStr(date);
                        const dayEvents = eventsByDate.get(dateStr) ?? [];
                        const isToday = dateStr === todayStr;
                        return (
                          <div
                            key={`${wi}-${di}`}
                            className={cn(
                              'min-h-[88px] rounded-2xl p-1.5 border transition-colors',
                              isToday
                                ? 'border-violet-200 bg-violet-50/40'
                                : 'border-slate-50',
                              !inMonth && 'opacity-30'
                            )}
                          >
                            <span
                              className={cn(
                                'inline-flex items-center justify-center w-6 h-6 text-xs rounded-full',
                                isToday
                                  ? 'bg-violet-600 text-white font-semibold'
                                  : di === 0 || di === 6
                                  ? 'text-rose-400'
                                  : 'text-slate-600'
                              )}
                            >
                              {date.getDate()}
                            </span>
                            <div className="mt-1 space-y-0.5">
                              {dayEvents.slice(0, 2).map((e) => {
                                const c = getEventTypeColor(e.type);
                                return (
                                  <button
                                    key={e.id}
                                    onClick={() => openDrawer(e)}
                                    title={`${e.title} — ${e.type}`}
                                    className={cn(
                                      'w-full text-left text-[10px] px-1.5 py-0.5 rounded-md truncate block font-medium',
                                      c.bg,
                                      c.text
                                    )}
                                  >
                                    {e.title}
                                  </button>
                                );
                              })}
                              {dayEvents.length > 2 && (
                                <p className="text-[10px] text-slate-400 px-1">
                                  +{dayEvents.length - 2} เพิ่มเติม
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Table View */}
          {viewMode === 'table' && (
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
              {loading ? (
                <div className="py-20 text-center text-slate-400 text-sm">
                  กำลังโหลด...
                </div>
              ) : tableRows.length === 0 ? (
                <div className="py-20 text-center text-slate-400 text-sm">
                  No events found
                </div>
              ) : (
                <>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                        <th className="py-2 px-2 font-medium">Date</th>
                        <th className="py-2 px-2 font-medium">Title</th>
                        <th className="py-2 px-2 font-medium">Type</th>
                        <th className="py-2 px-2 font-medium">Visibility</th>
                        <th className="py-2 px-2 font-medium">Created By</th>
                        <th className="py-2 px-2 font-medium text-right">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {tablePaginated.map((e) => (
                        <tr
                          key={e.id}
                          className="border-b border-slate-50 last:border-0"
                        >
                          <td className="py-2 px-2 text-slate-700">{e.date}</td>
                          <td className="py-2 px-2 text-slate-900 font-medium">
                            {e.title}
                          </td>
                          <td className="py-2 px-2 text-slate-700">{e.type}</td>
                          <td className="py-2 px-2 text-slate-700">
                            {e.visibilityScope === 'company'
                              ? 'Company-wide'
                              : 'Departments'}
                          </td>
                          <td className="py-2 px-2 text-slate-700">
                            {e.createdByName}
                          </td>
                          <td className="py-2 px-2 text-right">
                            <button
                              onClick={() => openDrawer(e)}
                              className="text-xs text-violet-600 hover:underline"
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {tableTotalPages > 1 && (
                    <div className="flex items-center justify-between mt-4">
                      <button
                        onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                        disabled={tablePage === 1}
                        className="px-3 py-1.5 text-sm border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-50"
                      >
                        ก่อนหน้า
                      </button>
                      <span className="text-xs text-slate-400">
                        หน้า {tablePage} / {tableTotalPages}
                      </span>
                      <button
                        onClick={() =>
                          setTablePage((p) => Math.min(tableTotalPages, p + 1))
                        }
                        disabled={tablePage === tableTotalPages}
                        className="px-3 py-1.5 text-sm border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-50"
                      >
                        ถัดไป
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Right panel: This Month ring + Upcoming list */}
        <div className="space-y-5">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
            <p className="text-sm font-semibold text-slate-900 mb-4">
              This Month
            </p>
            <div className="flex items-center gap-5">
              <svg
                viewBox="0 0 100 100"
                className="w-24 h-24 shrink-0 -rotate-90"
              >
                <circle
                  cx="50"
                  cy="50"
                  r={RING_R}
                  fill="none"
                  stroke="#EDE9FE"
                  strokeWidth="10"
                />
                {ringTotal > 0 && (
                  <circle
                    cx="50"
                    cy="50"
                    r={RING_R}
                    fill="none"
                    stroke="#7C3AED"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={`${RING_C * companyRatio} ${RING_C}`}
                  />
                )}
                <text
                  x="50"
                  y="50"
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="fill-slate-900"
                  style={{
                    fontSize: '22px',
                    fontWeight: 700,
                    transform: 'rotate(90deg)',
                    transformOrigin: '50px 50px',
                  }}
                >
                  {statsCards.total}
                </text>
              </svg>
              <div className="space-y-2 text-sm flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-violet-600 shrink-0" />
                  <span className="text-slate-500">Company-wide</span>
                  <span className="ml-auto font-semibold text-slate-900">
                    {statsCards.companyWide}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-violet-200 shrink-0" />
                  <span className="text-slate-500">Department</span>
                  <span className="ml-auto font-semibold text-slate-900">
                    {statsCards.departmentScoped}
                  </span>
                </div>
                <div className="pt-1 border-t border-slate-50 flex items-center gap-2">
                  <span className="text-slate-400 text-xs">
                    {statsCards.upcoming
                      ? `อีก ${statsCards.daysUntilUpcoming} วัน — ${statsCards.upcoming.title}`
                      : 'ไม่มี Event ที่จะถึง'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
            <p className="text-sm font-semibold text-slate-900 mb-3">
              Upcoming
            </p>
            {upcomingList.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">
                ไม่มี Event ที่จะถึงเร็วๆ นี้
              </p>
            ) : (
              <div className="space-y-1">
                {upcomingList.map((e) => {
                  const c = getEventTypeColor(e.type);
                  return (
                    <button
                      key={e.id}
                      onClick={() => openDrawer(e)}
                      className="w-full flex items-center gap-3 text-left p-2 rounded-xl hover:bg-slate-50 transition-colors"
                    >
                      <span
                        className={cn(
                          'w-2 h-2 rounded-full shrink-0',
                          c.text.replace('text-', 'bg-')
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {e.title}
                        </p>
                        <p className="text-xs text-slate-400">{e.type}</p>
                      </div>
                      <span className="text-xs text-slate-400 whitespace-nowrap shrink-0">
                        {formatShortDate(e.date)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Event Detail Drawer */}
      {showDrawer && editingEvent && (
        <div className="fixed inset-0 bg-black/40 flex justify-end z-50">
          <div className="bg-white h-full w-full max-w-sm p-6 space-y-4 overflow-y-auto">
            <div className="flex items-start justify-between">
              <h3 className="text-base font-semibold text-gray-900">
                รายละเอียด Event
              </h3>
              <button
                onClick={closeDrawer}
                className="text-gray-400 hover:text-gray-600 text-sm"
              >
                ✕
              </button>
            </div>

            <div>
              <p className="text-xs text-gray-400 mb-0.5">Title</p>
              <p className="text-sm font-medium text-gray-900">
                {editingEvent.title}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-400 mb-0.5">Description</p>
              <p className="text-sm text-gray-700">
                {editingEvent.description || '—'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Date</p>
                <p className="text-sm text-gray-700">{editingEvent.date}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Type</p>
                <p className="text-sm text-gray-700">{editingEvent.type}</p>
              </div>
            </div>

            <div>
              <p className="text-xs text-gray-400 mb-0.5">Time</p>
              <p className="text-sm text-gray-700">
                {editingEvent.isAllDay || !editingEvent.startTime
                  ? 'ตลอดวัน (All-day)'
                  : `${editingEvent.startTime} - ${editingEvent.endTime}`}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-400 mb-0.5">Visibility Scope</p>
              <p className="text-sm text-gray-700">
                {editingEvent.visibilityScope === 'company'
                  ? 'Company-wide'
                  : 'Departments'}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-400 mb-0.5">
                Visible Departments
              </p>
              <p className="text-sm text-gray-700">
                {editingEvent.visibilityScope === 'company'
                  ? 'Company-wide'
                  : getDepartmentNames(editingEvent.visibleDepartmentIds)}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-400 mb-0.5">Created By</p>
              <p className="text-sm text-gray-700">
                {editingEvent.createdByName}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-400 mb-0.5">Creator Department</p>
              <p className="text-sm text-gray-700">
                {editingEvent.createdByDepartment}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-400 mb-0.5">
                ผู้เกี่ยวข้อง (Attendees)
              </p>
              {editingEvent.attendeeUserIds &&
              editingEvent.attendeeUserIds.length > 0 ? (
                <div className="flex flex-wrap gap-1 mt-1">
                  {editingEvent.attendeeUserIds.map((id) => (
                    <span
                      key={id}
                      className="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded-full"
                    >
                      {attendeeNameCache[id] ?? id}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-700">—</p>
              )}
            </div>

            {canManage && (
              <div className="pt-2 space-y-2">
                <button
                  onClick={() => openEditModal(editingEvent)}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-xl transition-colors"
                >
                  แก้ไข
                </button>
                {confirmingDelete ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDelete(editingEvent)}
                      disabled={deleting}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2 rounded-xl transition-colors disabled:opacity-50"
                    >
                      {deleting ? 'กำลังลบ...' : 'ยืนยันลบ'}
                    </button>
                    <button
                      onClick={() => setConfirmingDelete(false)}
                      disabled={deleting}
                      className="flex-1 border border-gray-200 text-sm font-medium py-2 rounded-xl hover:bg-gray-50 disabled:opacity-50"
                    >
                      ยกเลิก
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmingDelete(true)}
                    className="w-full border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium py-2 rounded-xl transition-colors"
                  >
                    ลบ
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-semibold text-gray-900">
              {editingEvent ? 'แก้ไข Event' : 'เพิ่ม Event'}
            </h3>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                ชื่อ Event <span className="text-red-500">*</span>
              </label>
              <input
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                รายละเอียด
              </label>
              <textarea
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                rows={2}
                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  วันที่ <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, date: e.target.value }))
                  }
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  ประเภท
                </label>
                <input
                  value={form.type}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, type: e.target.value }))
                  }
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  เวลาเริ่ม
                </label>
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, startTime: e.target.value }))
                  }
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  เวลาสิ้นสุด
                </label>
                <input
                  type="time"
                  value={form.endTime}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, endTime: e.target.value }))
                  }
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <p className="col-span-2 text-xs text-gray-400 -mt-1">
                ไม่ระบุเวลา = ถือเป็นกิจกรรมตลอดวัน (All-day)
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">
                Visibility <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-1.5 text-sm text-gray-700">
                  <input
                    type="radio"
                    checked={form.visibilityScope === 'company'}
                    onChange={() =>
                      setForm((f) => ({
                        ...f,
                        visibilityScope: 'company',
                        visibleDepartmentIds: [],
                      }))
                    }
                  />
                  Company (ทุกคนเห็น)
                </label>
                <label className="flex items-center gap-1.5 text-sm text-gray-700">
                  <input
                    type="radio"
                    checked={form.visibilityScope === 'departments'}
                    onChange={() =>
                      setForm((f) => ({ ...f, visibilityScope: 'departments' }))
                    }
                  />
                  Departments (เฉพาะแผนก)
                </label>
              </div>
            </div>

            {form.visibilityScope === 'departments' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">
                  เลือกแผนก <span className="text-red-500">*</span>
                </label>
                <div className="border border-gray-200 rounded-lg p-2 max-h-40 overflow-y-auto space-y-1">
                  {departments.length === 0 ? (
                    <p className="text-xs text-gray-400 px-1 py-1">
                      ไม่พบข้อมูลแผนก
                    </p>
                  ) : (
                    departments.map((d) => (
                      <label
                        key={d.id}
                        className="flex items-center gap-1.5 text-sm text-gray-700 px-1 py-0.5"
                      >
                        <input
                          type="checkbox"
                          checked={form.visibleDepartmentIds.includes(d.id)}
                          onChange={() => toggleDepartment(d.id)}
                        />
                        {d.name}
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">
                ผู้เกี่ยวข้อง (Attendees)
              </label>

              {form.attendeeUserIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {form.attendeeUserIds.map((id) => (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded-full"
                    >
                      {attendeeNameCache[id] ?? id}
                      <button
                        onClick={() => toggleAttendee(id)}
                        className="text-blue-400 hover:text-blue-700"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <input
                value={attendeeSearch}
                onChange={(e) => setAttendeeSearch(e.target.value)}
                placeholder="ค้นหาชื่อพนักงาน..."
                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              {attendeeSearch.trim() && (
                <div className="border border-gray-200 rounded-lg mt-1 max-h-40 overflow-y-auto">
                  {attendeeSearchLoading ? (
                    <p className="text-xs text-gray-400 px-3 py-2">
                      กำลังค้นหา...
                    </p>
                  ) : attendeeSearchResults.length === 0 ? (
                    <p className="text-xs text-gray-400 px-3 py-2">
                      ไม่พบพนักงานที่ตรงกับคำค้นหา
                    </p>
                  ) : (
                    attendeeSearchResults.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => toggleAttendee(p.id)}
                        className="w-full flex items-center justify-between text-left px-3 py-1.5 text-sm hover:bg-gray-50"
                      >
                        <span>
                          {p.name}
                          <span className="text-gray-400 text-xs ml-1">
                            {p.departmentName}
                          </span>
                        </span>
                        {form.attendeeUserIds.includes(p.id) && (
                          <span className="text-blue-600 text-xs">
                            เลือกแล้ว
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={closeModal}
                disabled={saving}
                className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
              >
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
