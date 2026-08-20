/**
 * src/lib/employees/importValidation.ts
 * Employee Import — the single shared validation implementation.
 *
 * Phase 6-3 Step 1: moved verbatim from src/app/(app)/employees/page.tsx.
 * Business rules are unchanged; this file only relocates them so that the
 * Preview (client) and the Validate/Import API routes (later steps) can
 * share one implementation instead of drifting apart.
 *
 * Must stay PURE — no React, no Firestore, no fetch, no UI. Deterministic
 * for a given input so client preview and server validation always agree.
 *
 * NOTE (deliberate, Phase 6-3 Step 1): the `employees` parameter and the
 * duplicate check that uses it are intentionally left as-is. They will be
 * replaced by a real per-document server check once the Validate API
 * exists. Do not "fix" it here.
 */

import type {
  Department,
  Position,
  EmployeeListItem,
  EmployeeType,
} from '@/types';
import type {
  ImportRowValidation,
  ImportValidationResult,
  ImportNormalizedRow,
} from './importTypes';
import {
  IMPORT_TEMPLATE_FIELDS,
  IMPORT_DATE_FIELD_KEYS,
  IMPORT_PHONE_FIELD_KEYS,
  normalizeRole,
  normalizeShift,
  normalizeGender,
  normalizeEmploymentStatus,
  normalizeEmployeeType,
  normalizeTitlePrefix,
  isValidImportDate,
  isValidThaiPhone,
} from './importConstants';

// Pure function — takes the Phase 3 preview data plus master data already
// loaded on this page (no new fetch beyond what's added for this phase) and
// returns per-row + header-level validation results. No mutation, no side
// effects, safe to call from useMemo.
export function validateImportData(
  headers: string[],
  rows: string[][],
  departments: Department[],
  positions: Position[],
  employees: EmployeeListItem[]
): ImportValidationResult {
  const headerErrors: string[] = [];

  // 1. Required Header — every template column must be present
  const missing = IMPORT_TEMPLATE_FIELDS.filter(
    (f) => !headers.includes(f.label)
  );
  if (missing.length > 0) {
    headerErrors.push(
      `ไม่พบ Header ที่จำเป็นตาม Template: ${missing
        .map((f) => f.label)
        .join(', ')}`
    );
  }

  // 2. Duplicate Header
  const seen = new Set<string>();
  const duplicated = new Set<string>();
  headers.forEach((h) => {
    if (seen.has(h)) duplicated.add(h);
    seen.add(h);
  });
  if (duplicated.size > 0) {
    headerErrors.push(`มี Header ซ้ำกัน: ${Array.from(duplicated).join(', ')}`);
  }

  if (headerErrors.length > 0) {
    return {
      headerErrors,
      rows: [],
      normalized: [],
      summary: { valid: 0, warning: 0, error: 0 },
    };
  }

  const colIndex: Record<string, number> = {};
  IMPORT_TEMPLATE_FIELDS.forEach((f) => {
    colIndex[f.key] = headers.indexOf(f.label);
  });
  const cell = (row: string[], key: string) =>
    (row[colIndex[key]] ?? '').trim();

  // 4. Duplicate Employee ID within the file itself
  const idCounts: Record<string, number> = {};
  rows.forEach((row) => {
    const id = cell(row, 'employeeId').toUpperCase();
    if (id) idCounts[id] = (idCounts[id] ?? 0) + 1;
  });

  // 5. Duplicate vs employees already loaded on this page (not the whole
  // system — see the warning text below, which says this explicitly).
  const loadedIds = new Set(employees.map((e) => e.employeeId.toUpperCase()));

  const deptNames = new Set(departments.map((d) => d.name.trim()));
  const posNames = new Set(positions.map((p) => p.name.trim()));

  // Cross-validation (Step 2) needs each position's employeeType, not just
  // its name. Position names are NOT unique system-wide — GET /api/positions
  // enforces uniqueness on `code`, not `name` — so two departments may each
  // have a "Supervisor" with a different employeeType. Keying by name alone
  // would silently resolve to whichever row happened to load first.
  //
  // Each import row already supplies a department, so the lookup is scoped
  // by departmentId + position name, which is the pairing the row actually
  // asserts. Department name → id is needed to bridge the two.
  const deptIdByName = new Map<string, string>();
  departments.forEach((d) => deptIdByName.set(d.name.trim(), d.id));

  const posTypeByDeptAndName = new Map<string, EmployeeType>();
  positions.forEach((p) => {
    posTypeByDeptAndName.set(
      `${p.departmentId}\u0000${p.name.trim()}`,
      p.employeeType
    );
  });

  const evaluated = rows.map((row) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 13. Ragged Row — จำนวนคอลัมน์ไม่ตรงกับ Header เช็คเป็นอันดับแรก
    // เพราะเป็นต้นเหตุของ error ข้ออื่น (คอลัมน์เหลื่อม → ค่าไปอยู่ผิดช่อง)
    // หมายเหตุ: cell() ยังคง `?? ''` ไว้กัน .trim() พัง แต่การ pad
    // นั้นไม่เงียบอีกต่อไป — ผู้ใช้จะเห็น error นี้ควบคู่เสมอ
    if (row.length !== headers.length) {
      errors.push(
        `จำนวนคอลัมน์ไม่ตรงกับ Header (พบ ${row.length} คอลัมน์ ต้องมี ${headers.length} คอลัมน์)`
      );
    }

    // 3. Required Value
    IMPORT_TEMPLATE_FIELDS.forEach((f) => {
      if (f.required && !cell(row, f.key)) {
        errors.push(`${f.label} ห้ามว่าง`);
      }
    });

    const employeeIdUpper = cell(row, 'employeeId').toUpperCase();

    if (employeeIdUpper && idCounts[employeeIdUpper] > 1) {
      errors.push('รหัสพนักงานซ้ำภายในไฟล์เดียวกัน');
    }

    if (employeeIdUpper && loadedIds.has(employeeIdUpper)) {
      warnings.push(
        'รหัสพนักงานนี้ตรงกับพนักงานที่โหลดอยู่ในหน้านี้ — ตรวจสอบเฉพาะข้อมูลที่โหลดอยู่ในหน้านี้เท่านั้น ไม่ครอบคลุมทั้งระบบ'
      );
    }

    // 6. Department Validation — real data from GET /api/departments
    const deptValue = cell(row, 'department');
    if (deptValue && !deptNames.has(deptValue)) {
      errors.push(`ไม่พบแผนก "${deptValue}" ในระบบ`);
    }

    // 7. Position Validation — real data from GET /api/positions
    const posValue = cell(row, 'position');
    if (posValue && !posNames.has(posValue)) {
      errors.push(`ไม่พบตำแหน่ง "${posValue}" ในระบบ`);
    }

    // 8. Role Validation
    const roleValue = cell(row, 'role');
    if (roleValue && !normalizeRole(roleValue)) {
      errors.push(`สิทธิ์การใช้งาน "${roleValue}" ไม่ถูกต้อง`);
    }

    // 15. Employee Type Validation (Step 2) — business data, ห้ามเดา
    // รับเฉพาะค่าที่ระบบรองรับ (blue_collar / white_collar) ค่าอื่นเป็น error
    const employeeTypeValue = cell(row, 'employeeType');
    const normalizedEmployeeType = employeeTypeValue
      ? (normalizeEmployeeType(employeeTypeValue) as EmployeeType | null)
      : null;
    if (employeeTypeValue && !normalizedEmployeeType) {
      errors.push(
        `ประเภทพนักงาน "${employeeTypeValue}" ไม่ถูกต้อง (รองรับเฉพาะ blue_collar หรือ white_collar)`
      );
    }

    // 16. Cross Validation — employeeType ในไฟล์ ต้องตรงกับ employeeType
    // ของตำแหน่งใน database ถ้าขัดกันแปลว่าไฟล์ผิด → error ไม่ override เงียบๆ
    // ตรวจเฉพาะเมื่อทั้งสองฝั่งผ่าน validation ของตัวเองแล้ว เพื่อไม่ให้
    // error ซ้ำซ้อนกับข้อ 7 / ข้อ 15
    if (normalizedEmployeeType && posValue && deptValue) {
      const deptId = deptIdByName.get(deptValue);
      const positionType = deptId
        ? posTypeByDeptAndName.get(`${deptId}\u0000${posValue}`)
        : undefined;
      if (positionType && positionType !== normalizedEmployeeType) {
        errors.push(
          `ประเภทพนักงาน "${employeeTypeValue}" ไม่ตรงกับตำแหน่ง "${posValue}" ซึ่งกำหนดไว้เป็น "${positionType}" ในระบบ`
        );
      }
    }

    // Shift — required เฉพาะ blue_collar (Step 2)
    // white_collar เว้นว่างได้ → shiftId = null (ตรงกับ Add Employee)
    // ถ้า white_collar กรอกกะที่ถูกต้องมา ให้เก็บไว้ตามเดิม ไม่ลบทิ้ง
    const shiftValue = cell(row, 'shift');
    let normalizedShiftId: string | null = null;
    if (shiftValue) {
      normalizedShiftId = normalizeShift(shiftValue);
      if (!normalizedShiftId) {
        errors.push(`กะการทำงาน "${shiftValue}" ไม่ถูกต้อง`);
      }
    } else if (normalizedEmployeeType === 'blue_collar') {
      errors.push('กะการทำงาน ห้ามว่างสำหรับพนักงาน Blue Collar');
    }

    // 9. Employment Status Validation
    const statusValue = cell(row, 'employmentStatus');
    if (statusValue && !normalizeEmploymentStatus(statusValue)) {
      errors.push(`สถานะการทำงาน "${statusValue}" ไม่ถูกต้อง`);
    }

    // 10. Title Prefix Validation — unmapped text is never an error, just a
    // warning that it will be stored as 'other' with the original text kept
    // (matches Schema v2's titlePrefixOther escape hatch).
    const titlePrefixValue = cell(row, 'titlePrefix');
    if (
      titlePrefixValue &&
      normalizeTitlePrefix(titlePrefixValue) === 'other'
    ) {
      warnings.push(
        `คำนำหน้า "${titlePrefixValue}" ไม่ตรงกับรูปแบบมาตรฐาน จะถูกบันทึกเป็น "อื่นๆ" พร้อมข้อความเดิม`
      );
    }

    // 11. Date Validation — รูปแบบ + ต้องมีอยู่จริงในปฏิทิน (ยังไม่ตรวจ
    // business rule เช่น startDate ต้องก่อน probationEndDate — นอกขอบเขต)
    IMPORT_DATE_FIELD_KEYS.forEach((key) => {
      const value = cell(row, key);
      if (value && !isValidImportDate(value)) {
        const label =
          IMPORT_TEMPLATE_FIELDS.find((f) => f.key === key)?.label ?? key;
        errors.push(
          `${label} ไม่ถูกต้อง (ต้องเป็นวันที่ที่มีจริง รูปแบบ YYYY-MM-DD)`
        );
      }
    });

    // 12. Phone Validation — ทั้งคู่เป็น optional: เว้นว่างถือว่าถูกต้อง
    // จะตรวจเฉพาะเมื่อมีค่าจริง และใช้ isValidThaiPhone() ตัวเดียวกัน
    IMPORT_PHONE_FIELD_KEYS.forEach((key) => {
      const value = cell(row, key);
      if (value && !isValidThaiPhone(value)) {
        const label =
          IMPORT_TEMPLATE_FIELDS.find((f) => f.key === key)?.label ?? key;
        errors.push(
          `${label} ไม่ถูกต้อง (ต้องเป็นเบอร์โทรไทย เช่น 0812345678 หรือ 021234567)`
        );
      }
    });

    // 14. Gender Validation — optional: เว้นว่างถือว่าถูกต้อง
    // รับเฉพาะค่าที่ระบบรองรับอยู่แล้ว (male/female หรือ ชาย/หญิง)
    const genderValue = cell(row, 'gender');
    if (genderValue && !normalizeGender(genderValue)) {
      errors.push(
        `เพศ "${genderValue}" ไม่ถูกต้อง (รองรับเฉพาะ ชาย หรือ หญิง)`
      );
    }

    // 17. PIN Policy (Step 5) — PIN ของพนักงานใหม่มาจากวันเกิด (DDMMYY)
    // เท่านั้น ไม่มีการสุ่ม ถ้าไม่มีวันเกิดก็สร้าง PIN ไม่ได้ แถวนั้นจึงเป็น
    // error ไม่ใช่ skip เงียบๆ — ผู้ใช้ต้องเห็นว่าต้องเติมวันเกิดก่อน
    //
    // หมายเหตุ: ตั้งใจไม่เปลี่ยน dateOfBirth.required ใน template เป็น true
    // เพราะข้อความ "ห้ามว่าง" แบบทั่วไปไม่ได้บอกเหตุผล ส่วนกฎนี้อธิบายชัดว่า
    // จำเป็นเพราะต้องใช้สร้าง PIN และไม่ซ้ำกับ error รูปแบบวันที่ (ข้อ 11)
    const dateOfBirthValue = cell(row, 'dateOfBirth');
    if (!dateOfBirthValue) {
      errors.push('วันเดือนปีเกิด ห้ามว่าง (ใช้สร้าง PIN เริ่มต้นของพนักงาน)');
    }

    const status: ImportRowValidation['status'] =
      errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'valid';

    return {
      validation: { status, errors, warnings },
      normalized: {
        employeeType: normalizedEmployeeType,
        shiftId: normalizedShiftId,
      },
    };
  });

  const rowResults: ImportRowValidation[] = evaluated.map((e) => e.validation);
  const normalized: ImportNormalizedRow[] = evaluated.map((e) => e.normalized);

  const summary = rowResults.reduce(
    (acc, r) => {
      acc[r.status]++;
      return acc;
    },
    { valid: 0, warning: 0, error: 0 }
  );

  return { headerErrors: [], rows: rowResults, normalized, summary };
}
