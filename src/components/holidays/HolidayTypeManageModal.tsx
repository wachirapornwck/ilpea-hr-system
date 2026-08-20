'use client';

// =============================================================================
// src/components/holidays/HolidayTypeManageModal.tsx
// =============================================================================
// Self-contained management panel for the `holidayTypes` master list —
// create new types, deactivate/reactivate existing ones. Calls
// GET/POST/PATCH /api/holiday-types directly (not via callback props, since
// this widget's state doesn't need to bubble up to the Holiday page's own
// state — it's a separate master-data concern, same spirit as how
// Departments/Positions management is self-contained in Settings).
//
// Phase C scope only: this component exists on its own and is not yet
// wired into holidays/page.tsx (that's Phase D). It fetches its own data,
// does not receive `holidayTypes` as a prop.
//
// Does not touch holiday.type on existing Holiday records — deactivating a
// type here has zero effect on holidays that already reference its name.
// =============================================================================

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/lib/auth/context';
import { cn } from '@/lib/utils';

interface HolidayTypeRecord {
  id: string;
  name: string;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function HolidayTypeManageModal({ isOpen, onClose }: Props) {
  const { user } = useAuth();

  const [types, setTypes] = useState<HolidayTypeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);

  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchTypes = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/holiday-types?requesterId=${user.id}`);
      const json = await res.json();
      if (json.success) setTypes(json.data);
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
    if (isOpen) fetchTypes();
  }, [isOpen, fetchTypes]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleCreate = async () => {
    if (!user?.id) return;
    if (!newName.trim()) {
      setToast({ message: 'กรุณาระบุชื่อประเภท', type: 'error' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/holiday-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterId: user.id, name: newName.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        setToast({ message: 'เพิ่มประเภทสำเร็จ', type: 'success' });
        setNewName('');
        fetchTypes();
      } else {
        setToast({
          message: json.error?.message ?? 'เพิ่มไม่สำเร็จ',
          type: 'error',
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (t: HolidayTypeRecord) => {
    if (!user?.id) return;
    setTogglingId(t.id);
    try {
      const res = await fetch(`/api/holiday-types/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterId: user.id, isActive: !t.isActive }),
      });
      const json = await res.json();
      if (json.success) {
        setToast({
          message: t.isActive ? 'ปิดใช้งานแล้ว' : 'เปิดใช้งานแล้ว',
          type: 'success',
        });
        fetchTypes();
      } else {
        setToast({
          message: json.error?.message ?? 'ทำรายการไม่สำเร็จ',
          type: 'error',
        });
      }
    } finally {
      setTogglingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-1">
          <h3 className="text-base font-semibold text-gray-900">
            จัดการประเภทวันหยุด
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-sm"
          >
            ✕
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-4">
          ปิดใช้งานประเภทที่ไม่ใช้แล้วได้โดยไม่กระทบวันหยุดเดิมที่เคยใช้ประเภทนั้นอยู่
        </p>

        {toast && (
          <div
            className={cn(
              'mb-3 px-3 py-2 rounded-lg text-xs font-medium',
              toast.type === 'success'
                ? 'bg-green-50 text-green-700'
                : 'bg-red-50 text-red-700'
            )}
          >
            {toast.message}
          </div>
        )}

        {/* Create new type */}
        <div className="flex gap-2 mb-4">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="ชื่อประเภทใหม่"
            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleCreate}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'กำลังเพิ่ม...' : '+ เพิ่ม'}
          </button>
        </div>

        {/* List — both active and inactive */}
        {loading ? (
          <div className="py-10 text-center text-gray-400 text-sm">
            กำลังโหลด...
          </div>
        ) : types.length === 0 ? (
          <div className="py-10 text-center text-gray-400 text-sm">
            ยังไม่มีประเภทวันหยุด
          </div>
        ) : (
          <div className="space-y-1.5">
            {types.map((t) => (
              <div
                key={t.id}
                className={cn(
                  'flex items-center justify-between px-3 py-2 rounded-lg border',
                  t.isActive ? 'border-gray-100' : 'border-gray-100 bg-gray-50'
                )}
              >
                <span
                  className={cn(
                    'text-sm',
                    t.isActive ? 'text-gray-900' : 'text-gray-400 line-through'
                  )}
                >
                  {t.name}
                </span>
                <button
                  onClick={() => handleToggleActive(t)}
                  disabled={togglingId === t.id}
                  className={cn(
                    'text-xs font-medium hover:underline disabled:opacity-50',
                    t.isActive ? 'text-red-500' : 'text-green-600'
                  )}
                >
                  {togglingId === t.id
                    ? '...'
                    : t.isActive
                    ? 'ปิดใช้งาน'
                    : 'เปิดใช้งาน'}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 transition-colors"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}
