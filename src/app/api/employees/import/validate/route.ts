// =============================================================================
// src/app/api/employees/import/validate/route.ts
// =============================================================================
// POST /api/employees/import/validate
//
// PURPOSE
// -----------------------------------------------------------------------------
// Dry-run validation for Employee Import. Takes the parsed spreadsheet
// (headers + rows) and reports exactly what WOULD happen, without writing
// anything. This endpoint is strictly READ-ONLY — it performs no Firestore
// writes, no batch operations, and no employee creation.
//
// WHY A SEPARATE ENDPOINT (Phase 6-2 architecture decision #2)
// -----------------------------------------------------------------------------
// Validate and Commit are two distinct endpoints, deliberately NOT one
// endpoint switched by a `mode` parameter. A read-only path that cannot
// write — because it contains no write code at all — is far easier to
// reason about than one guarded by a flag that could be mis-set.
//
// SERVER NEVER TRUSTS THE CLIENT (Phase 6-2 decision #6)
// -----------------------------------------------------------------------------
// The client runs the same validation for live preview, but its result is
// never accepted as input here. This endpoint re-runs the full shared
// validation from scratch against freshly loaded master data. The client
// sends raw cells only.
//
// DUPLICATE CHECK (Phase 6-2 decision #1)
// -----------------------------------------------------------------------------
// Duplicates are resolved with a direct doc(employeeId).get() per row —
// never by loading the whole users collection and never via GET /employees
// with its PAGE_SIZE. The employee document id IS the uppercased employeeId
// (see POST /api/employees, which uses `docId = empIdUpper`), so an existence
// check is an exact document read.
//
// Follows existing project conventions: inline auth via requesterId, HR-only
// gate matching POST /api/employees, {success,data}/{success,error} response
// shape, and `export const dynamic = 'force-dynamic'`.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { validateImportData } from '@/lib/employees/importValidation';
import { IMPORT_TEMPLATE_FIELDS } from '@/lib/employees/importConstants';
import type {
  ImportRowValidation,
  ImportNormalizedRow,
} from '@/lib/employees/importTypes';
import type { Department, Position } from '@/types';

export const dynamic = 'force-dynamic';

const ALLOWED_HR_ROLES = ['admin', 'hr_manager'];

// Upper bound on rows accepted in a single request. Each row costs one
// Firestore document read for the duplicate check, so an unbounded file
// would mean an unbounded number of sequential REST calls.
const MAX_IMPORT_ROWS = 500;

// Duplicate-check concurrency. The Firestore REST wrapper issues one HTTP
// request per get(), so reads are chunked: Promise.allSettled within a
// chunk, chunks awaited sequentially. Same shape as the bulk PIN reset
// already used on the employees page.
const DUPLICATE_CHECK_CHUNK_SIZE = 10;

interface ValidateRequestBody {
  requesterId?: string;
  headers?: unknown;
  rows?: unknown;
}

interface ValidateResponseRow {
  rowNumber: number; // 1-based index within the submitted rows
  employeeId: string; // uppercased; '' when the cell was blank
  status: ImportRowValidation['status'];
  errors: string[];
  warnings: string[];
  isDuplicate: boolean;
  normalized: ImportNormalizedRow;
}

function errorResponse(
  code: string,
  message: string,
  status: number
): NextResponse {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status }
  );
}

/** Splits an array into fixed-size chunks for controlled concurrency. */
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/** Narrows unknown JSON to string[][], rejecting ragged/non-string input. */
function isStringMatrix(value: unknown): value is string[][] {
  return (
    Array.isArray(value) &&
    value.every(
      (row) => Array.isArray(row) && row.every((c) => typeof c === 'string')
    )
  );
}

export async function POST(req: NextRequest) {
  try {
    let body: ValidateRequestBody;
    try {
      body = (await req.json()) as ValidateRequestBody;
    } catch {
      return errorResponse(
        'INVALID_JSON',
        'Request body is not valid JSON',
        400
      );
    }

    const requesterId = body.requesterId ?? '';
    if (!requesterId) {
      return errorResponse('MISSING_REQUESTER', 'Missing requesterId', 400);
    }

    // ── Authentication / authorization ──────────────────────────────────
    // Import creates employee records, so this is gated to the same roles
    // as POST /api/employees rather than to any authenticated user.
    const requesterDoc = await adminDb
      .collection('users')
      .doc(requesterId)
      .get();
    if (!requesterDoc.exists) {
      return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);
    }
    const requester = requesterDoc.data() as Record<string, any> | null;
    if (!ALLOWED_HR_ROLES.includes(requester?.role)) {
      return errorResponse('FORBIDDEN', 'ไม่มีสิทธิ์นำเข้าข้อมูลพนักงาน', 403);
    }

    // ── Payload shape ───────────────────────────────────────────────────
    const { headers, rows } = body;
    if (
      !Array.isArray(headers) ||
      !headers.every((h) => typeof h === 'string')
    ) {
      return errorResponse(
        'INVALID_PAYLOAD',
        'headers must be an array of strings',
        400
      );
    }
    if (!isStringMatrix(rows)) {
      return errorResponse(
        'INVALID_PAYLOAD',
        'rows must be an array of string arrays',
        400
      );
    }
    if (rows.length > MAX_IMPORT_ROWS) {
      return errorResponse(
        'TOO_MANY_ROWS',
        `นำเข้าได้สูงสุด ${MAX_IMPORT_ROWS} แถวต่อครั้ง (พบ ${rows.length} แถว)`,
        400
      );
    }

    // ── Master data ─────────────────────────────────────────────────────
    // Loaded fresh on every call so validation reflects current master
    // data rather than whatever the client happened to have cached.
    // `active=true` on positions mirrors what the Import preview requests,
    // keeping client preview and server validation consistent.
    const [deptSnap, posSnap] = await Promise.all([
      adminDb.collection('departments').limit(500).get(),
      adminDb.collection('positions').limit(500).get(),
    ]);

    const departments = deptSnap.docs.map(
      (doc: { id: string; data: () => Record<string, any> }) =>
        ({ id: doc.id, ...doc.data() } as Department)
    );
    const positions = posSnap.docs
      .map(
        (doc: { id: string; data: () => Record<string, any> }) =>
          ({ id: doc.id, ...doc.data() } as Position)
      )
      .filter((p: Position) => p.active === true);

    // ── Shared validation ───────────────────────────────────────────────
    // The single implementation used by the client preview. The trailing
    // `employees` argument is the legacy client-side duplicate check; it is
    // passed an empty array here because duplicates are resolved
    // authoritatively below via per-document Firestore reads. Passing []
    // means that legacy check contributes no warnings on this path.
    const result = validateImportData(
      headers,
      rows,
      departments,
      positions,
      []
    );

    if (result.headerErrors.length > 0) {
      return NextResponse.json({
        success: true,
        data: {
          headerErrors: result.headerErrors,
          rows: [],
          summary: { valid: 0, warning: 0, error: 0, duplicate: 0 },
          totalRows: rows.length,
          canImport: false,
        },
      });
    }

    // ── Duplicate employeeId against Firestore ──────────────────────────
    // One exact document read per row. No collection scan, no PAGE_SIZE
    // dependency. The document id is the uppercased employeeId.
    const employeeIdColumn = headers.indexOf(
      IMPORT_TEMPLATE_FIELDS.find((f) => f.key === 'employeeId')!.label
    );
    const employeeIds = rows.map((row) =>
      employeeIdColumn >= 0
        ? (row[employeeIdColumn] ?? '').trim().toUpperCase()
        : ''
    );

    // Read each distinct id once — a file may legitimately repeat an id,
    // and that in-file duplication is already flagged by the shared
    // validation. Deduplicating here avoids paying for the same read twice.
    const uniqueIds = Array.from(
      new Set(employeeIds.filter((id) => id !== ''))
    );
    const existsById = new Map<string, boolean>();
    // Ids whose existence could not be determined. Treating a failed read as
    // "not a duplicate" would be unsafe — commit could then attempt to write
    // over a real employee. These rows are hard-errored instead.
    const unresolvedIds = new Set<string>();

    for (const idChunk of chunk(uniqueIds, DUPLICATE_CHECK_CHUNK_SIZE)) {
      const settled = await Promise.allSettled(
        idChunk.map(async (id) => {
          const doc = await adminDb.collection('users').doc(id).get();
          return { id, exists: doc.exists };
        })
      );
      // allSettled preserves input order, so index i maps to idChunk[i].
      for (let i = 0; i < settled.length; i++) {
        const outcome = settled[i];
        if (outcome.status === 'fulfilled') {
          existsById.set(outcome.value.id, outcome.value.exists);
        } else {
          unresolvedIds.add(idChunk[i]);
          console.error(
            'POST /api/employees/import/validate duplicate check failed for ' +
              idChunk[i] +
              ':',
            outcome.reason
          );
        }
      }
    }

    // ── Merge validation + duplicate results ────────────────────────────
    let duplicateCount = 0;
    const responseRows: ValidateResponseRow[] = result.rows.map(
      (rowResult, index) => {
        const employeeId = employeeIds[index];
        const isDuplicate =
          employeeId !== '' && existsById.get(employeeId) === true;

        const errors = [...rowResult.errors];
        const warnings = [...rowResult.warnings];

        if (employeeId !== '' && unresolvedIds.has(employeeId)) {
          errors.push(
            `ตรวจสอบรหัสพนักงาน ${employeeId} ในระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง`
          );
        }

        if (isDuplicate) {
          duplicateCount++;
          // Reported as a warning, not an error: a duplicate row is skipped
          // at commit time, not rejected. The import as a whole is still
          // allowed to proceed — that is what makes re-running the same
          // file idempotent (Created: 0, Skipped: existing).
          warnings.push(
            `รหัสพนักงาน ${employeeId} มีอยู่ในระบบแล้ว — แถวนี้จะถูกข้าม ไม่เขียนทับข้อมูลเดิม`
          );
        }

        const status: ImportRowValidation['status'] =
          errors.length > 0
            ? 'error'
            : warnings.length > 0
            ? 'warning'
            : 'valid';

        return {
          rowNumber: index + 1,
          employeeId,
          status,
          errors,
          warnings,
          isDuplicate,
          normalized: result.normalized[index],
        };
      }
    );

    const summary = responseRows.reduce(
      (acc, r) => {
        acc[r.status]++;
        return acc;
      },
      { valid: 0, warning: 0, error: 0 }
    );

    // Rows that would actually be created: no errors, not already present.
    const willCreate = responseRows.filter(
      (r) => r.status !== 'error' && !r.isDuplicate
    ).length;

    return NextResponse.json({
      success: true,
      data: {
        headerErrors: [],
        rows: responseRows,
        summary: { ...summary, duplicate: duplicateCount },
        totalRows: rows.length,
        willCreate,
        // Nothing to do is not the same as unable to proceed, but both mean
        // the Import button should stay disabled.
        canImport: summary.error === 0 && willCreate > 0,
      },
    });
  } catch (error: any) {
    console.error('POST /api/employees/import/validate error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message },
      },
      { status: 500 }
    );
  }
}
