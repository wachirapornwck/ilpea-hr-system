'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth/context';

export interface TodayAttendanceData {
  id: string;
  date: string;
  shiftId: string;
  clockInTime: string | null;
  clockOutTime: string | null;
  clockInFormatted: string | null;
  clockOutFormatted: string | null;
  status: string;
  statusLabel: string;
  statusColor: { bg: string; text: string; border: string; dot: string };
  lateMinutes: number;
  earlyLeaveMinutes: number;
  workingHours: number;
  overtimeMinutes: number;
  hasClockedIn: boolean;
  hasClockedOut: boolean;
  effectiveShift: {
    source: string;
    startTotalMinutes: number;
    endTotalMinutes: number;
  };
}

export interface TodayAttendanceResponse {
  success: boolean;
  data: TodayAttendanceData | null;
  today: string;
  holiday: { id: string; name: string; type: string } | null;
  canClockIn: boolean;
  isWhiteCollar: boolean;
  message?: string;
}

export interface AttendanceRecord {
  id: string;
  userId: string;
  date: string;
  shiftId: string;
  clockInTime: string | null;
  clockOutTime: string | null;
  status: string;
  statusLabel: string;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  workingHours: number;
  overtimeMinutes: number;
  shiftAllowance: number;
  otMealAllowance: number;
}

export interface AttendanceSummary {
  presentDays: number;
  absentDays: number;
  lateDays: number;
  earlyLeaveDays: number;
  leaveDays: number;
  totalWorkingDays: number;
  totalLateMinutes: number;
  totalOvertimeMinutes: number;
  totalWorkingHours: number;
  diligenceAllowanceEarned: boolean;
}

export interface HistoryResponse {
  records: AttendanceRecord[];
  total: number;
  summary: AttendanceSummary | null;
}

export interface ClockInPayload {
  shiftId: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
}

export interface AdjustmentPayload {
  userId: string;
  date: string;
  shiftId: string;
  clockInTime: string;
  clockOutTime: string;
  reason: string;
  comment: string;
}

export function useAttendance() {
  const { user } = useAuth();

  const [today, setToday] = useState<TodayAttendanceResponse | null>(null);
  const [todayLoading, setTodayLoading] = useState(false);
  const [todayError, setTodayError] = useState<string | null>(null);

  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchToday = useCallback(async () => {
    if (!user?.id) return;
    setTodayLoading(true);
    setTodayError(null);
    try {
      const res = await fetch(`/api/attendance/today?userId=${user.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'โหลดข้อมูลไม่สำเร็จ');
      setToday({
        success: data.success,
        data: data.data,
        today: data.today,
        holiday: data.holiday ?? null,
        canClockIn: data.canClockIn ?? true,
        isWhiteCollar: data.isWhiteCollar ?? false,
        message: data.message,
      });
    } catch (err) {
      setTodayError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setTodayLoading(false);
    }
  }, [user?.id]);

  const fetchHistory = useCallback(
    async (year: number, month: number, withSummary = true) => {
      if (!user?.id) return;
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const params = new URLSearchParams({
          userId: user.id,
          year: String(year),
          month: String(month),
          summary: String(withSummary),
        });
        const res = await fetch(`/api/attendance/history?${params}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'โหลดประวัติไม่สำเร็จ');
        setHistory(data.data);
      } catch (err) {
        setHistoryError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
      } finally {
        setHistoryLoading(false);
      }
    },
    [user?.id]
  );

  const clockIn = useCallback(
    async (
      payload: ClockInPayload
    ): Promise<{ success: boolean; message: string }> => {
      if (!user?.id) return { success: false, message: 'ไม่พบข้อมูลผู้ใช้' };
      setActionLoading(true);
      setActionError(null);
      try {
        const res = await fetch('/api/attendance/clock-in', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            shiftId: payload.shiftId,
            latitude: payload.latitude ?? null,
            longitude: payload.longitude ?? null,
            accuracy: payload.accuracy ?? null,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'เช็คอินไม่สำเร็จ');
        await fetchToday();
        return { success: true, message: data.message };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด';
        setActionError(msg);
        return { success: false, message: msg };
      } finally {
        setActionLoading(false);
      }
    },
    [user?.id, fetchToday]
  );

  const clockOut = useCallback(async (): Promise<{
    success: boolean;
    message: string;
  }> => {
    if (!user?.id) return { success: false, message: 'ไม่พบข้อมูลผู้ใช้' };
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch('/api/attendance/clock-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          departmentId: (user as any).departmentId ?? '',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'เช็คเอาท์ไม่สำเร็จ');
      await fetchToday();
      return { success: true, message: data.message };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด';
      setActionError(msg);
      return { success: false, message: msg };
    } finally {
      setActionLoading(false);
    }
  }, [user?.id, fetchToday]);

  const submitAdjustment = useCallback(
    async (
      payload: AdjustmentPayload
    ): Promise<{ success: boolean; message: string }> => {
      if (!user?.id) return { success: false, message: 'ไม่พบข้อมูลผู้ใช้' };
      setActionLoading(true);
      setActionError(null);
      try {
        const res = await fetch('/api/attendance/adjustment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, modifiedBy: user.id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'แก้ไขข้อมูลไม่สำเร็จ');
        return { success: true, message: data.message };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด';
        setActionError(msg);
        return { success: false, message: msg };
      } finally {
        setActionLoading(false);
      }
    },
    [user?.id]
  );

  const getGpsCoordinates = useCallback((): Promise<{
    latitude: number;
    longitude: number;
    accuracy: number;
  } | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          }),
        () => resolve(null),
        { timeout: 5000, maximumAge: 60000 }
      );
    });
  }, []);

  const refreshAll = useCallback(async () => {
    const now = new Date();
    await Promise.all([
      fetchToday(),
      fetchHistory(now.getFullYear(), now.getMonth() + 1, true),
    ]);
  }, [fetchToday, fetchHistory]);

  useEffect(() => {
    if (user?.id) fetchToday();
  }, [user?.id, fetchToday]);

  return {
    today,
    todayLoading,
    todayError,
    fetchToday,
    history,
    historyLoading,
    historyError,
    fetchHistory,
    clockIn,
    clockOut,
    submitAdjustment,
    actionLoading,
    actionError,
    getGpsCoordinates,
    refreshAll,
  };
}
