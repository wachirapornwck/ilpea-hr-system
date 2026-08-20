// lib/hooks/useEmployees.ts
'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/lib/auth/context';
import type {
  EmployeeListItem,
  EmployeeDetail,
  EmployeeFilters,
  CreateEmployeePayload,
  UpdateEmployeePayload,
  PaginationResult,
} from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseEmployeesReturn {
  employees: EmployeeListItem[];
  total: number;
  page: number;
  hasMore: boolean;
  loading: boolean;
  error: string | null;
  filters: EmployeeFilters;
  setFilters: (filters: Partial<EmployeeFilters>) => void;
  setPage: (page: number) => void;
  refresh: () => void;
}

export interface UseEmployeeDetailReturn {
  employee: EmployeeDetail | null;
  loading: boolean;
  error: string | null;
  update: (
    payload: UpdateEmployeePayload
  ) => Promise<{ success: boolean; message: string }>;
  disable: (reason?: string) => Promise<{ success: boolean; message: string }>;
  refresh: () => void;
}

export interface UseEmployeeCreateReturn {
  create: (
    payload: CreateEmployeePayload
  ) => Promise<{ success: boolean; message: string; id?: string }>;
  loading: boolean;
  error: string | null;
}

const DEFAULT_FILTERS: EmployeeFilters = {
  search: '',
  departmentId: '',
  positionId: '',
  employeeType: '',
  employmentStatus: 'active',
};

// ─── useEmployees (list) ──────────────────────────────────────────────────────

export function useEmployees(): UseEmployeesReturn {
  const { user } = useAuth();

  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFiltersState] = useState<EmployeeFilters>(DEFAULT_FILTERS);

  const setFilters = useCallback((partial: Partial<EmployeeFilters>) => {
    setFiltersState((prev) => ({ ...prev, ...partial }));
    setPage(1); // reset page on filter change
  }, []);

  const fetchEmployees = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        requesterId: user.id,
        page: String(page),
      });
      if (filters.search) params.set('search', filters.search);
      if (filters.departmentId)
        params.set('departmentId', filters.departmentId);
      if (filters.employeeType)
        params.set('employeeType', filters.employeeType);
      if (filters.employmentStatus)
        params.set('employmentStatus', filters.employmentStatus);

      const res = await fetch(`/api/employees?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'โหลดข้อมูลไม่สำเร็จ');

      const result: PaginationResult<EmployeeListItem> = data.data;
      setEmployees(result.items);
      setTotal(result.total);
      setHasMore(result.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  }, [user?.id, page, filters]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  return {
    employees,
    total,
    page,
    hasMore,
    loading,
    error,
    filters,
    setFilters,
    setPage,
    refresh: fetchEmployees,
  };
}

// ─── useEmployeeDetail ────────────────────────────────────────────────────────

export function useEmployeeDetail(employeeId: string): UseEmployeeDetailReturn {
  const { user } = useAuth();

  const [employee, setEmployee] = useState<EmployeeDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!user?.id || !employeeId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/employees/${employeeId}?requesterId=${user.id}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'โหลดข้อมูลไม่สำเร็จ');
      setEmployee(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  }, [user?.id, employeeId]);

  const update = useCallback(
    async (payload: UpdateEmployeePayload) => {
      if (!user?.id) return { success: false, message: 'ไม่พบผู้ใช้' };
      try {
        const res = await fetch(`/api/employees/${employeeId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requesterId: user.id, ...payload }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'แก้ไขไม่สำเร็จ');
        await fetchDetail();
        return { success: true, message: data.message };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด';
        return { success: false, message: msg };
      }
    },
    [user?.id, employeeId, fetchDetail]
  );

  const disable = useCallback(
    async (reason?: string) => {
      if (!user?.id) return { success: false, message: 'ไม่พบผู้ใช้' };
      try {
        const res = await fetch(`/api/employees/${employeeId}/disable`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requesterId: user.id, reason }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'ระงับบัญชีไม่สำเร็จ');
        await fetchDetail();
        return { success: true, message: data.message };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด';
        return { success: false, message: msg };
      }
    },
    [user?.id, employeeId, fetchDetail]
  );

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  return { employee, loading, error, update, disable, refresh: fetchDetail };
}

// ─── useEmployeeCreate ────────────────────────────────────────────────────────

export function useEmployeeCreate(): UseEmployeeCreateReturn {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(
    async (payload: CreateEmployeePayload) => {
      if (!user?.id) return { success: false, message: 'ไม่พบผู้ใช้' };
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/employees', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requesterId: user.id, ...payload }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'สร้างพนักงานไม่สำเร็จ');
        return { success: true, message: data.message, id: data.data?.id };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด';
        setError(msg);
        return { success: false, message: msg };
      } finally {
        setLoading(false);
      }
    },
    [user?.id]
  );

  return { create, loading, error };
}
