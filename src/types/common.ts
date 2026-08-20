/**
 * src/types/common.ts
 * Shared base types reused across ALL feature modules.
 * Import from here — never copy interfaces between feature files.
 */

// ============================================================
// API RESPONSE — Discriminated union (ไม่ใช่ success: boolean)
// ============================================================

export interface ApiResponse<T = unknown> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

// ใช้เป็น return type ของทุก API route
export type ApiResult<T = unknown> = ApiResponse<T> | ApiErrorResponse;

// ============================================================
// PAGINATION
// ============================================================

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginationResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ============================================================
// TIMESTAMPS — ทุก Firestore document ต้องมี fields เหล่านี้
// ============================================================

export interface TimestampFields {
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

// ============================================================
// AUDIT INFO — บันทึกว่าใครทำอะไร เมื่อไหร่
// ============================================================

export interface AuditInfo {
  performedBy: string; // employeeId
  performedAt: string; // ISO 8601
  ipAddress?: string;
  userAgent?: string;
}

// ============================================================
// FILE ATTACHMENT — เก็บแค่ metadata, ไฟล์จริงอยู่ Firebase Storage
// ============================================================

export interface FileAttachment {
  fileName: string;
  storagePath: string; // Firebase Storage path
  contentType: string; // MIME type เช่น "image/jpeg", "application/pdf"
  sizeBytes: number;
  uploadedAt: string; // ISO 8601
  uploadedBy: string; // employeeId
}

// ============================================================
// GEO LOCATION — ใช้โดย Attendance (clock-in) และ Leave (อนาคต)
// ============================================================

export interface GeoLocation {
  latitude: number;
  longitude: number;
  accuracy?: number; // หน่วย: เมตร
  timestamp?: string; // ISO 8601
}

// ============================================================
// SELECTABLE OPTION — สำหรับ dropdown / radio group ใน UI
// ============================================================

export interface SelectableOption<T = string> {
  value: T;
  label: string;
  disabled?: boolean;
  icon?: string;
  color?: string;
}

// ============================================================
// NOTIFICATION — common schema ใช้ร่วมกันทุก module
// ไม่สร้าง notification type แยกต่างหากสำหรับแต่ละ module
// ============================================================

export type NotificationModule =
  | 'leave'
  | 'attendance'
  | 'overtime'
  | 'payroll'
  | 'system';

export interface Notification {
  id: string;
  type: string; // เช่น "leave_submitted", "leave_approved"
  title: string;
  message: string;
  targetUserId: string; // employeeId ของผู้รับ
  relatedModule: NotificationModule;
  relatedDocumentId: string; // leaveRequestId, attendanceId ฯลฯ
  createdAt: string; // ISO 8601
  readAt?: string; // ISO 8601 — undefined = ยังไม่ได้อ่าน
}

export interface CreateNotificationPayload {
  type: string;
  title: string;
  message: string;
  targetUserId: string;
  relatedModule: NotificationModule;
  relatedDocumentId: string;
}

// ============================================================
// DATE RANGE — ใช้โดย Leave, Payroll, Reports
// ============================================================

export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

// ============================================================
// COMPANY SETTINGS — Firestore document เดียว (id: "default")
// ห้าม hardcode ค่าเหล่านี้ใน code ใดๆ
// ============================================================

export interface CompanySettings {
  currentLeaveYear: number;
  leaveYearStart: string; // YYYY-MM-DD
  annualLeaveDays: number;
  sickLeaveDays: number;
  personalLeaveDays: number;
  maternityLeaveDays: number;
  probationLeaveAllowed: boolean;
  workingDaysPerWeek: number;
  payrollCutoffDay: number;
  timezone: string; // เช่น "Asia/Bangkok"
  currency: string; // เช่น "THB"
  locale: string; // เช่น "th-TH"
  defaultShift: string; // เช่น "general"
}

// ============================================================
// HOLIDAY CALENDAR — ใช้โดย Leave calculation, Payroll, Attendance
// ============================================================

export type HolidayType = 'public' | 'company' | 'optional';

export interface HolidayCalendarEntry {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
  type: HolidayType;
  paid: boolean;
}
