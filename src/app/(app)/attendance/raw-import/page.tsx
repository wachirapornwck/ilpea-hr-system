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
} from 'lucide-react';

const HR_ROLES = ['admin', 'hr_manager'];

interface SampleRow {
  rowNumber: number;
  no: string;
  tmNo: string;
  enNo: string;
  rawName: string;
  gmNo: string;
  mode: string;
  dateTimeRaw: string;
}

interface PreviewResult {
  mode: 'preview';
  fileName: string;
  checksum: string;
  header: string[];
  parsedCount: number;
  errorCount: number;
  validation: {
    ok: boolean;
    blockingErrors: string[];
    warnings: string[];
  };
  sampleRows: SampleRow[];
  errors: { rowNumber: number; rawLine: string; message: string }[];
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

export default function RawImportPage() {
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
      const res = await fetch('/api/raw-import', {
        method: 'POST',
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || 'พรีวิวไม่สำเร็จ');
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
      const res = await fetch('/api/raw-import', {
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
        <PageHeader title="นำเข้าข้อมูลสแกนนิ้ว" />
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <ShieldAlert className="w-5 h-5 shrink-0" />
          เฉพาะ HR เท่านั้นที่เข้าถึงการนำเข้าข้อมูลสแกนนิ้วได้
        </div>
      </div>
    );
  }

  const canCommit =
    !!preview && preview.validation.ok && !committed && loading !== 'commit';

  return (
    <div>
      <PageHeader
        title="นำเข้าข้อมูลสแกนนิ้ว"
        subtitle="อัปโหลดไฟล์ export จากเครื่องสแกนนิ้ว (.csv) — ระบบเก็บข้อมูลดิบไว้เป็นหลักฐาน ยังไม่ประมวลผลเวลาเข้า-ออก"
      />

      {/* Upload card */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-6 py-10 text-center transition-colors hover:border-violet-400 hover:bg-violet-50/50 dark:border-slate-600 dark:hover:border-violet-500 dark:hover:bg-violet-950/20">
          <Upload className="h-8 w-8 text-slate-400" />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {file ? file.name : 'เลือกไฟล์ .csv จากเครื่องสแกนนิ้ว'}
          </span>
          <span className="text-xs text-slate-400">
            คอลัมน์: No | TMNo | EnNo | Name | GMNo | Mode | DateTime
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
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
          <span>{error}</span>
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
              label="แถวเสีย (format)"
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
                    <th className="py-1.5 pr-3 font-medium">No</th>
                    <th className="py-1.5 pr-3 font-medium">EnNo</th>
                    <th className="py-1.5 pr-3 font-medium">Mode</th>
                    <th className="py-1.5 pr-3 font-medium">DateTime</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.sampleRows.map((r) => (
                    <tr
                      key={r.rowNumber}
                      className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                    >
                      <td className="py-1.5 pr-3 text-slate-500">{r.no}</td>
                      <td className="py-1.5 pr-3 font-mono text-slate-700 dark:text-slate-200">
                        {r.enNo}
                      </td>
                      <td className="py-1.5 pr-3 text-slate-500">{r.mode}</td>
                      <td className="py-1.5 pr-3 font-mono text-slate-600 dark:text-slate-300">
                        {r.dateTimeRaw}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
