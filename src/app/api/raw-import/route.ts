// =============================================================================
// src/app/api/raw-import/route.ts
// -----------------------------------------------------------------------------
// Raw Fingerprint Import endpoint (HR-only, session-secured).
//
// Identity มาจาก session cookie ผ่าน getRequester() เท่านั้น — ไม่รับ requesterId/
// userId จาก client (เป็น endpoint ใหม่ที่ทำถูกตั้งแต่แรก ไม่สืบทอดหนี้ security เดิม)
//
// mode=preview : parse + validate แล้วคืนผล (ไม่เขียน Firestore)
// mode=commit  : ถ้า format ผ่าน -> persistRawImport (immutable)
//
// parse ผ่าน parseImportFile(fileName, bytes): รองรับ fingerprint quoted-tab /
//   CSV มาตรฐาน / xlsx (dispatch ตามชื่อไฟล์ + magic bytes ภายใน parser)
// ยึด C1: parser/validation/persist ไม่มี business logic (ไม่ map/late/shift/status)
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { getRequester } from '@/lib/auth/getRequester';
import { parseImportFile, computeChecksum } from '@/lib/rawImport/parser';
import { validateParseResult } from '@/lib/rawImport/validation';
import { persistRawImport } from '@/lib/rawImport/persistence';

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
  // parseImportFile รับ bytes ดิบ + ชื่อไฟล์ แล้ว dispatch เอง (quoted-tab / csv / xlsx)
  // ห้าม decode เป็น text ที่นี่ — xlsx เป็น binary จะพังถ้าถูก decode
  let parsed;
  try {
    parsed = await parseImportFile(file.name, bytes);
  } catch (e) {
    return NextResponse.json(
      { error: 'parse failed', message: (e as Error).message },
      { status: 400 }
    );
  }

  const validation = validateParseResult(parsed);
  const checksum = await computeChecksum(bytes);

  const preview = {
    fileName: file.name,
    checksum,
    header: parsed.header,
    parsedCount: parsed.rows.length,
    errorCount: parsed.errors.length,
    validation,
    sampleRows: parsed.rows.slice(0, 5),
    errors: parsed.errors.slice(0, 20),
  };

  // ---- 4) preview mode: ไม่เขียน ----
  if (mode !== 'commit') {
    return NextResponse.json({ mode: 'preview', ...preview });
  }

  // ---- 5) commit mode: format ต้องผ่าน ----
  if (!validation.ok) {
    return NextResponse.json(
      { error: 'cannot commit', ...preview },
      { status: 400 }
    );
  }

  try {
    const batch = await persistRawImport({
      fileName: file.name,
      fileChecksum: checksum,
      importedBy: auth.requester.id, // จาก session
      rows: parsed.rows,
      errorCount: parsed.errors.length,
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
