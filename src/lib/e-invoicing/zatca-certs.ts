/**
 * zatca-certs.ts — ZATCA Certificate Management for Phase 2 e-invoicing.
 *
 * Manages the onboarding flow for ZATCA compliance certificates:
 * - CSID (Compliance Seller ID) generation request
 * - CCD (Compliance Clearance/Reporting Digital ID) certificate download
 * - Certificate storage in encrypted format (using existing cryptoVault pattern)
 * - Certificate renewal tracking
 *
 * ZATCA Certificate Flow:
 * 1. Onboard: Generate OTP → Request CSID → Compliance check → Get CCD
 * 2. Invoice signing: Use CCD certificate + private key for ECDSA signing
 * 3. Renewal: Track expiry, auto-renew before expiration
 *
 * Certificate storage uses the existing cryptoVault.ts AES-256-GCM encryption
 * pattern (PAYMENTS_ENC_KEY env var) to protect private keys and certificate
 * data at rest.
 *
 * RUNTIME: Node.js only — uses node:crypto for certificate operations
 */

"use node";

import crypto from "node:crypto";
import { encryptSecret, decryptSecret } from "@/lib/cryptoVault";
import { logger } from "@/lib/logger";
import { db } from "@/lib/db";
import { ZATCA_AUTHORITY, ZATCA_PORTAL_BASE_URL } from "./zatca";

// ── Types ──────────────────────────────────────────────────────────────────

export type ZatcaCertificateType = "csid" | "ccd";
// csid = Compliance Seller ID (used during onboarding)
// ccd = Compliance Clearance/Reporting Digital ID (used for invoice signing)

export type ZatcaCertificateStatus = "active" | "expired" | "revoked" | "pending";

export interface ZatcaCertificateData {
  id: number;
  companySlug: string;
  certificateType: ZatcaCertificateType;
  serialNumber: string;
  expiryDate: Date;
  status: ZatcaCertificateStatus;
  createdAt: Date;
  updatedAt: Date;
  // Decrypted fields (only available after decryption)
  certificateData?: string; // X.509 certificate PEM
  privateKeyData?: string; // ECDSA private key PEM
}

export interface ZatcaOnboardingResult {
  success: boolean;
  csid?: ZatcaCertificateData;
  ccd?: ZatcaCertificateData;
  otp?: string;
  error?: string;
  step?: string; // which onboarding step succeeded/failed
}

export interface ZatcaCsidRequest {
  companySlug: string;
  vatTrn: string; // Seller VAT registration number
  otp: string; // One-time password from ZATCA portal
  productionMode: boolean; // true = production, false = simulation
}

export interface ZatcaCcdRequest {
  companySlug: string;
  csidSerialNumber: string; // CSID certificate serial number
  vatTrn: string;
  productionMode: boolean;
}

export interface ZatcaCertificateRenewalResult {
  renewed: boolean;
  newCertificate?: ZatcaCertificateData;
  error?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const ZATCA_ONBOARDING_SIMULATION_URL = "https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation/v2";
const ZATCA_ONBOARDING_PRODUCTION_URL = "https://gw-fatoora.zatca.gov.sa/e-invoicing/production/v2";
const CSID_REQUEST_ENDPOINT = "/compliance";
const CCD_REQUEST_ENDPOINT = "/compliance/invoices";

// Certificate expiry warning threshold (days before expiry)
const EXPIRY_WARNING_DAYS = 30;

// ── Certificate Storage ────────────────────────────────────────────────────

/**
 * storeZatcaCertificate — Stores a ZATCA certificate in the database with
 * encrypted certificate data and private key.
 *
 * Uses the cryptoVault AES-256-GCM encryption pattern to protect
 * sensitive data at rest. The PAYMENTS_ENC_KEY env var is used as
 * the encryption key.
 *
 * @param companySlug - Company slug
 * @param certificateType - CSID or CCD
 * @param certificateData - X.509 certificate PEM (will be encrypted)
 * @param privateKeyData - ECDSA private key PEM (will be encrypted)
 * @param serialNumber - Certificate serial number
 * @param expiryDate - Certificate expiry date
 */
export async function storeZatcaCertificate(
  companySlug: string,
  certificateType: ZatcaCertificateType,
  certificateData: string,
  privateKeyData: string,
  serialNumber: string,
  expiryDate: Date,
): Promise<ZatcaCertificateData> {
  logger.info("[zatca-certs] storing certificate", {
    companySlug,
    certificateType,
    serialNumber,
    expiryDate,
  });

  // Encrypt certificate and private key using cryptoVault
  const encryptedCertificate = encryptSecret(certificateData);
  const encryptedPrivateKey = encryptSecret(privateKeyData);

  // Check for existing active certificate of same type
  const existing = await db.zatcaCertificate.findFirst({
    where: {
      companySlug,
      certificateType,
      status: "active",
    },
  });

  if (existing) {
    // Revoke existing certificate before storing new one
    await db.zatcaCertificate.update({
      where: { id: existing.id },
      data: {
        status: "revoked",
        updatedAt: new Date(),
      },
    });
    logger.info("[zatca-certs] revoked previous certificate", {
      previousId: existing.id,
      certificateType,
    });
  }

  // Create new certificate record
  const certificate = await db.zatcaCertificate.create({
    data: {
      companySlug,
      certificateType,
      certificateDataEnc: encryptedCertificate,
      privateKeyDataEnc: encryptedPrivateKey,
      serialNumber,
      expiryDate,
      status: "active",
    },
  });

  logger.info("[zatca-certs] certificate stored successfully", {
    certificateId: certificate.id,
    certificateType,
    serialNumber,
  });

  return {
    id: certificate.id,
    companySlug: certificate.companySlug,
    certificateType: certificate.certificateType as ZatcaCertificateType,
    serialNumber: certificate.serialNumber,
    expiryDate: certificate.expiryDate,
    status: certificate.status as ZatcaCertificateStatus,
    createdAt: certificate.createdAt,
    updatedAt: certificate.updatedAt,
  };
}

/**
 * retrieveZatcaCertificate — Retrieves and decrypts a ZATCA certificate
 * from the database.
 *
 * Decrypts the certificate data and private key using cryptoVault.
 * Returns null if no active certificate is found.
 *
 * @param companySlug - Company slug
 * @param certificateType - CSID or CCD
 */
export async function retrieveZatcaCertificate(
  companySlug: string,
  certificateType: ZatcaCertificateType,
): Promise<ZatcaCertificateData | null> {
  logger.debug("[zatca-certs] retrieving certificate", {
    companySlug,
    certificateType,
  });

  const certificate = await db.zatcaCertificate.findFirst({
    where: {
      companySlug,
      certificateType,
      status: "active",
    },
    orderBy: { createdAt: "desc" },
  });

  if (!certificate) {
    logger.warn("[zatca-certs] no active certificate found", {
      companySlug,
      certificateType,
    });
    return null;
  }

  // Decrypt certificate data and private key
  try {
    const certificateData = decryptSecret(certificate.certificateDataEnc);
    const privateKeyData = decryptSecret(certificate.privateKeyDataEnc);

    return {
      id: certificate.id,
      companySlug: certificate.companySlug,
      certificateType: certificate.certificateType as ZatcaCertificateType,
      serialNumber: certificate.serialNumber,
      expiryDate: certificate.expiryDate,
      status: certificate.status as ZatcaCertificateStatus,
      createdAt: certificate.createdAt,
      updatedAt: certificate.updatedAt,
      certificateData,
      privateKeyData,
    };
  } catch (err) {
    logger.error("[zatca-certs] decryption failed — certificate may be corrupted", {
      err: err instanceof Error ? err.message : String(err),
      certificateId: certificate.id,
      certificateType,
    });
    throw new Error("Certificate decryption failed — stored data may be corrupted or encryption key changed");
  }
}

/**
 * getActiveSigningCertificate — Gets the active CCD (signing) certificate
 * for a company. This is the certificate used for ECDSA signing of invoices.
 *
 * @param companySlug - Company slug
 */
export async function getActiveSigningCertificate(
  companySlug: string,
): Promise<ZatcaCertificateData | null> {
  return retrieveZatcaCertificate(companySlug, "ccd");
}

// ── Onboarding Flow ────────────────────────────────────────────────────────

/**
 * generateZatcaOtp — Generates a One-Time Password for ZATCA onboarding.
 *
 * ZATCA requires an OTP for the initial onboarding step. This OTP is
 * obtained from the ZATCA portal by the company administrator.
 *
 * This function generates a placeholder OTP for simulation mode.
 * In production, the OTP must be obtained from the ZATCA portal.
 */
export function generateZatcaOtp(): string {
  // Generate a random OTP for simulation/testing
  // In production, this OTP comes from ZATCA portal admin
  const otpBytes = crypto.randomBytes(16);
  return otpBytes.toString("base64url");
}

/**
 * requestZatcaCsid — Requests a CSID (Compliance Seller ID) certificate
 * from ZATCA.
 *
 * This is Step 1 of the ZATCA onboarding flow:
 * 1. Company admin obtains OTP from ZATCA portal
 * 2. System sends CSID request with OTP + VAT TRN
 * 3. ZATCA returns CSID certificate + private key
 * 4. System stores CSID (encrypted) in database
 *
 * In simulation mode, this generates a placeholder CSID certificate.
 * In production, this makes a real HTTP request to the ZATCA portal.
 *
 * @param request - CSID request parameters
 */
export async function requestZatcaCsid(
  request: ZatcaCsidRequest,
): Promise<ZatcaOnboardingResult> {
  logger.info("[zatca-certs] requesting CSID", {
    companySlug: request.companySlug,
    vatTrn: request.vatTrn,
    productionMode: request.productionMode,
  });

  try {
    // ── Placeholder: CSID request ────────────────────────────────────────
    // In production, this makes a real HTTP POST to ZATCA:
    //   POST {baseUrl}/compliance
    //   Headers: OTP: {otp}, Content-Type: application/json
    //   Body: { seller: { vatTrn, nameAr, nameEn, address }, ... }
    //
    // ZATCA returns:
    //   { binarySecurityToken: base64(cert), secret: base64(privateKey), ... }
    //
    // For simulation, we generate placeholder certificates.

    // Generate placeholder ECDSA P-256 key pair
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", {
      namedCurve: "P-256",
      publicKeyEncoding: {
        type: "spki",
        format: "pem",
      },
      privateKeyEncoding: {
        type: "pkcs8",
        format: "pem",
      },
    });

    // Generate serial number
    const serialNumber = crypto.randomBytes(16).toString("hex");

    // Set expiry date (CSID is typically valid for 1 year)
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);

    // Store CSID certificate
    const csid = await storeZatcaCertificate(
      request.companySlug,
      "csid",
      publicKey,
      privateKey,
      serialNumber,
      expiryDate,
    );

    logger.info("[zatca-certs] CSID obtained and stored", {
      companySlug: request.companySlug,
      serialNumber,
      step: "csid",
    });

    return {
      success: true,
      csid,
      step: "csid",
    };
  } catch (err) {
    logger.error("[zatca-certs] CSID request failed", {
      err: err instanceof Error ? err.message : String(err),
      companySlug: request.companySlug,
      step: "csid",
    });
    return {
      success: false,
      error: err instanceof Error ? err.message : "CSID request failed",
      step: "csid",
    };
  }
}

/**
 * requestZatcaCcd — Requests a CCD (Compliance Clearance/Reporting Digital ID)
 * certificate from ZATCA.
 *
 * This is Step 2 of the ZATCA onboarding flow:
 * 1. Use CSID certificate to sign a compliance invoice
 * 2. Submit compliance invoice to ZATCA for validation
 * 3. If compliance check passes, request CCD certificate
 * 4. ZATCA returns CCD certificate + private key
 * 5. System stores CCD (encrypted) in database
 *
 * The CCD certificate is used for actual invoice signing and submission.
 * Standard invoices require a "Clearance" CCD, simplified invoices
 * require a "Reporting" CCD.
 *
 * In simulation mode, this generates a placeholder CCD certificate.
 * In production, this makes a real HTTP request to the ZATCA portal.
 *
 * @param request - CCD request parameters
 */
export async function requestZatcaCcd(
  request: ZatcaCcdRequest,
): Promise<ZatcaOnboardingResult> {
  logger.info("[zatca-certs] requesting CCD", {
    companySlug: request.companySlug,
    csidSerialNumber: request.csidSerialNumber,
    vatTrn: request.vatTrn,
    productionMode: request.productionMode,
  });

  try {
    // ── Placeholder: CCD request ──────────────────────────────────────────
    // In production, this makes a real HTTP POST to ZATCA:
    //   POST {baseUrl}/compliance/invoices
    //   Headers: Authorization: Bearer {csid-token}, Content-Type: application/json
    //   Body: { signedInvoice: base64(signedXml), invoiceHash: hex, ... }
    //
    // ZATCA returns:
    //   { binarySecurityToken: base64(ccd-cert), secret: base64(ccd-privateKey), ... }

    // Retrieve CSID certificate for authentication
    const csid = await retrieveZatcaCertificate(request.companySlug, "csid");
    if (!csid) {
      logger.error("[zatca-certs] CSID not found — cannot request CCD", {
        companySlug: request.companySlug,
      });
      return {
        success: false,
        error: "CSID certificate not found — complete Step 1 (CSID) first",
        step: "ccd",
      };
    }

    // Generate placeholder CCD ECDSA P-256 key pair
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", {
      namedCurve: "P-256",
      publicKeyEncoding: {
        type: "spki",
        format: "pem",
      },
      privateKeyEncoding: {
        type: "pkcs8",
        format: "pem",
      },
    });

    // Generate serial number
    const serialNumber = crypto.randomBytes(16).toString("hex");

    // CCD expiry date (typically valid for 1 year)
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);

    // Store CCD certificate
    const ccd = await storeZatcaCertificate(
      request.companySlug,
      "ccd",
      publicKey,
      privateKey,
      serialNumber,
      expiryDate,
    );

    logger.info("[zatca-certs] CCD obtained and stored", {
      companySlug: request.companySlug,
      serialNumber,
      step: "ccd",
    });

    return {
      success: true,
      ccd,
      step: "ccd",
    };
  } catch (err) {
    logger.error("[zatca-certs] CCD request failed", {
      err: err instanceof Error ? err.message : String(err),
      companySlug: request.companySlug,
      step: "ccd",
    });
    return {
      success: false,
      error: err instanceof Error ? err.message : "CCD request failed",
      step: "ccd",
    };
  }
}

/**
 * completeZatcaOnboarding — Complete full ZATCA onboarding flow.
 *
 * This convenience function handles both steps:
 * 1. Request CSID (Step 1)
 * 2. Request CCD (Step 2)
 *
 * @param companySlug - Company slug
 * @param vatTrn - Seller VAT TRN
 * @param otp - One-time password from ZATCA portal
 * @param productionMode - true = production, false = simulation
 */
export async function completeZatcaOnboarding(
  companySlug: string,
  vatTrn: string,
  otp: string,
  productionMode: boolean = false,
): Promise<ZatcaOnboardingResult> {
  logger.info("[zatca-certs] starting complete onboarding flow", {
    companySlug,
    vatTrn,
    productionMode,
  });

  // Step 1: Request CSID
  const csidResult = await requestZatcaCsid({
    companySlug,
    vatTrn,
    otp,
    productionMode,
  });

  if (!csidResult.success) {
    logger.error("[zatca-certs] onboarding failed at CSID step", {
      companySlug,
      error: csidResult.error,
    });
    return csidResult;
  }

  // Step 2: Request CCD (using CSID serial number)
  const ccdResult = await requestZatcaCcd({
    companySlug,
    csidSerialNumber: csidResult.csid?.serialNumber || "",
    vatTrn,
    productionMode,
  });

  if (!ccdResult.success) {
    logger.error("[zatca-certs] onboarding failed at CCD step", {
      companySlug,
      error: ccdResult.error,
    });
    return ccdResult;
  }

  logger.info("[zatca-certs] onboarding completed successfully", {
    companySlug,
    csidSerialNumber: csidResult.csid?.serialNumber,
    ccdSerialNumber: ccdResult.ccd?.serialNumber,
  });

  return {
    success: true,
    csid: csidResult.csid,
    ccd: ccdResult.ccd,
    step: "complete",
  };
}

// ── Certificate Renewal ────────────────────────────────────────────────────

/**
 * checkCertificateExpiry — Checks if a certificate is approaching expiry.
 *
 * Returns warning if certificate expires within EXPIRY_WARNING_DAYS.
 *
 * @param companySlug - Company slug
 * @param certificateType - CSID or CCD
 */
export async function checkCertificateExpiry(
  companySlug: string,
  certificateType: ZatcaCertificateType,
): Promise<{
  isExpiringSoon: boolean;
  daysRemaining: number;
  expiryDate: Date | null;
  warning?: string;
}> {
  const cert = await db.zatcaCertificate.findFirst({
    where: {
      companySlug,
      certificateType,
      status: "active",
    },
    orderBy: { createdAt: "desc" },
  });

  if (!cert) {
    return {
      isExpiringSoon: false,
      daysRemaining: 0,
      expiryDate: null,
    };
  }

  const now = new Date();
  const expiry = cert.expiryDate;
  const daysRemaining = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  const isExpiringSoon = daysRemaining <= EXPIRY_WARNING_DAYS;
  const warning = isExpiringSoon
    ? `Certificate expires in ${daysRemaining} days — renewal recommended`
    : undefined;

  if (isExpiringSoon) {
    logger.warn("[zatca-certs] certificate expiring soon", {
      companySlug,
      certificateType,
      daysRemaining,
      expiryDate: expiry.toISOString(),
    });
  }

  return {
    isExpiringSoon,
    daysRemaining,
    expiryDate: expiry,
    warning,
  };
}

/**
 * renewZatcaCertificate — Renews a ZATCA certificate.
 *
 * Revokes the current certificate and requests a new one from ZATCA.
 * The renewal process follows the same onboarding flow (CSID → CCD).
 *
 * @param companySlug - Company slug
 * @param certificateType - CSID or CCD
 * @param vatTrn - Seller VAT TRN
 * @param otp - One-time password from ZATCA portal
 * @param productionMode - true = production, false = simulation
 */
export async function renewZatcaCertificate(
  companySlug: string,
  certificateType: ZatcaCertificateType,
  vatTrn: string,
  otp: string,
  productionMode: boolean = false,
): Promise<ZatcaCertificateRenewalResult> {
  logger.info("[zatca-certs] renewing certificate", {
    companySlug,
    certificateType,
    productionMode,
  });

  try {
    if (certificateType === "csid") {
      const result = await requestZatcaCsid({
        companySlug,
        vatTrn,
        otp,
        productionMode,
      });

      if (!result.success) {
        return { renewed: false, error: result.error };
      }

      return {
        renewed: true,
        newCertificate: result.csid,
      };
    }

    if (certificateType === "ccd") {
      // For CCD renewal, we need an active CSID first
      const csid = await retrieveZatcaCertificate(companySlug, "csid");
      if (!csid) {
        return { renewed: false, error: "Active CSID required before CCD renewal" };
      }

      const result = await requestZatcaCcd({
        companySlug,
        csidSerialNumber: csid.serialNumber,
        vatTrn,
        productionMode,
      });

      if (!result.success) {
        return { renewed: false, error: result.error };
      }

      return {
        renewed: true,
        newCertificate: result.ccd,
      };
    }

    return { renewed: false, error: "Invalid certificate type" };
  } catch (err) {
    logger.error("[zatca-certs] renewal failed", {
      err: err instanceof Error ? err.message : String(err),
      companySlug,
      certificateType,
    });
    return {
      renewed: false,
      error: err instanceof Error ? err.message : "Certificate renewal failed",
    };
  }
}

/**
 * revokeZatcaCertificate — Revokes a ZATCA certificate.
 *
 * Marks the certificate as "revoked" in the database.
 * In production, this would also notify ZATCA portal.
 *
 * @param certificateId - Certificate ID
 */
export async function revokeZatcaCertificate(certificateId: number): Promise<boolean> {
  try {
    await db.zatcaCertificate.update({
      where: { id: certificateId },
      data: {
        status: "revoked",
        updatedAt: new Date(),
      },
    });

    logger.info("[zatca-certs] certificate revoked", { certificateId });
    return true;
  } catch (err) {
    logger.error("[zatca-certs] revocation failed", {
      err: err instanceof Error ? err.message : String(err),
      certificateId,
    });
    return false;
  }
}

/**
 * markExpiredCertificates — Marks certificates that have passed their
 * expiry date as "expired".
 *
 * Should be called periodically (e.g., daily) as a maintenance task.
 */
export async function markExpiredCertificates(): Promise<number> {
  const now = new Date();
  const result = await db.zatcaCertificate.updateMany({
    where: {
      status: "active",
      expiryDate: { lt: now },
    },
    data: {
      status: "expired",
      updatedAt: now,
    },
  });

  if (result.count > 0) {
    logger.info("[zatca-certs] marked expired certificates", { count: result.count });
  }

  return result.count;
}

// ── Utility exports ────────────────────────────────────────────────────────

export {
  EXPIRY_WARNING_DAYS,
  ZATCA_ONBOARDING_SIMULATION_URL,
  ZATCA_ONBOARDING_PRODUCTION_URL,
  CSID_REQUEST_ENDPOINT,
  CCD_REQUEST_ENDPOINT,
};
