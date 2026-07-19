export const LEGAL_NOTICE_VERSION = "2026-07-19";

export const operatorLegalName =
  process.env.NEXT_PUBLIC_AGENCY_LEGAL_NAME?.trim() || "the CFP Planning operator";

export const operatorContact =
  process.env.NEXT_PUBLIC_AGENCY_CONTACT_EMAIL?.trim() ||
  "your assigned adviser or workspace administrator";

export const operatorRegistration =
  process.env.NEXT_PUBLIC_AGENCY_REGISTRATION?.trim() || null;

export const operatorLicence =
  process.env.NEXT_PUBLIC_AGENCY_LICENSE?.trim() || null;
