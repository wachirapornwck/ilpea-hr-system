// =============================================================================
// lib/attendance/geoUtils.ts
// =============================================================================
// Geolocation Utilities — ตรวจสอบพื้นที่ก่อน Clock In
//
// Business Rules:
//   ≤ 100m              → APPROVED  (อนุมัติอัตโนมัติ)
//   101–300m            → FLAGGED   (Allow แต่ Flag ให้ HR ตรวจสอบ)
//   > 300m              → REJECTED  (ปฏิเสธการ clock in)
//   GPS accuracy > 100m → FLAGGED   (Allow แต่ Flag แม้อยู่ในรัศมี)
//
// ค่า radius ทั้งหมดดึงจาก companySettings ใน Firestore
// ถ้าไม่มีใช้ค่า default จาก GEOLOCATION constants
// =============================================================================

import type { GeoLocation } from '@/types';
import { GEOLOCATION } from './constants';

// =============================================================================
// Haversine Formula — คำนวณระยะห่างบนพื้นโลก
// =============================================================================

/**
 * คำนวณระยะห่างระหว่างสองพิกัด GPS (Haversine Formula)
 * ความแม่นยำ ±0.5% เพียงพอสำหรับโรงงาน
 * @returns ระยะห่างเป็นเมตร (ปัดเป็นจำนวนเต็ม)
 */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => d * (Math.PI / 180);
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// =============================================================================
// Location Check Result Type
// =============================================================================

export type LocationDecision = 'APPROVED' | 'FLAGGED' | 'REJECTED';

export interface LocationCheckDetail {
  distanceMeters: number;
  allowedRadius: number;
  isAccurate: boolean;
  shouldFlag: boolean;
  flagReason?: string;
  decision: LocationDecision;
  decisionLabel: string;
  isWithinArea: boolean;
  note: string;
}

// =============================================================================
// Main: checkClockInLocation
// =============================================================================

/**
 * ตรวจสอบพิกัด GPS ของพนักงานก่อน clock in
 *
 * @param employee      พิกัด GPS ของพนักงาน (จาก browser Geolocation API)
 * @param factory       พิกัด GPS ของโรงงาน (จาก companySettings)
 * @param radiusSettings  ค่า radius จาก companySettings (ถ้าไม่มีใช้ default)
 *
 * @example
 * // พนักงานอยู่ห่าง 50m, GPS accuracy 10m
 * checkClockInLocation(emp, factory, settings)
 * // → decision: 'APPROVED'
 *
 * // พนักงานอยู่ห่าง 200m, GPS accuracy 20m
 * // → decision: 'FLAGGED', flagReason: 'outside_approve_radius'
 *
 * // พนักงานอยู่ห่าง 400m
 * // → decision: 'REJECTED'
 */
export function checkClockInLocation(
  employee: GeoLocation,
  factory: { latitude: number; longitude: number },
  radiusSettings?: {
    approveRadius?: number;
    flagRadius?: number;
    rejectRadius?: number;
    maxAccuracy?: number;
  }
): LocationCheckDetail {
  const approveRadius =
    radiusSettings?.approveRadius ?? GEOLOCATION.APPROVE_RADIUS_METERS; // 100
  const flagRadius =
    radiusSettings?.flagRadius ?? GEOLOCATION.FLAG_RADIUS_METERS; // 300
  const rejectRadius =
    radiusSettings?.rejectRadius ?? GEOLOCATION.REJECT_RADIUS_METERS; // 300
  const maxAccuracy =
    radiusSettings?.maxAccuracy ?? GEOLOCATION.MAX_ACCURACY_METERS; // 100

  const distanceMeters = calculateDistance(
    employee.latitude,
    employee.longitude,
    factory.latitude,
    factory.longitude
  );

  const isAccurate = (employee.accuracy ?? maxAccuracy + 1) <= maxAccuracy;
  // =========================================================================
  // Decision Tree
  // =========================================================================

  // REJECTED: อยู่ไกลเกิน rejectRadius
  if (distanceMeters > rejectRadius) {
    return {
      isWithinArea: false,
      distanceMeters,
      allowedRadius: rejectRadius,
      isAccurate,
      shouldFlag: false,
      decision: 'REJECTED',
      decisionLabel: `อยู่ห่างโรงงาน ${distanceMeters} เมตร (เกินระยะที่อนุญาต ${rejectRadius} เมตร)`,
      note: `[REJECTED] ระยะห่าง ${distanceMeters}m เกินขีดจำกัด ${rejectRadius}m`,
    };
  }

  // FLAGGED: อยู่ในช่วง 101–300m
  if (distanceMeters > approveRadius) {
    return {
      isWithinArea: false,
      distanceMeters,
      allowedRadius: flagRadius,
      isAccurate,
      shouldFlag: true,
      flagReason: 'outside_area' as any,
      decision: 'FLAGGED',
      decisionLabel: `อยู่ห่างโรงงาน ${distanceMeters} เมตร (นอกพื้นที่ ${approveRadius}m)`,
      note: `[FLAG] ระยะห่าง ${distanceMeters}m อยู่นอกรัศมีอนุมัติ ${approveRadius}m`,
    };
  }

  // FLAGGED: GPS ไม่แม่น (แม้อยู่ในรัศมี)
  if (!isAccurate) {
    return {
      isWithinArea: true,
      distanceMeters,
      allowedRadius: approveRadius,
      isAccurate: false,
      shouldFlag: true,
      flagReason: 'low_accuracy' as any,
      decision: 'FLAGGED',
      decisionLabel: `GPS ไม่แม่นยำ (accuracy: ${employee.accuracy}m, เกิน ${maxAccuracy}m)`,
      note: `[FLAG] GPS accuracy ${employee.accuracy}m เกินค่ากำหนด ${maxAccuracy}m — ระยะห่าง ${distanceMeters}m`,
    };
  }

  // APPROVED: อยู่ในรัศมีและ GPS แม่น
  return {
    isWithinArea: true,
    distanceMeters,
    allowedRadius: approveRadius,
    isAccurate: true,
    shouldFlag: false,
    decision: 'APPROVED',
    decisionLabel: `อยู่ในพื้นที่โรงงาน (ห่าง ${distanceMeters} เมตร)`,
    note: '',
  };
}

// =============================================================================
// Helper: ไม่มี GPS data
// =============================================================================

/**
 * กรณีที่ client ไม่ส่ง GPS มา (ปฏิเสธ permission หรือ browser ไม่รองรับ)
 * → FLAGGED เสมอ
 */
export function buildNoLocationResult(): LocationCheckDetail {
  return {
    isWithinArea: false,
    distanceMeters: -1,
    allowedRadius: GEOLOCATION.APPROVE_RADIUS_METERS,
    isAccurate: false,
    shouldFlag: true,
    flagReason: 'low_accuracy' as any,
    decision: 'FLAGGED',
    decisionLabel: 'ไม่ได้รับข้อมูล GPS',
    note: '[FLAG] ไม่ได้ส่งข้อมูล GPS — ไม่สามารถตรวจสอบพื้นที่ได้',
  };
}
