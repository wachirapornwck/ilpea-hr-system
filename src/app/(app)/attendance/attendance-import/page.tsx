'use client';

import { useState, useRef, useCallback } from 'react';
import PageHeader from '@/components/layout/PageHeader';
import { useAuth } from '@/lib/auth/context';
import { cn } from '@/lib/utils';
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ShieldAlert,
  Table,
} from 'lucide-react';

const HR_ROLES = ['admin', 'hr_manager'];

const REQUIRED_COLUMNS = ['EmployeeID', 'Date', 'Check in', 'Check out'];

interface SampleRow {
  rowNumber: number;
  employeeId: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
}

interface RowError {
  rowNumber: number;
  rawLine: string;
  message: string;
}

interface PreviewResult {
  mode: 'preview';
  fileName: string;
  checksum: string;
  header: string[];
  requiredColumns: string[];
  parsedCount: number;
  errorCount: number;
  validation: {
    ok: boolean;
    blockingErrors: string[];
    warnings: string[];
  };
  sampleRows: SampleRow[];
  rowErrors: RowError[];
}

interface CommitResult {
  ok: true;
  batch: {
    id: string;
    status: string;
    parsedCount: number;
    errorCount: number;
  };
}

export default function AttendanceImportPage() {
  const { user } = useAuth();
  const isHR = !!user && HR_ROLES.includes(user.role);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [committed, setCommitted] = useState<CommitResult | null>(null);
  const [loading, setLoading] = useState<'preview' | 'commit' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setCommitted(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const runPreview = useCallback(async (f: File) => {
    setLoading('preview');
    setError(null);
    setPreview(null);
    setCommitted(null);
    try {
      const form = new FormData();
      form.append('file', f);
      form.append('mode', 'preview');
      const res = await fetch('/api/attendance-import', {
        method: 'POST',
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.message ||
            data.error ||
            'อ่านไฟล์ไม่สำเร็จ (ไฟล์อาจไม่ตรง template)'
        );
        return;
      }
      setPreview(data as PreviewResult);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  }, []);

  const onSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setCommitted(null);
    if (f) runPreview(f);
  };

  const runCommit = async () => {
    if (!file) return;
    setLoading('commit');
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('mode', 'commit');
      const res = await fetch('/api/attendance-import', {
        method: 'POST',
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          res.status === 409
            ? 'ไฟล์นี้ถูกนำเข้าไปแล้ว (raw ห้ามเขียนทับ)'
            : data.message || data.error || 'นำเข้าไม่สำเร็จ'
        );
        return;
      }
      setCommitted(data as CommitResult);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  };

  if (!isHR) {
    return (
      <div>
        <PageHeader title="นำเข้าข้อมูลลงเวลา (Attendance Import)" />
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <ShieldAlert className="w-5 h-5 shrink-0" />
          เฉพาะ HR เท่านั้นที่เข้าถึงการนำเข้าข้อมูลลงเวลาได้
        </div>
      </div>
    );
  }

  const canCommit =
    !!preview && preview.validation.ok && !committed && loading !== 'commit';

  return (
    <div>
      <PageHeader
        title="นำเข้าข้อมูลลงเวลา (Attendance Import)"
        subtitle="อัปโหลดไฟล์ที่ HR เตรียมตาม template (.csv / .xlsx) — ระบบเก็บข้อมูลดิบไว้เป็นหลักฐาน ยังไม่ประมวลผลสาย/กะ/OT"
      />

      {/* Template guide */}
      <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50/60 p-4 dark:border-violet-900 dark:bg-violet-950/30">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-violet-800 dark:text-violet-300">
          <Table className="h-4 w-4" />
          รูปแบบไฟล์ที่รองรับ: CSV / XLSX — ต้องมีคอลัมน์ตาม template
          นี้เท่านั้น
        </div>
        <div className="overflow-x-auto">
          <table className="text-left text-sm">
            <thead>
              <tr className="text-xs text-violet-500 dark:text-violet-400">
                {REQUIRED_COLUMNS.map((c) => (
                  <th key={c} className="px-3 py-1 font-semibold">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono text-slate-600 dark:text-slate-300">
              <tr>
                <td className="px-3 py-0.5">100001</td>
                <td className="px-3 py-0.5">2026-08-20</td>
                <td className="px-3 py-0.5">07:29</td>
                <td className="px-3 py-0.5">16:35</td>
              </tr>
              <tr>
                <td className="px-3 py-0.5">100002</td>
                <td className="px-3 py-0.5">2026-08-20</td>
                <td className="px-3 py-0.5">07:31</td>
                <td className="px-3 py-0.5">16:40</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-violet-600/80 dark:text-violet-400/80">
          EmployeeID ที่มี 0 นำหน้า (เช่น 000123) ให้จัดรูปแบบเซลล์เป็น Text
          ก่อนบันทึกไฟล์ เพื่อไม่ให้ 0 หาย
        </p>
      </div>

      {/* Upload card */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-6 py-10 text-center transition-colors hover:border-violet-400 hover:bg-violet-50/50 dark:border-slate-600 dark:hover:border-violet-500 dark:hover:bg-violet-950/20">
          <Upload className="h-8 w-8 text-slate-400" />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {file ? file.name : 'เลือกไฟล์ .csv / .xlsx ตาม template'}
          </span>
          <span className="text-xs text-slate-400">
            คอลัมน์ที่ต้องมี: {REQUIRED_COLUMNS.join(' | ')}
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={onSelectFile}
          />
        </label>

        {file && (
          <button
            onClick={reset}
            className="mt-3 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          >
            ล้าง / เลือกไฟล์ใหม่
          </button>
        )}
      </div>

      {/* Loading (preview) */}
      {loading === 'preview' && (
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> กำลังอ่านไฟล์…
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <div>{error}</div>
            <div className="mt-1 text-xs text-rose-500">
              ต้องมีคอลัมน์: {REQUIRED_COLUMNS.join(' | ')}
            </div>
          </div>
        </div>
      )}

      {/* Committed success */}
      {committed && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900 dark:bg-emerald-950/40">
          <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-medium">นำเข้าสำเร็จ</span>
          </div>
          <div className="mt-2 text-sm text-emerald-700 dark:text-emerald-300/90">
            บันทึก {committed.batch.parsedCount} แถว (status:{' '}
            {committed.batch.status}) · batch{' '}
            <code className="rounded bg-emerald-100 px-1 dark:bg-emerald-900/60">
              {committed.batch.id.slice(0, 12)}…
            </code>
          </div>
          <button
            onClick={reset}
            className="mt-3 rounded-lg border border-emerald-300 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
          >
            นำเข้าไฟล์ถัดไป
          </button>
        </div>
      )}

      {/* Preview */}
      {preview && !committed && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            <FileText className="h-4 w-4 text-violet-600" />
            {preview.fileName}
          </div>

          {/* stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="แถวที่อ่านได้" value={preview.parsedCount} tone="ok" />
            <Stat
              label="แถวถูกข้าม"
              value={preview.errorCount}
              tone={preview.errorCount > 0 ? 'warn' : 'muted'}
            />
            <Stat
              label="สถานะไฟล์"
              value={preview.validation.ok ? 'พร้อมนำเข้า' : 'นำเข้าไม่ได้'}
              tone={preview.validation.ok ? 'ok' : 'block'}
            />
          </div>

          {/* blocking / warnings */}
          {preview.validation.blockingErrors.map((m, i) => (
            <p
              key={`b-${i}`}
              className="mt-3 text-sm text-rose-600 dark:text-rose-400"
            >
              • {m}
            </p>
          ))}
          {preview.validation.warnings.map((m, i) => (
            <p
              key={`w-${i}`}
              className="mt-3 text-sm text-amber-600 dark:text-amber-400"
            >
              • {m}
            </p>
          ))}

          {/* sample table */}
          {preview.sampleRows.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <p className="mb-2 text-xs text-slate-400">
                ตัวอย่าง {preview.sampleRows.length} แถวแรก (ข้อมูลดิบ)
              </p>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-400 dark:border-slate-700">
                    <th className="py-1.5 pr-3 font-medium">EmployeeID</th>
                    <th className="py-1.5 pr-3 font-medium">Date</th>
                    <th className="py-1.5 pr-3 font-medium">Check in</th>
                    <th className="py-1.5 pr-3 font-medium">Check out</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.sampleRows.map((r) => (
                    <tr
                      key={r.rowNumber}
                      className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                    >
                      <td className="py-1.5 pr-3 font-mono text-slate-700 dark:text-slate-200">
                        {r.employeeId}
                      </td>
                      <td className="py-1.5 pr-3 font-mono text-slate-600 dark:text-slate-300">
                        {r.date}
                      </td>
                      <td className="py-1.5 pr-3 font-mono text-slate-600 dark:text-slate-300">
                        {r.checkIn ?? '—'}
                      </td>
                      <td className="py-1.5 pr-3 font-mono text-slate-600 dark:text-slate-300">
                        {r.checkOut ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* row errors */}
          {preview.rowErrors.length > 0 && (
            <div className="mt-4">
              <p className="mb-1 text-xs text-slate-400">
                แถวที่ถูกข้าม (สูงสุด 20 รายการ)
              </p>
              <ul className="space-y-0.5 text-xs text-rose-600 dark:text-rose-400">
                {preview.rowErrors.map((e) => (
                  <li key={e.rowNumber}>
                    แถว {e.rowNumber}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* commit button */}
          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={runCommit}
              disabled={!canCommit}
              className={cn(
                'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors',
                canCommit
                  ? 'bg-violet-600 shadow-violet-200 hover:bg-violet-700'
                  : 'cursor-not-allowed bg-slate-300 dark:bg-slate-700'
              )}
            >
              {loading === 'commit' && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              นำเข้าข้อมูล
            </button>
            {!preview.validation.ok && (
              <span className="text-xs text-slate-400">
                ไฟล์นี้นำเข้าไม่ได้ (ดูสาเหตุด้านบน)
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: 'ok' | 'warn' | 'block' | 'muted';
}) {
  const toneCls = {
    ok: 'text-emerald-600 dark:text-emerald-400',
    warn: 'text-amber-600 dark:text-amber-400',
    block: 'text-rose-600 dark:text-rose-400',
    muted: 'text-slate-500 dark:text-slate-400',
  }[tone];
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={cn('mt-0.5 text-lg font-semibold', toneCls)}>{value}</div>
    </div>
  );
}
