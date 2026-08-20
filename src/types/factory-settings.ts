// =============================================================================
// src/types/factory-settings.ts
// =============================================================================
// Matches the REAL shape of companySettings/main in Firestore (see
// api/seed/route.ts). Note: there is an older, unrelated `CompanySettings`
// interface in types/common.ts for leave-policy config that was never wired
// up to anything — this is a separate, new type for the GPS/location fields
// specifically, not a replacement for it.
// =============================================================================

export interface FactoryLocation {
  latitude: number;
  longitude: number;
  address: string;
}

export interface FactorySettings {
  companyName: string;
  companyNameTH: string;
  factoryLocation: FactoryLocation;
  clockInApproveRadius: number;
  clockInFlagRadius: number;
  clockInRejectRadius: number;
  clockInMaxAccuracy: number;
  updatedAt?: string;
  updatedBy?: string;
}

export interface FactorySettingsUpdateInput {
  requesterId: string;
  latitude: number;
  longitude: number;
  address: string;
  clockInApproveRadius: number;
  clockInFlagRadius: number;
  clockInRejectRadius: number;
  clockInMaxAccuracy: number;
}
