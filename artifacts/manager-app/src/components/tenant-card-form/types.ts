export interface VehicleEntry {
  vehicleNumber: string;
  vehicleType: string;
  vehicleColor: string;
  tenantRelation: string;
  ownerContact: string;
  isPrimary: boolean;
}

export interface FormData {
  tenantName: string;
  residentId: string;
  phone: string;
  emergencyContact: string;
  email: string;
  interiorStartDate: string;
  moveInDate: string;
  hasTv: boolean;
  registeredAddress: string;
  isBusiness: boolean;
  companyName: string;
  businessNumber: string;
  guarantorName: string;
  guarantorPhone: string;
  guarantorRelation: string;
  guarantorResidentId: string;
  vehicles: VehicleEntry[];
  contractDocUrl: string | null;
  businessRegDocUrl: string | null;
  idDocUrl: string | null;
  vehicleRegDocUrl: string | null;
  feeObligationConsent: boolean;
  penaltyConsent: boolean;
  specialFundConsent: boolean;
  privacyRetentionConsent: boolean;
  guaranteeConsent: boolean;
  signatureName: string;
}

export interface ContractTemplate {
  feeObligationClause: string;
  penaltyClause: string;
  specialFundClause: string;
  privacyRetentionClause: string;
}

export interface CardData {
  buildingName: string;
  unitLabel: string;
  tokenStatus: string;
  specialFundEnabled: boolean;
  contractTemplate?: ContractTemplate;
}

export type DocField = "contractDocUrl" | "businessRegDocUrl" | "idDocUrl" | "vehicleRegDocUrl";
