-- P1 FIX (SaaS audit): Add recoveryCodes + enabled + verifiedAt + lastUsedAt columns to MFASecret
-- recoveryCodes: encrypted blob of hashed recovery codes (one-time use)
-- enabled: alias for verified (test-facing name)
-- verifiedAt: when MFA was verified (cleared on re-setup)
-- lastUsedAt: last successful TOTP validation

ALTER TABLE "MFASecret" ADD COLUMN "recoveryCodes" TEXT;
ALTER TABLE "MFASecret" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MFASecret" ADD COLUMN "verifiedAt" TIMESTAMP(3);
ALTER TABLE "MFASecret" ADD COLUMN "lastUsedAt" TIMESTAMP(3);
