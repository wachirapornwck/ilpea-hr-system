'use client';

// =============================================================================
// src/app/(app)/leave-balances/page.tsx
// =============================================================================
// Leave Balance Management — Phase 2 Step 7 (Refactor Only).
//
// No new features, no behavior changes, no API contract changes. This pass
// only reorganizes existing code for readability:
//   - Modal-related state is grouped together under one section.
//   - Modal reset logic extracted into resetModalState() (called by
//     handleCloseModal, which still also flips showModal off).
//   - The repeated balanceSummaryMap write (identical in
//     loadBalancesForEmployee and handleSave) extracted into
//     updateBalanceCache().
//   - The balances-vs-balancesSnapshot comparison extracted into
//     hasUnsavedChanges().
//   - Named comment sections added: Modal State / Data Loading / Cache
//     Helpers / Event Handlers.
//
// NOTE: every generic type argument in this file is kept on a single line
// (e.g. `useState<Record<string, X>>({})` instead of splitting `<` onto its
// own line) — this editor environment has repeatedly stripped `<` / `(`
// whenever a generic wraps onto a new line, so multi-line generics are
// avoided entirely here as a defensive measure.
// =============================================================================

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/lib/auth/context';
import { useEmployees } from '@/lib/hooks/useEmployees';
import PageHeader from '@/components/layout/PageHeader';
import type { EmployeeListItem } from '@/types';
import type { LeaveType } from '@/types/leave';

const STATUS_LABEL: Record<string, string> = {
  active: 'ปกติ',
  inactive: 'ระงับแล้ว',
};

const STATUS_CLASS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-red-100 text-red-600',
};

const CURRENT_YEAR = new Date().getFullYear();

type BalanceStatusFilter =
  | 'all'
  | 'configured'
  | 'not_configured'
  | 'not_loaded';

// Balance cache entry — total + configured + when it was last written, so
// the Total Balance / Status / Last Updated columns and the Summary Cards
// never have to recompute anything from raw numbers or issue extra calls.
interface BalanceSummaryCache {
  total: number;
  configured: boolean;
  updatedAt: string | null;
}

type ToastState = { message: string; type: 'success' | 'error' };

function getBalanceStatus(
  cached: BalanceSummaryCache | undefined
): Exclude<BalanceStatusFilter, 'all'> {
  if (!cached) return 'not_loaded';
  return cached.configured ? 'configured' : 'not_configured';
}

export default function LeaveBalancesPage() {
  const { user } = useAuth();
  const isHR = user?.role === 'admin' || user?.role === 'hr_manager';

  const {
    employees,
    total,
    page,
    hasMore,
    loading,
    error,
    filters,
    setFilters,
    setPage,
    refresh,
  } = useEmployees();

  // ===========================================================================
  // Page-level filters (list/table)
  // ===========================================================================
  const [searchInput, setSearchInput] = useState('');
  const [year, setYear] = useState(CURRENT_YEAR);
  const [statusFilter, setStatusFilter] = useState<BalanceStatusFilter>('all');

  // Leave Types — master data, never hardcoded
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [loadingLeaveTypes, setLoadingLeaveTypes] = useState(true);

  // Balance cache — keyed by `${userId}_${year}` (same convention as the
  // leaveBalances doc id server-side). Lazy-filled only when a row's View
  // is opened; never fetched in bulk on page load. Re-opening the Modal for
  // the same employee always re-fetches from Firestore — this cache is only
  // used to paint the Total Balance / Status / Last Updated columns and the
  // Summary Cards, never as a substitute for the GET call itself.
  const [balanceSummaryMap, setBalanceSummaryMap] = useState<
    Record<string, BalanceSummaryCache>
  >({});

  const [toast, setToast] = useState<ToastState | null>(null);

  // ===========================================================================
  // Modal State
  // ===========================================================================
  const [showModal, setShowModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] =
    useState<EmployeeListItem | null>(null);
  // Snapshot of `year` taken when the Modal opens — Save always uses this,
  // never the live page-level `year` selector, so changing the selector
  // while the Modal is open can never write to the wrong year.
  const [modalYear, setModalYear] = useState(CURRENT_YEAR);
  const [balances, setBalances] = useState<Record<string, string>>({});
  // Snapshot taken right after each successful load (View, or reload after
  // Save) — used purely to detect unsaved edits before closing.
  const [balancesSnapshot, setBalancesSnapshot] = useState<
    Record<string, string>
  >({});
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // ===========================================================================
  // Data Loading
  // ===========================================================================

  // Debounce search — same pattern as /employees
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters({ search: searchInput });
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput, setFilters]);

  // Load leave types on mount
  useEffect(() => {
    if (!user?.id) return;
    setLoadingLeaveTypes(true);
    fetch(`/api/leave-types?requesterId=${user.id}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setLeaveTypes(
            (json.data as LeaveType[])
              .filter((lt) => lt.active !== false)
              .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
          );
        }
      })
      .catch(() => {})
      .finally(() => setLoadingLeaveTypes(false));
  }, [user?.id]);

  // Auto-dismiss external toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  // Auto-dismiss in-Modal success indicator (~3s)
  useEffect(() => {
    if (!successMessage) return;
    const t = setTimeout(() => setSuccessMessage(null), 3000);
    return () => clearTimeout(t);
  }, [successMessage]);

  // Shared by View and by the post-Save reload — always hits Firestore via
  // the same GET endpoint; never reads from balanceSummaryMap as a
  // shortcut.
  const loadBalancesForEmployee = async (emp: EmployeeListItem, yr: number) => {
    if (!user?.id) return;
    setLoadingBalances(true);
    try {
      const res = await fetch(
        `/api/leave-balances?requesterId=${user.id}&userId=${emp.id}&year=${yr}`
      );
      const json = await res.json();
      if (json.success) {
        const raw: Record<string, number> = json.data.balances || {};
        const next: Record<string, string> = {};
        let sum = 0;
        leaveTypes.forEach((lt) => {
          const val = raw[lt.code] ?? 0;
          next[lt.code] = String(val);
          sum += val;
        });
        setBalances(next);
        setBalancesSnapshot(next);
        updateBalanceCache(emp.id, yr, {
          total: sum,
          configured: sum > 0,
          updatedAt: json.data.updatedAt ?? null,
        });
      } else {
        setToast({
          message: json.error?.message || 'โหลดยอดวันลาไม่สำเร็จ',
          type: 'error',
        });
      }
    } catch {
      setToast({ message: 'โหลดยอดวันลาไม่สำเร็จ', type: 'error' });
    } finally {
      setLoadingBalances(false);
    }
  };

  // ===========================================================================
  // Cache Helpers
  // ===========================================================================

  // Single write path for balanceSummaryMap — used by both
  // loadBalancesForEmployee (after GET) and handleSave (after PATCH) so the
  // cache shape/key convention only needs to be correct in one place.
  const updateBalanceCache = (
    userId: string,
    yr: number,
    data: BalanceSummaryCache
  ) => {
    setBalanceSummaryMap((prev) => ({
      ...prev,
      [`${userId}_${yr}`]: data,
    }));
  };

  // Department options built purely from the employees already loaded on
  // this page (no new fetch) — deduped by departmentId, sorted by name.
  const departmentOptions = useMemo(() => {
    const map = new Map<string, string>();
    employees.forEach((e) => {
      if (e.departmentId && e.departmentName) {
        map.set(e.departmentId, e.departmentName);
      }
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'th'));
  }, [employees]);

  // Status filter — purely client-side, layered on top of the already
  // server-filtered `employees` list. Does not touch search/department/year
  // logic at all.
  const visibleEmployees = useMemo(() => {
    if (statusFilter === 'all') return employees;
    return employees.filter(
      (emp) =>
        getBalanceStatus(balanceSummaryMap[`${emp.id}_${year}`]) ===
        statusFilter
    );
  }, [employees, balanceSummaryMap, year, statusFilter]);

  // Summary Cards — derived entirely from the employees already loaded on
  // this page + the existing cache. No new fetch.
  const summary = useMemo(() => {
    let configured = 0;
    let notConfigured = 0;
    let notLoaded = 0;
    employees.forEach((emp) => {
      const status = getBalanceStatus(balanceSummaryMap[`${emp.id}_${year}`]);
      if (status === 'configured') configured++;
      else if (status === 'not_configured') notConfigured++;
      else notLoaded++;
    });
    return { total: employees.length, configured, notConfigured, notLoaded };
  }, [employees, balanceSummaryMap, year]);

  // Same date-format convention already used for `updatedAt` fields
  // elsewhere in the project (see HolidayDetailDrawer.tsx).
  const formatLastUpdated = (cached?: BalanceSummaryCache) => {
    if (!cached) return '—';
    if (!cached.updatedAt) return 'Never';
    return new Date(cached.updatedAt).toLocaleDateString('th-TH');
  };

  // ===========================================================================
  // Event Handlers
  // ===========================================================================

  const handleView = async (emp: EmployeeListItem) => {
    // Guard: never open the Modal with an unready leave-type list.
    if (!user?.id || loadingLeaveTypes) return;

    setSelectedEmployee(emp);
    setModalYear(year); // lock the year for the lifetime of this Modal
    setShowModal(true);
    setSuccessMessage(null);
    setShowDiscardConfirm(false);
    await loadBalancesForEmployee(emp, year);
  };

  // Resets every piece of Modal-local state back to its default — prevents
  // any state leaking into the next employee's Modal session. Does not
  // touch `showModal` itself; handleCloseModal owns that.
  const resetModalState = () => {
    setSelectedEmployee(null);
    setBalances({});
    setBalancesSnapshot({});
    setModalYear(CURRENT_YEAR);
    setLoadingBalances(false);
    setSaving(false);
    setSuccessMessage(null);
    setShowDiscardConfirm(false);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    resetModalState();
  };

  // Compares current balances against the last-loaded snapshot.
  const hasUnsavedChanges = () =>
    leaveTypes.some(
      (lt) => (balances[lt.code] ?? '') !== (balancesSnapshot[lt.code] ?? '')
    );

  // Entry point for the X button and Cancel — checks for unsaved edits
  // before actually closing. No window.confirm().
  const handleAttemptClose = () => {
    if (hasUnsavedChanges()) {
      setShowDiscardConfirm(true);
    } else {
      handleCloseModal();
    }
  };

  const handleBalanceChange = (code: string, value: string) => {
    setBalances((prev) => ({ ...prev, [code]: value }));
  };

  const handleSave = async () => {
    if (!selectedEmployee || !user?.id) return;

    // Client-side validation only
    const parsed: Record<string, number> = {};
    for (const lt of leaveTypes) {
      const raw = balances[lt.code];
      const num = raw === '' || raw === undefined ? 0 : Number(raw);
      if (Number.isNaN(num)) {
        setToast({ message: 'ยอดวันลาต้องเป็นตัวเลข', type: 'error' });
        return;
      }
      if (num < 0) {
        setToast({
          message: 'Leave balance cannot be negative',
          type: 'error',
        });
        return;
      }
      parsed[lt.code] = num;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/leave-balances', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requesterId: user.id,
          userId: selectedEmployee.id,
          year: modalYear, // always the year the Modal was opened with
          balances: parsed,
        }),
      });
      const json = await res.json();
      if (json.success) {
        const newTotal = Object.values(parsed).reduce((s, n) => s + n, 0);
        updateBalanceCache(selectedEmployee.id, modalYear, {
          total: newTotal,
          configured: newTotal > 0,
          updatedAt: new Date().toISOString(),
        });

        // Reload from Firestore (source of truth) instead of closing —
        // this also refreshes balancesSnapshot, so hasUnsavedChanges()
        // correctly reports false right after a successful Save.
        await loadBalancesForEmployee(selectedEmployee, modalYear);

        setSuccessMessage('Saved successfully');
        setToast({
          message: 'Leave balance updated successfully',
          type: 'success',
        });
      } else {
        setToast({
          message: json.error?.message || 'บันทึกไม่สำเร็จ',
          type: 'error',
        });
      }
    } catch {
      setToast({ message: 'บันทึกไม่สำเร็จ', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (!isHR) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400 text-sm">ไม่มีสิทธิ์เข้าถึงหน้านี้</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Leave Balance Management"
        subtitle={`จัดการยอดวันลาคงเหลือของพนักงาน · ทั้งหมด ${total} คน`}
      />

      {/* Summary Cards — same style as Holiday's Statistics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 mb-1">Employees</p>
          <p className="text-2xl font-bold text-gray-900">{summary.total}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 mb-1">Configured</p>
          <p className="text-2xl font-bold text-green-600">
            {summary.configured}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 mb-1">Not Configured</p>
          <p className="text-2xl font-bold text-yellow-600">
            {summary.notConfigured}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 mb-1">Not Loaded</p>
          <p className="text-2xl font-bold text-gray-400">
            {summary.notLoaded}
          </p>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4 shadow-sm">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search */}
          <div className="flex-1">
            <input
              type="text"
              placeholder="ค้นหา รหัส, ชื่อ, นามสกุล, ชื่อเล่น..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Department filter — dynamic, built from loaded employees */}
          <select
            value={filters.departmentId}
            onChange={(e) => setFilters({ departmentId: e.target.value })}
            className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">All Departments</option>
            {departmentOptions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          {/* Year selector — UI only, not wired to employee fetch */}
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value={CURRENT_YEAR}>{CURRENT_YEAR}</option>
          </select>

          {/* Status filter — client-side only, layered on top */}
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as BalanceStatusFilter)
            }
            className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="all">All</option>
            <option value="configured">Configured</option>
            <option value="not_configured">Not Configured</option>
            <option value="not_loaded">Not Loaded</option>
          </select>

          {/* Refresh */}
          <button
            onClick={refresh}
            disabled={loading}
            className="px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {loading ? '...' : '↻'}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Error */}
        {error && (
          <div className="p-6 text-center">
            <p className="text-red-500 text-sm">{error}</p>
            <button
              onClick={refresh}
              className="mt-2 text-blue-600 text-sm hover:underline"
            >
              ลองใหม่
            </button>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !error && (
          <div className="divide-y divide-gray-50">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="px-6 py-4 flex items-center gap-4">
                <div className="w-9 h-9 rounded-full bg-gray-100 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-32 bg-gray-100 animate-pulse rounded" />
                  <div className="h-3 w-20 bg-gray-100 animate-pulse rounded" />
                </div>
                <div className="h-3 w-24 bg-gray-100 animate-pulse rounded" />
                <div className="h-3 w-16 bg-gray-100 animate-pulse rounded" />
              </div>
            ))}
          </div>
        )}

        {/* Empty — covers both "no employees at all" and "filtered down to
            zero" (including the Status filter) */}
        {!loading && !error && visibleEmployees.length === 0 && (
          <div className="p-12 text-center">
            <p className="text-gray-400 text-sm">No employees found</p>
            <p className="text-gray-400 text-xs mt-1">
              Try adjusting your search or filters.
            </p>
          </div>
        )}

        {/* Data */}
        {!loading && !error && visibleEmployees.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500">
                      Employee ID
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      Employee Name
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      Department
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      Position
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      Employment Status
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      Total Balance
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      Status
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      Last Updated
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {visibleEmployees.map((emp) => {
                    const cached = balanceSummaryMap[`${emp.id}_${year}`];
                    const balanceStatus = !cached
                      ? {
                          label: 'Not Loaded',
                          cls: 'bg-gray-100 text-gray-600',
                        }
                      : cached.configured
                      ? {
                          label: 'Configured',
                          cls: 'bg-green-100 text-green-700',
                        }
                      : {
                          label: 'Not Configured',
                          cls: 'bg-yellow-100 text-yellow-700',
                        };
                    return (
                      <tr
                        key={emp.id}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-6 py-4 text-gray-900">
                          {emp.employeeId}
                        </td>
                        <td className="px-4 py-4">
                          <p className="font-medium text-gray-900">
                            {emp.firstNameTH} {emp.lastNameTH}
                          </p>
                          <p className="text-xs text-gray-400">
                            {emp.firstNameEN} {emp.lastNameEN}
                            {emp.nickname ? ` · ${emp.nickname}` : ''}
                          </p>
                        </td>
                        <td className="px-4 py-4 text-gray-600">
                          {emp.departmentName}
                        </td>
                        <td className="px-4 py-4 text-gray-600">
                          {emp.positionName}
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              STATUS_CLASS[emp.employmentStatus] ??
                              'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {STATUS_LABEL[emp.employmentStatus] ??
                              emp.employmentStatus}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-gray-600">
                          {cached ? cached.total : '—'}
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${balanceStatus.cls}`}
                          >
                            {balanceStatus.label}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-gray-600 text-xs">
                          {formatLastUpdated(cached)}
                        </td>
                        <td className="px-4 py-4">
                          <button
                            onClick={() => handleView(emp)}
                            disabled={loadingLeaveTypes}
                            className="px-3 py-1 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            {loadingLeaveTypes ? '...' : 'View'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination — reused as-is from useEmployees() */}
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
              <p className="text-xs text-gray-500">
                แสดง {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} จาก{' '}
                {total} คน
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(page - 1)}
                  disabled={page <= 1 || loading}
                  className="px-3 py-1 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  ← ก่อนหน้า
                </button>
                <span className="px-3 py-1 text-xs text-gray-500">
                  หน้า {page}
                </span>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={!hasMore || loading}
                  className="px-3 py-1 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  ถัดไป →
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Leave Balance Modal (in-file, not a separate component) ────── */}
      {showModal && selectedEmployee && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">
                Leave Balance
              </h3>
              <button
                onClick={handleAttemptClose}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {/* Read-only employee info — gray card, clearly separated from
                the editable form below, labels matching the Field
                label/value convention already used in
                employees/[id]/page.tsx */}
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 space-y-2">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Employee Name</p>
                <p className="text-sm font-medium text-gray-900">
                  {selectedEmployee.firstNameTH} {selectedEmployee.lastNameTH}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Employee ID</p>
                <p className="text-sm text-gray-900">
                  {selectedEmployee.employeeId}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Year</p>
                <p className="text-sm text-gray-900">{modalYear}</p>
              </div>
            </div>

            {showDiscardConfirm ? (
              <div className="px-6 py-10 text-center">
                <p className="text-sm text-gray-700 mb-4">
                  Discard unsaved changes?
                </p>
                <div className="flex justify-center gap-2">
                  <button
                    onClick={() => setShowDiscardConfirm(false)}
                    className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Continue Editing
                  </button>
                  <button
                    onClick={handleCloseModal}
                    className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
                  >
                    Discard Changes
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="px-6 py-4">
                  {successMessage && (
                    <p className="text-sm text-green-600 font-medium mb-3">
                      {successMessage}
                    </p>
                  )}
                  {loadingBalances ? (
                    <div className="py-8 text-center text-sm text-gray-400">
                      Loading leave balance...
                    </div>
                  ) : leaveTypes.length === 0 ? (
                    <div className="py-8 text-center text-sm text-gray-400">
                      ไม่พบประเภทการลา
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {leaveTypes.map((lt) => (
                        <div
                          key={lt.id}
                          className="flex items-center justify-between gap-3"
                        >
                          <label className="text-sm text-gray-700">
                            {lt.name}
                          </label>
                          <input
                            type="number"
                            value={balances[lt.code] ?? ''}
                            onChange={(e) =>
                              handleBalanceChange(lt.code, e.target.value)
                            }
                            disabled={saving}
                            className="w-24 px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:bg-gray-50"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
                  <button
                    onClick={handleAttemptClose}
                    className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    ยกเลิก
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || loadingBalances}
                    className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Toast (in-file, not a separate component) ───────────────────── */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 max-w-sm px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-start gap-2 ${
            toast.type === 'success'
              ? 'bg-green-600 text-white'
              : 'bg-red-600 text-white'
          }`}
        >
          <span>{toast.type === 'success' ? '✓' : '✕'}</span>
          <span className="flex-1">{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="opacity-70 hover:opacity-100"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
