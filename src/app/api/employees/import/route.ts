// =============================================================================
// src/app/api/employees/import/route.ts
// =============================================================================
// POST /api/employees/import
//
// PURPOSE
// -----------------------------------------------------------------------------
// Commit endpoint for Employee Import. Creates employee documents for rows
// that pass validation and do not already exist. Separate from the dry-run
// endpoint at /api/employees/import/validate (Phase 6-2 decision #2) — two
// endpoints, never one switched by a `mode` flag.
//
// IDEMPOTENCY (Phase 6-2 decision #1)
// -----------------------------------------------------------------------------
// Existence is checked per row with doc(employeeId).get() immediately before
// writing. An existing document is SKIPPED, never overwritten. Running the
// same file twice therefore yields:
//     first run  -> created: N, skipped: 0
//     second run -> created: 0, skipped: N
// This matters especially here: the adminDb REST wrapper implements set() as
// an HTTP PATCH, so writing without checking first would silently merge into
// a real employee record.
//
// NOT ATOMIC, BY DESIGN (Phase 6-2 decision #7)
// -----------------------------------------------------------------------------
// adminDb.batch() is a sequential loop of individual REST calls, not a real
// Firestore batch — it provides no atomicity. Rather than imply a guarantee
// that does not exist, this endpoint processes rows in chunks
// (Promise.allSettled within a chunk, chunks awaited sequentially) and
// reports per-row outcomes. A partial failure is safe to retry precisely
// because the operation is idempotent.
//
// SERVER NEVER TRUSTS THE CLIENT (Phase 6-2 decision #6)
// -----------------------------------------------------------------------------
// Full validation is re-run here from scratch against freshly loaded master
// data. A prior successful call to the validate endpoint is not accepted as
// evidence of anything — master data may have changed in between, and the
// client controls the payload either way.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { adminDb } from '@/lib/firebase/admin';
import { validateImportData } from '@/lib/employees/importValidation';
import {
  IMPORT_TEMPLATE_FIELDS,
  computeBirthdayPin,
  normalizeRole,
  normalizeGender,
  normalizeEmploymentStatus,
  normalizeTitlePrefix,
} from '@/lib/employees/importConstants';
import type { Department, Position } from '@/types';

export const dynamic = 'force-dynamic';

const ALLOWED_HR_ROLES = ['admin', 'hr_manager'];

// Matches the validate endpoint so a file that passes validation is always
// accepted for commit.
const MAX_IMPORT_ROWS = 500;

// Each row costs one get() plus one set(), both individual HTTP requests
// through the REST wrapper. Smaller than the validate endpoint's read-only
// chunk for that reason.
const CHUNK_SIZE = 5;

const BCRYPT_ROUNDS = 10;

type RowOutcome = 'created' | 'skipped' | 'failed';

interface ImportResultRow {
  rowNumber: number; // 1-based index within the submitted rows
  employeeId: string;
  outcome: RowOutcome;
  reason?: string;
}

interface ImportRequestBody {
  requesterId?: string;
  headers?: unknown;
  rows?: unknown;
}

function errorResponse(
  code: string,
  message: string,
  status: number,
  extra?: Record<string, unknown>
): NextResponse {
  return NextResponse.json(
    { success: false, error: { code, message }, ...(extra ?? {}) },
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

/** Narrows unknown JSON to string[][]. */
function isStringMatrix(value: unknown): value is string[][] {
  return (
    Array.isArray(value) &&
    value.every(
      (row) => Array.isArray(row) && row.every((c) => typeof c === 'string')
    )
  );
}

/** Optional free-text field: '' is stored as null, matching POST /api/employees. */
function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export async function POST(req: NextRequest) {
  try {
    let body: ImportRequestBody;
    try {
      body = (await req.json()) as ImportRequestBody;
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
    if (rows.length === 0) {
      return errorResponse('EMPTY_PAYLOAD', 'ไม่มีข้อมูลให้นำเข้า', 400);
    }
    if (rows.length > MAX_IMPORT_ROWS) {
      return errorResponse(
        'TOO_MANY_ROWS',
        `นำเข้าได้สูงสุด ${MAX_IMPORT_ROWS} แถวต่อครั้ง (พบ ${rows.length} แถว)`,
        400
      );
    }

    // ── Master data ─────────────────────────────────────────────────────
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

    // ── Re-validate everything server-side ──────────────────────────────
    const validation = validateImportData(
      headers,
      rows,
      departments,
      positions,
      []
    );

    if (validation.headerErrors.length > 0) {
      return errorResponse('HEADER_ERRORS', 'ไฟล์ไม่ตรงกับ Template', 400, {
        headerErrors: validation.headerErrors,
      });
    }

    // Abort the entire commit if ANY row has a validation error. Nothing is
    // written — a partially-valid file is rejected as a whole so the user
    // fixes it once rather than reconciling a split result.
    const invalidRows = validation.rows
      .map((r, i) => ({ rowNumber: i + 1, errors: r.errors }))
      .filter((r) => r.errors.length > 0);

    if (invalidRows.length > 0) {
      return errorResponse(
        'VALIDATION_FAILED',
        `พบข้อมูลไม่ถูกต้อง ${invalidRows.length} แถว — ไม่ได้นำเข้าข้อมูลใดๆ`,
        400,
        { invalidRows }
      );
    }

    // ── Column resolution ───────────────────────────────────────────────
    const colIndex: Record<string, number> = {};
    IMPORT_TEMPLATE_FIELDS.forEach((f) => {
      colIndex[f.key] = headers.indexOf(f.label);
    });
    const cell = (row: string[], key: string): string =>
      (row[colIndex[key]] ?? '').trim();

    // Name -> record lookups. Position names are not unique system-wide
    // (uniqueness is enforced on `code`), so positions are keyed by
    // departmentId + name, matching how validation cross-checks them.
    const deptByName = new Map<string, Department>();
    departments.forEach((d) => deptByName.set(d.name.trim(), d));

    const posByDeptAndName = new Map<string, Position>();
    positions.forEach((p) => {
      posByDeptAndName.set(`${p.departmentId}\u0000${p.name.trim()}`, p);
    });

    // ── Commit in sequential chunks ─────────────────────────────────────
    const indexed = rows.map((row, index) => ({ row, index }));
    const results: ImportResultRow[] = new Array(rows.length);

    for (const group of chunk(indexed, CHUNK_SIZE)) {
      const settled = await Promise.allSettled(
        group.map(async ({ row, index }): Promise<ImportResultRow> => {
          const rowNumber = index + 1;
          const employeeId = cell(row, 'employeeId').toUpperCase();

          // Existence check immediately before the write. Never overwrite.
          const existing = await adminDb
            .collection('users')
            .doc(employeeId)
            .get();
          if (existing.exists) {
            return {
              rowNumber,
              employeeId,
              outcome: 'skipped',
              reason:
                'มีรหัสพนักงานนี้ในระบบแล้ว — ข้ามแถวนี้ ไม่เขียนทับข้อมูลเดิม',
            };
          }

          // PIN comes only from dateOfBirth. Validation guarantees a value
          // is present and is a real calendar date, so a null here would
          // mean the two have drifted apart — fail loudly rather than
          // invent a PIN.
          const dateOfBirth = cell(row, 'dateOfBirth');
          const pin = computeBirthdayPin(dateOfBirth);
          if (!pin) {
            return {
              rowNumber,
              employeeId,
              outcome: 'failed',
              reason: 'สร้าง PIN จากวันเดือนปีเกิดไม่สำเร็จ',
            };
          }

          const departmentName = cell(row, 'department');
          const positionName = cell(row, 'position');
          const dept = deptByName.get(departmentName);
          const pos = dept
            ? posByDeptAndName.get(`${dept.id}\u0000${positionName}`)
            : undefined;
          if (!dept || !pos) {
            return {
              rowNumber,
              employeeId,
              outcome: 'failed',
              reason: 'ไม่พบแผนกหรือตำแหน่งในระบบ',
            };
          }

          const normalized = validation.normalized[index];
          const titlePrefixRaw = cell(row, 'titlePrefix');
          const titlePrefix = titlePrefixRaw
            ? normalizeTitlePrefix(titlePrefixRaw)
            : '';
          const pinHash = await bcrypt.hash(pin, BCRYPT_ROUNDS);
          const now = new Date();

          // Document shape mirrors POST /api/employees exactly, with two
          // deliberate differences, both approved:
          //   - employmentStatus comes from the file, not hardcoded 'active'
          //   - probationEndDate is written (the legacy endpoint omits it)
          await adminDb
            .collection('users')
            .doc(employeeId)
            .set({
              employeeId,
              firstNameEN: cell(row, 'firstNameEN'),
              lastNameEN: cell(row, 'lastNameEN'),
              firstNameTH: cell(row, 'firstNameTH'),
              lastNameTH: cell(row, 'lastNameTH'),
              nickname: orNull(cell(row, 'nickname')),
              gender: normalizeGender(cell(row, 'gender')),
              role: normalizeRole(cell(row, 'role')),
              employeeType: normalized.employeeType,
              employmentStatus: normalizeEmploymentStatus(
                cell(row, 'employmentStatus')
              ),
              positionId: pos.id,
              positionName: pos.name,
              departmentId: dept.id,
              departmentName: dept.name,
              shiftId: normalized.shiftId,
              startDate: orNull(cell(row, 'startDate')),
              phone: orNull(cell(row, 'phone')),
              lineId: null,
              address: orNull(cell(row, 'address')),
              emergencyContactName: orNull(cell(row, 'emergencyContactName')),
              emergencyContactPhone: orNull(cell(row, 'emergencyContactPhone')),
              emergencyContactRelation: orNull(
                cell(row, 'emergencyContactRelation')
              ),
              dateOfBirth,
              titlePrefix: titlePrefix || null,
              titlePrefixOther: titlePrefix === 'other' ? titlePrefixRaw : null,
              probationEndDate: orNull(cell(row, 'probationEndDate')),
              terminationDate: orNull(cell(row, 'terminationDate')),
              hrRemark: orNull(cell(row, 'hrRemark')),
              profileImage: null,
              salary: null,
              pinHash,
              mustChangePIN: true,
              createdAt: now,
              updatedAt: now,
            });

          return { rowNumber, employeeId, outcome: 'created' };
        })
      );

      for (let i = 0; i < settled.length; i++) {
        const outcome = settled[i];
        const { row, index } = group[i];
        if (outcome.status === 'fulfilled') {
          results[index] = outcome.value;
        } else {
          const employeeId = cell(row, 'employeeId').toUpperCase();
          console.error(
            'POST /api/employees/import row ' + (index + 1) + ' failed:',
            outcome.reason
          );
          results[index] = {
            rowNumber: index + 1,
            employeeId,
            outcome: 'failed',
            reason:
              outcome.reason instanceof Error
                ? outcome.reason.message
                : 'เกิดข้อผิดพลาดระหว่างบันทึกข้อมูล',
          };
        }
      }
    }

    const summary = results.reduce(
      (acc, r) => {
        acc[r.outcome]++;
        return acc;
      },
      { created: 0, skipped: 0, failed: 0 }
    );

    return NextResponse.json({
      success: true,
      data: {
        summary,
        totalRows: rows.length,
        rows: results,
      },
    });
  } catch (error: any) {
    console.error('POST /api/employees/import error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message },
      },
      { status: 500 }
    );
  }
}
