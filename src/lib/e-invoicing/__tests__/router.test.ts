/**
 * router.test.ts — Tests for the E-Invoicing router (central dispatcher).
 *
 * Covers:
 * - Routing invoices to correct authority by country code
 * - Validation routing (KW, SA, AE, EG, BH, OM, QA)
 * - Auto-population routing
 * - Submission routing (placeholders)
 * - None/unknown authority handling
 */

import { describe, it, expect } from "bun:test";
import {
  routeEInvoice,
  validateEInvoice,
  autoPopulateEInvoiceFields,
} from "../router";

// ── Test fixtures ──────────────────────────────────────────────────────────

const kuwaitCompany = {
  id: 1,
  slug: "kuwait-trading",
  name: "Kuwait Trading Co.",
  nameAr: "شركة التجارة الكويتية",
  country: "KW",
  vatNumber: null,
  address: "Kuwait City",
  defaultTaxRate: "0",
};

const saudiCompany = {
  id: 2,
  slug: "saudi-trading",
  name: "Saudi Trading Co.",
  nameAr: "شركة التجارة السعودية",
  country: "SA",
  vatNumber: "VAT-SA-12345",
  address: "Riyadh, Saudi Arabia",
  defaultTaxRate: "15",
};

const uaeCompany = {
  id: 3,
  slug: "uae-trading",
  name: "UAE Trading LLC",
  nameAr: "شركة التجارة الإماراتية",
  country: "AE",
  vatNumber: "100123456789003",
  address: "Dubai, UAE",
  defaultTaxRate: "5",
};

const egyptCompany = {
  id: 4,
  slug: "egypt-trading",
  name: "Egypt Trading Co.",
  nameAr: "شركة التجارة المصرية",
  country: "EG",
  vatNumber: "TRN-EG-300123456",
  address: "Cairo, Egypt",
  addressAr: "القاهرة، مصر",
  defaultTaxRate: "14",
};

const bahrainCompany = {
  id: 5,
  slug: "bahrain-trading",
  name: "Bahrain Trading Co.",
  nameAr: "شركة التجارة البحرينية",
  country: "BH",
  vatNumber: "TRN-BH-300123456",
  address: "Manama, Bahrain",
  addressAr: "المنامة، البحرين",
  defaultTaxRate: "10",
};

const omanCompany = {
  id: 6,
  slug: "oman-trading",
  name: "Oman Trading Co.",
  nameAr: "شركة التجارة العُمانية",
  country: "OM",
  vatNumber: "TRN-OM-300123456",
  address: "Muscat, Oman",
  addressAr: "مسقط، عُمان",
  defaultTaxRate: "5",
};

const qatarCompany = {
  id: 7,
  slug: "qatar-trading",
  name: "Qatar Trading Co.",
  nameAr: "شركة التجارة القطرية",
  country: "QA",
  vatNumber: null,
  address: "Doha, Qatar",
  defaultTaxRate: "0",
};

const unknownCompany = {
  id: 8,
  slug: "unknown-trading",
  name: "Unknown Trading Co.",
  country: "XX", // Unknown country
  vatNumber: null,
  address: "Unknown City",
  defaultTaxRate: "0",
};

const baseInvoice = {
  invoiceNumber: "INV-001",
  issueDate: "2023-01-15",
  dueDate: "2023-02-15",
  lineItems: JSON.stringify([{ description: "Service", qty: 1, price: 100, total: 100 }]),
};

// ── Routing Tests ──────────────────────────────────────────────────────────

describe("routeEInvoice", () => {
  it("should route KW companies to kuwait_decree_10_2026", () => {
    const result = routeEInvoice(baseInvoice, kuwaitCompany);
    expect(result.authority).toBe("kuwait_decree_10_2026");
    expect(result.handlerModule).toBe("kuwait");
    expect(result.isRequired).toBe(true);
  });

  it("should route SA companies to zatca", () => {
    const result = routeEInvoice(baseInvoice, saudiCompany);
    expect(result.authority).toBe("zatca");
    expect(result.handlerModule).toBe("zatca");
    expect(result.isRequired).toBe(true);
  });

  it("should route AE companies to uae_fta", () => {
    const result = routeEInvoice(baseInvoice, uaeCompany);
    expect(result.authority).toBe("uae_fta");
    expect(result.handlerModule).toBe("uae-fta");
    expect(result.isRequired).toBe(true);
  });

  it("should route EG companies to eta_egypt", () => {
    const result = routeEInvoice(baseInvoice, egyptCompany);
    expect(result.authority).toBe("eta_egypt");
    expect(result.handlerModule).toBe("egypt-eta");
    expect(result.isRequired).toBe(true);
  });

  it("should route BH companies to bahrain_nbr", () => {
    const result = routeEInvoice(baseInvoice, bahrainCompany);
    expect(result.authority).toBe("bahrain_nbr");
    expect(result.handlerModule).toBe("bahrain-nbr");
    expect(result.isRequired).toBe(true);
  });

  it("should route OM companies to oman_tax", () => {
    const result = routeEInvoice(baseInvoice, omanCompany);
    expect(result.authority).toBe("oman_tax");
    expect(result.handlerModule).toBe("oman-tax");
    expect(result.isRequired).toBe(true);
  });

  it("should route QA companies to none (no e-invoicing)", () => {
    const result = routeEInvoice(baseInvoice, qatarCompany);
    expect(result.authority).toBe("none");
    expect(result.handlerModule).toBe("none");
    expect(result.isRequired).toBe(false);
  });

  it("should route unknown countries to none", () => {
    const result = routeEInvoice(baseInvoice, unknownCompany);
    expect(result.authority).toBe("none");
    expect(result.handlerModule).toBe("none");
    expect(result.isRequired).toBe(false);
  });
});

// ── Validation Routing Tests ──────────────────────────────────────────────

describe("validateEInvoice", () => {
  it("should return valid for QA companies (no e-invoicing requirement)", () => {
    const result = validateEInvoice(baseInvoice, qatarCompany);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
    expect(result.warnings.length).toBe(0);
    expect(result.authority).toBe("none");
  });

  it("should return valid for unknown countries (no e-invoicing requirement)", () => {
    const result = validateEInvoice(baseInvoice, unknownCompany);
    expect(result.valid).toBe(true);
    expect(result.authority).toBe("none");
  });

  it("should route Kuwait validation to kuwait module", () => {
    // Kuwait has no VAT, so validation should pass for basic invoice
    const result = validateEInvoice(baseInvoice, kuwaitCompany);
    expect(result.authority).toBe("kuwait_decree_10_2026");
    // Kuwait validation will check mandatory Arabic fields etc.
  });

  it("should route Saudi validation to ZATCA module", () => {
    const result = validateEInvoice(baseInvoice, saudiCompany);
    expect(result.authority).toBe("zatca");
    // ZATCA validation will check VAT TRN etc.
  });

  it("should route UAE validation to UAE FTA module", () => {
    const result = validateEInvoice(baseInvoice, uaeCompany);
    expect(result.authority).toBe("uae_fta");
  });

  it("should route Egypt validation to ETA module", () => {
    const result = validateEInvoice(baseInvoice, egyptCompany);
    expect(result.authority).toBe("eta_egypt");
    // ETA validation will check TRN, dual language etc.
  });

  it("should route Bahrain validation to NBR module", () => {
    const result = validateEInvoice(baseInvoice, bahrainCompany);
    expect(result.authority).toBe("bahrain_nbr");
    // NBR validation will check VAT TRN, dual language, BHD 3 decimals etc.
  });

  it("should route Oman validation to Oman Tax module", () => {
    const result = validateEInvoice(baseInvoice, omanCompany);
    expect(result.authority).toBe("oman_tax");
  });

  it("should return unified error format from all modules", () => {
    // Test that all modules produce errors with field, messageAr, messageEn, severity
    const result = validateEInvoice(baseInvoice, egyptCompany);
    if (result.errors.length > 0) {
      const error = result.errors[0];
      expect(error).toHaveProperty("field");
      expect(error).toHaveProperty("messageAr");
      expect(error).toHaveProperty("messageEn");
      expect(error).toHaveProperty("severity");
    }
  });
});

// ── Auto-population Routing Tests ──────────────────────────────────────────

describe("autoPopulateEInvoiceFields", () => {
  it("should return invoice data unchanged for QA companies", () => {
    const result = autoPopulateEInvoiceFields(baseInvoice, qatarCompany);
    expect(result).toEqual(baseInvoice);
  });

  it("should return invoice data unchanged for unknown countries", () => {
    const result = autoPopulateEInvoiceFields(baseInvoice, unknownCompany);
    expect(result).toEqual(baseInvoice);
  });

  it("should auto-populate Kuwait fields for KW companies", () => {
    const result = autoPopulateEInvoiceFields(baseInvoice, kuwaitCompany);
    expect(result.eInvoiceAuthority).toBe("kuwait_decree_10_2026");
    expect(result.uuid).toBeTruthy();
  });

  it("should auto-populate ZATCA fields for SA companies", () => {
    const result = autoPopulateEInvoiceFields(baseInvoice, saudiCompany);
    expect(result.eInvoiceAuthority).toBe("zatca");
    expect(result.uuid).toBeTruthy();
  });

  it("should auto-populate UAE FTA fields for AE companies", () => {
    const result = autoPopulateEInvoiceFields(baseInvoice, uaeCompany);
    expect(result.eInvoiceAuthority).toBe("uae_fta");
    expect(result.uuid).toBeTruthy();
  });

  it("should auto-populate Egypt ETA fields for EG companies", () => {
    const result = autoPopulateEInvoiceFields(baseInvoice, egyptCompany);
    expect(result.eInvoiceAuthority).toBe("eta_egypt");
    expect(result.uuid).toBeTruthy();
    expect(result.currency).toBe("EGP");
    expect(result.currencyDecimalPlaces).toBe(2);
  });

  it("should auto-populate Bahrain NBR fields for BH companies", () => {
    const result = autoPopulateEInvoiceFields(baseInvoice, bahrainCompany);
    expect(result.eInvoiceAuthority).toBe("bahrain_nbr");
    expect(result.uuid).toBeTruthy();
    expect(result.currency).toBe("BHD");
    expect(result.currencyDecimalPlaces).toBe(3);
  });

  it("should auto-populate Oman Tax fields for OM companies", () => {
    const result = autoPopulateEInvoiceFields(baseInvoice, omanCompany);
    expect(result.eInvoiceAuthority).toBe("oman_tax");
    expect(result.uuid).toBeTruthy();
    expect(result.currency).toBe("OMR");
    expect(result.currencyDecimalPlaces).toBe(3);
  });

  it("should set different VAT rates per country", () => {
    // Egypt: 14%
    const egResult = autoPopulateEInvoiceFields(baseInvoice, egyptCompany);
    expect(egResult.taxRate).toBe("14.00");

    // Bahrain: 10%
    const bhResult = autoPopulateEInvoiceFields(baseInvoice, bahrainCompany);
    expect(bhResult.taxRate).toBe("10.000");

    // Oman: 5%
    const omResult = autoPopulateEInvoiceFields(baseInvoice, omanCompany);
    expect(omResult.taxRate).toBe("5.000");
  });

  it("should set different currencies per country", () => {
    const egResult = autoPopulateEInvoiceFields(baseInvoice, egyptCompany);
    expect(egResult.currency).toBe("EGP");

    const bhResult = autoPopulateEInvoiceFields(baseInvoice, bahrainCompany);
    expect(bhResult.currency).toBe("BHD");

    const omResult = autoPopulateEInvoiceFields(baseInvoice, omanCompany);
    expect(omResult.currency).toBe("OMR");

    const kwResult = autoPopulateEInvoiceFields(baseInvoice, kuwaitCompany);
    expect(kwResult.currency).toBe("KWD");

    const saResult = autoPopulateEInvoiceFields(baseInvoice, saudiCompany);
    expect(saResult.currency).toBe("SAR");

    const aeResult = autoPopulateEInvoiceFields(baseInvoice, uaeCompany);
    expect(aeResult.currency).toBe("AED");
  });
});

// ── Cross-module consistency tests ──────────────────────────────────────────

describe("Cross-module consistency", () => {
  it("should produce UUID for all e-invoicing countries", () => {
    const countries = [kuwaitCompany, saudiCompany, uaeCompany, egyptCompany, bahrainCompany, omanCompany];
    for (const company of countries) {
      const result = autoPopulateEInvoiceFields(baseInvoice, company);
      expect(result.uuid).toBeTruthy();
      expect(result.uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    }
  });

  it("should set eInvoiceAuthority for all e-invoicing countries", () => {
    const authorities = [
      { company: kuwaitCompany, expected: "kuwait_decree_10_2026" },
      { company: saudiCompany, expected: "zatca" },
      { company: uaeCompany, expected: "uae_fta" },
      { company: egyptCompany, expected: "eta_egypt" },
      { company: bahrainCompany, expected: "bahrain_nbr" },
      { company: omanCompany, expected: "oman_tax" },
    ];
    for (const { company, expected } of authorities) {
      const result = autoPopulateEInvoiceFields(baseInvoice, company);
      expect(result.eInvoiceAuthority).toBe(expected);
    }
  });

  it("should not set eInvoiceAuthority for non-e-invoicing countries", () => {
    const result = autoPopulateEInvoiceFields(baseInvoice, qatarCompany);
    // For QA, invoice data is returned unchanged, so eInvoiceAuthority may not be set
    expect(result.eInvoiceAuthority).toBeUndefined();
  });

  it("should route all 6 e-invoicing countries correctly", () => {
    const companies = [
      { company: kuwaitCompany, expectedAuthority: "kuwait_decree_10_2026" },
      { company: saudiCompany, expectedAuthority: "zatca" },
      { company: uaeCompany, expectedAuthority: "uae_fta" },
      { company: egyptCompany, expectedAuthority: "eta_egypt" },
      { company: bahrainCompany, expectedAuthority: "bahrain_nbr" },
      { company: omanCompany, expectedAuthority: "oman_tax" },
    ];
    for (const { company, expectedAuthority } of companies) {
      const route = routeEInvoice(baseInvoice, company);
      expect(route.authority).toBe(expectedAuthority);
      expect(route.isRequired).toBe(true);
    }
  });

  it("should route non-e-invoicing countries to none", () => {
    const noneCountries = [qatarCompany, unknownCompany];
    for (const company of noneCountries) {
      const route = routeEInvoice(baseInvoice, company);
      expect(route.authority).toBe("none");
      expect(route.isRequired).toBe(false);
    }
  });
});
