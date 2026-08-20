// =============================================================================
// src/app/api/attendance-import/route.ts
// -----------------------------------------------------------------------------
// HR Standard Attendance Import endpoint (HR-only, session-secured).
//
// รับไฟล์ standard template (EmployeeID | Date | Check in | Check out) CSV/XLSX
// แยกจาก scan-event endpoint (/api/raw-import) โดยสมบูรณ์
//
// Identity มาจาก session cookie ผ่าน getRequester() เท่านั้น — ไม่เชื่อ client
//   (role / userId / employeeId จาก client ไม่ถูกใช้ authorize)
//
// mode=preview : parse + validate แล้วคืนผล (ไม่เขียน Firestore)
// mode=commit  : ถ้า validation ผ่าน -> persistAttendanceImport (immutable)
//
// C1 boundary: parse/validate/persist = format เท่านั้น — ไม่ map/late/shift/status
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { getRequester } from '@/lib/auth/getRequester';
import { computeChecksum } from '@/lib/rawImport/parser';
import { parseAttendanceImport } from '@/lib/rawImport/attendanceParser';
import { validateAttendanceParse } from '@/lib/rawImport/attendanceValidation';
import { persistAttendanceImport } from '@/lib/rawImport/attendancePersistence';
import { REQUIRED_ATTENDANCE_HEADERS } from '@/lib/rawImport/attendanceImportTypes';

export const dynamic = 'force-dynamic';

const ALLOWED_HR_ROLES = ['admin', 'hr_manager'];

export async function POST(req: NextRequest) {
  // ---- 1) identity จาก session (ไม่เชื่อ client) ----
  const auth = await getRequester(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'unauthorized', reason: auth.reason },
      { status: auth.status }
    );
  }
  if (!ALLOWED_HR_ROLES.includes(auth.requester.role)) {
    return NextResponse.json({ error: 'forbidden: HR only' }, { status: 403 });
  }

  // ---- 2) อ่านไฟล์จาก multipart form ----
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'invalid form data' }, { status: 400 });
  }

  const file = form.get('file');
  const mode = (form.get('mode') as string) || 'preview';
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  // ---- 3) parse (format error = throw) + validate + checksum ----
  let parsed;
  try {
    parsed = await parseAttendanceImport(file.name, bytes);
  } catch (e) {
    return NextResponse.json(
      {
        error: 'parse failed',
        message: (e as Error).message,
        requiredColumns: REQUIRED_ATTENDANCE_HEADERS,
      },
      { status: 400 }
    );
  }

  const validation = validateAttendanceParse(parsed);
  const checksum = await computeChecksum(bytes);

  const preview = {
    fileName: file.name,
    checksum,
    header: parsed.header,
    requiredColumns: REQUIRED_ATTENDANCE_HEADERS,
    parsedCount: parsed.rows.length,
    errorCount: validation.rowErrors.length,
    validation,
    sampleRows: parsed.rows.slice(0, 5),
    rowErrors: validation.rowErrors.slice(0, 20),
  };

  // ---- 4) preview mode: ไม่เขียน ----
  if (mode !== 'commit') {
    return NextResponse.json({ mode: 'preview', ...preview });
  }

  // ---- 5) commit mode: format ต้องผ่านก่อน ----
  if (!validation.ok) {
    return NextResponse.json(
      { error: 'cannot commit', ...preview },
      { status: 400 }
    );
  }

  // เขียนเฉพาะแถวที่ผ่าน validation (row error ถูกข้าม — นับใน errorCount)
  const validRowNumbers = new Set(validation.rowErrors.map((e) => e.rowNumber));
  const rowsToPersist = parsed.rows.filter(
    (r) => !validRowNumbers.has(r.rowNumber)
  );

  try {
    const batch = await persistAttendanceImport({
      fileName: file.name,
      fileChecksum: checksum,
      importedBy: auth.requester.id, // จาก session
      rows: rowsToPersist,
      errorCount: validation.rowErrors.length,
    });
    return NextResponse.json({ mode: 'commit', ok: true, batch, preview });
  } catch (e) {
    // batchId = checksum ซ้ำ -> ไฟล์นี้ถูก import ไปแล้ว
    return NextResponse.json(
      { error: 'commit failed', message: (e as Error).message },
      { status: 409 }
    );
  }
}
