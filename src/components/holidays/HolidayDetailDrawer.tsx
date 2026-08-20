'use client';

// =============================================================================
// src/components/holidays/HolidayDetailDrawer.tsx
// =============================================================================

import { cn } from '@/lib/utils';
import type { Holiday } from '@/types/holiday';

interface Props {
  holiday: Holiday | null;
  onClose: () => void;
  onEdit?: (h: Holiday) => void;
  onRequestDelete?: (h: Holiday) => void;
  onToggleActive?: (h: Holiday) => void;
  /** Mirrors the page-level `isHR` check — hides the management actions
   * below (Edit/Toggle-Active/Delete) for non-HR viewers, same rule as the
   * table and toolbar in holidays/page.tsx. Defaults to true so any other
   * caller of this component keeps its previous behavior unchanged. */
  canManage?: boolean;
}

export default function HolidayDetailDrawer({
  holiday,
  onClose,
  onEdit,
  onRequestDelete,
  onToggleActive,
  canManage = true,
}: Props) {
  if (!holiday) return null;
  const isActive = holiday.isActive !== false;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white h-full shadow-xl p-6 overflow-y-auto">
        <div className="flex items-start justify-between mb-6">
          <h3 className="text-base font-semibold text-gray-900">
            รายละเอียดวันหยุด
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-xs text-gray-400 mb-1">ชื่อวันหยุด</p>
            <p className="text-sm font-medium text-gray-900">{holiday.name}</p>
            {holiday.nameEN && (
              <p className="text-xs text-gray-500">{holiday.nameEN}</p>
            )}
          </div>

          <div>
            <p className="text-xs text-gray-400 mb-1">วันที่</p>
            <p className="text-sm text-gray-900">{holiday.date}</p>
          </div>

          <div>
            <p className="text-xs text-gray-400 mb-1">ประเภท</p>
            <p className="text-sm text-gray-900">{holiday.type}</p>
          </div>

          {holiday.description && (
            <div>
              <p className="text-xs text-gray-400 mb-1">รายละเอียด</p>
              <p className="text-sm text-gray-700">{holiday.description}</p>
            </div>
          )}

          <div>
            <p className="text-xs text-gray-400 mb-1">สถานะ</p>
            <span
              className={cn(
                'inline-flex px-2 py-0.5 rounded-full text-xs font-medium',
                isActive
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-500'
              )}
            >
              {isActive ? 'ใช้งาน' : 'ปิดใช้งาน'}
            </span>
          </div>

          <div className="pt-4 border-t border-gray-100 space-y-2">
            <div className="flex justify-between text-xs text-gray-400">
              <span>สร้างโดย</span>
              <span>{holiday.createdBy}</span>
            </div>
            <div className="flex justify-between text-xs text-gray-400">
              <span>สร้างเมื่อ</span>
              <span>
                {new Date(holiday.createdAt).toLocaleDateString('th-TH')}
              </span>
            </div>
            <div className="flex justify-between text-xs text-gray-400">
              <span>แก้ไขล่าสุด</span>
              <span>
                {new Date(holiday.updatedAt).toLocaleDateString('th-TH')}
              </span>
            </div>
          </div>
        </div>

        {canManage && (
          <>
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => onEdit?.(holiday)}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-xl transition-colors"
              >
                แก้ไข
              </button>
              <button
                onClick={() => onToggleActive?.(holiday)}
                className={cn(
                  'flex-1 text-sm font-medium py-2 rounded-xl transition-colors',
                  isActive
                    ? 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                    : 'bg-green-50 hover:bg-green-100 text-green-700'
                )}
              >
                {isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
              </button>
            </div>
            <button
              onClick={() => onRequestDelete?.(holiday)}
              className="w-full mt-2 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-medium py-2 rounded-xl transition-colors"
            >
              ลบถาวร
            </button>
          </>
        )}
      </div>
    </div>
  );
}
