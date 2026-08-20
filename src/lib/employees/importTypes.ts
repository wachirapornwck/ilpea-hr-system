/**
 * src/lib/employees/importTypes.ts
 * Employee Import — shared type definitions.
 *
 * Phase 6-3 Step 1: moved verbatim from src/app/(app)/employees/page.tsx.
 * Property names and shapes are unchanged — these are consumed by the
 * Import Preview (client) today and by the Validate/Import API routes in
 * later steps.
 *
 * Phase 6-3 Step 2: added ImportNormalizedRow so the normalized
 * employeeType/shiftId computed during validation can be reused by the
 * Import Commit step instead of being derived a second time.
 */

import type { EmployeeType } from '@/types';

export interface ImportFieldDef {
  key: string;
  label: string;
  required: boolean;
}

export interface ImportRowValidation {
  status: 'valid' | 'warning' | 'error';
  errors: string[];
  warnings: string[];
}

/**
 * Normalized values derived from a single import row.
 *
 * Only fields whose raw spreadsheet text differs from what the system
 * stores are represented here. `null` means "validated as intentionally
 * empty"; when a row has errors the corresponding entry may be null
 * because normalization could not be completed.
 */
export interface ImportNormalizedRow {
  employeeType: EmployeeType | null;
  /**
   * 'DAY' | 'NIGHT' | 'MAID', or null.
   * null is a legitimate stored value for white_collar employees, matching
   * the existing Add Employee behaviour (shiftId is nullable on the
   * employee document).
   */
  shiftId: string | null;
}

export interface ImportValidationResult {
  headerErrors: string[]; // non-empty = blocks the whole import
  rows: ImportRowValidation[];
  /**
   * Parallel to `rows` — same length, same order. Empty when headerErrors
   * is non-empty (validation short-circuits before any row is processed).
   */
  normalized: ImportNormalizedRow[];
  summary: { valid: number; warning: number; error: number };
}
