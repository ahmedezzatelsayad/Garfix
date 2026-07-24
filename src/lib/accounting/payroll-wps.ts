/**
 * payroll-wps.ts — WPS (Wage Protection System) file generation per Gulf country
 * and payroll calculation engine.
 *
 * Phase 4 of the GarfiX ERP accounting module.
 * All monetary values as String (no Float), using num() from money.ts.
 */
import { db } from "@/lib/db";
import { num, addNums, subNums, mulNums } from "@/lib/money";
import { getCountryConfig, getCurrencyDecimalPlaces } from "@/lib/gulfConfig";
import { calculateGratuity } from "@/lib/gratuity";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

interface EmployeeForPayroll {
  id: number;
  name: string;
  nameEn: string | null;
  phone: string | null;
  email: string | null;
  position: string | null;
  department: string | null;
  baseSalary: string;
  allowances: string;
  currency: string;
  joinDate: string | null;
  endDate: string | null;
  isActive: boolean;
  notes: string | null;
  civilId: string | null;
  nationality: string | null;
  residenceExpiry: string | null;
  passportNumber: string | null;
  bankAccount: string | null;
  companySlug: string;
}

interface SalaryForPayroll {
  id: number;
  companySlug: string;
  employeeId: number;
  month: string;
  baseSalary: string;
  allowances: string;
  deductions: string;
  bonus: string;
  netSalary: string;
  isPaid: boolean;
  paidAt: Date | null;
  notes: string | null;
}

interface CommissionForPayroll {
  id: number;
  companySlug: string;
  employeeId: number;
  date: string;
  type: string;
  description: string | null;
  amount: string;
  isPaid: boolean;
}

interface LeaveRequestForPayroll {
  id: number;
  companySlug: string;
  employeeId: number;
  startDate: string;
  endDate: string;
  type: string;
  status: string;
  reason: string | null;
  approvedBy: string | null;
}

interface WpsCalculationItem {
  employee: EmployeeForPayroll;
  netSalary: NetSalaryResult;
}

// ────────────────────────────────────────────────────────────────────────────
// Social Insurance Calculations
// ────────────────────────────────────────────────────────────────────────────

export interface SocialInsuranceResult {
  employeePortion: string;
  employerPortion: string;
  total: string;
  country: string;
  formula: string;
}

interface SocialInsuranceRate {
  employeeRate: number; // percentage of base
  employerRate: number;
  base: "basic" | "basic_plus_housing"; // what the rate applies to
  formulaAr: string;
}

const SOCIAL_INSURANCE_RATES: Record<string, SocialInsuranceRate> = {
  KW: {
    employeeRate: 5.5,
    employerRate: 11,
    base: "basic",
    formulaAr: "PIFSS: الموظف 5.5% من الراتب الأساسي، المؤسسة 11%",
  },
  SA: {
    employeeRate: 9.75,
    employerRate: 11.75,
    base: "basic_plus_housing",
    formulaAr: "GOSI: الموظف 9.75% من (الأساسي + السكن)، المؤسسة 11.75%",
  },
  AE: {
    employeeRate: 5,
    employerRate: 12.5,
    base: "basic",
    formulaAr: "GPSSA: الموظف 5% من الراتب الأساسي، المؤسسة 12.5%",
  },
  BH: {
    employeeRate: 5,
    employerRate: 12,
    base: "basic",
    formulaAr: "SIO: الموظف 5% من الراتب الأساسي، المؤسسة 12%",
  },
  OM: {
    employeeRate: 6.5,
    employerRate: 11.5,
    base: "basic",
    formulaAr: "PASI: الموظف 6.5% من الراتب الأساسي، المؤسسة 11.5%",
  },
  QA: {
    employeeRate: 5,
    employerRate: 10,
    base: "basic",
    formulaAr: "QRS: الموظف 5% من الراتب الأساسي، المؤسسة 10%",
  },
};

/**
 * Calculate social insurance contributions for an employee in a given country.
 */
export function calculateSocialInsurance(
  employee: { baseSalary: string; allowances: string },
  country: string,
): SocialInsuranceResult {
  const rate = SOCIAL_INSURANCE_RATES[country] || SOCIAL_INSURANCE_RATES.KW;
  const config = getCountryConfig(country);
  const decimals = config?.currencyDecimalPlaces ?? 3;

  let baseAmount: number;
  if (rate.base === "basic_plus_housing") {
    // For SA: base = basic + housing portion of allowances
    baseAmount = num(employee.baseSalary, decimals) + num(employee.allowances, decimals) * 0.4;
  } else {
    baseAmount = num(employee.baseSalary, decimals);
  }

  const employeePortion = num(baseAmount * rate.employeeRate / 100, decimals);
  const employerPortion = num(baseAmount * rate.employerRate / 100, decimals);
  const total = num(employeePortion + employerPortion, decimals);

  return {
    employeePortion: employeePortion.toFixed(decimals),
    employerPortion: employerPortion.toFixed(decimals),
    total: total.toFixed(decimals),
    country,
    formula: rate.formulaAr,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Net Salary Calculation
// ────────────────────────────────────────────────────────────────────────────

export interface NetSalaryResult {
  grossSalary: string;
  basicSalary: string;
  housingAllowance: string;
  transportAllowance: string;
  otherAllowances: string;
  socialInsurance: SocialInsuranceResult;
  totalDeductions: string;
  netSalary: string;
  gratuityProvision: string;
  overtime: string;
  bonus: string;
}

/**
 * Calculate net salary for an employee for a given month.
 *
 * Formula:
 *   grossSalary = basic + allowances (housing, transport, etc.)
 *   - social insurance employee portion
 *   - salary advances/loans
 *   - leave deductions
 *   + overtime/bonus
 */
export async function calculateNetSalary(
  employeeId: number,
  country: string,
  month: string,
): Promise<NetSalaryResult> {
  const employee = await db.employee.findUnique({
    where: { id: employeeId },
  });

  if (!employee) throw new Error("Employee not found");

  const config = getCountryConfig(country);
  const decimals = config?.currencyDecimalPlaces ?? 3;

  const basicSalary = num(employee.baseSalary, decimals);
  const totalAllowances = num(employee.allowances, decimals);

  // Split allowances: housing (40%), transport (15%), other (45%) — typical Gulf split
  const housingAllowance = num(totalAllowances * 0.4, decimals);
  const transportAllowance = num(totalAllowances * 0.15, decimals);
  const otherAllowances = num(totalAllowances - housingAllowance - transportAllowance, decimals);

  // Get salary record for the month
  const salaryRecord = await db.hRSalary.findFirst({
    where: { employeeId, month, companySlug: employee.companySlug },
  });

  // Get unpaid commissions for the month
  const commissions = await db.hRCommission.findMany({
    where: {
      employeeId,
      companySlug: employee.companySlug,
      date: { startsWith: `${month}` },
      isPaid: false,
    },
  });

  // Overtime and bonus
  let overtime = 0;
  let bonus = 0;
  if (salaryRecord) {
    bonus = num(salaryRecord.bonus, decimals);
  }
  for (const comm of commissions) {
    bonus += num(comm.amount, decimals);
  }

  const grossSalary = num(basicSalary + totalAllowances + overtime + bonus, decimals);

  // Social insurance
  const socialInsurance = calculateSocialInsurance(
    { baseSalary: employee.baseSalary, allowances: employee.allowances },
    country,
  );

  // Leave deductions (placeholder — unpaid leave calculation)
  let leaveDeductions = 0;

  // Salary advances (from existing deductions)
  let advances = 0;
  if (salaryRecord) {
    advances = num(salaryRecord.deductions, decimals);
  }

  const totalDeductions = num(
    num(socialInsurance.employeePortion, decimals) + leaveDeductions + advances,
    decimals,
  );

  const netSalary = num(grossSalary - totalDeductions, decimals);

  // Gratuity provision (monthly accrual)
  let gratuityProvision = 0;
  if (employee.joinDate) {
    const gratuityResult = calculateGratuity({
      joinDate: employee.joinDate,
      endDate: null, // ongoing
      monthlySalary: num(basicSalary + housingAllowance, decimals),
      countryCode: country,
    });
    // Monthly provision = total gratuity / months of service
    const monthsOfService = gratuityResult.totalDays / 30;
    if (monthsOfService > 0) {
      gratuityProvision = num(gratuityResult.gratuityAmount / monthsOfService, decimals);
    }
  }

  return {
    grossSalary: grossSalary.toFixed(decimals),
    basicSalary: basicSalary.toFixed(decimals),
    housingAllowance: housingAllowance.toFixed(decimals),
    transportAllowance: transportAllowance.toFixed(decimals),
    otherAllowances: otherAllowances.toFixed(decimals),
    socialInsurance,
    totalDeductions: totalDeductions.toFixed(decimals),
    netSalary: netSalary.toFixed(decimals),
    gratuityProvision: gratuityProvision.toFixed(decimals),
    overtime: overtime.toFixed(decimals),
    bonus: bonus.toFixed(decimals),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// WPS File Generation
// ────────────────────────────────────────────────────────────────────────────

export interface WpsFileResult {
  fileName: string;
  fileContent: string;
  totalEmployees: number;
  totalAmount: string;
  country: string;
  month: string;
}

/**
 * Generate WPS file for a company and month, per country-specific format.
 */
export async function generateWpsFile(
  companySlug: string,
  country: string,
  month: string,
): Promise<WpsFileResult> {
  // Get company info
  const company = await db.company.findUnique({
    where: { slug: companySlug },
  });
  if (!company) throw new Error("Company not found");

  // Get all active employees
  const employees = await db.employee.findMany({
    where: {
      companySlug,
      isActive: true,
    },
    orderBy: { id: "asc" },
  });

  if (employees.length === 0) throw new Error("No active employees found");

  const config = getCountryConfig(country);
  const decimals = config?.currencyDecimalPlaces ?? 3;
  const currency = config?.currency || "KWD";

  let fileContent: string;
  let fileName: string;
  let totalAmount = 0;

  // Calculate net salary for each employee
  const calculations: WpsCalculationItem[] = [];

  for (const emp of employees) {
    const salaryResult = await calculateNetSalary(emp.id, country, month);
    calculations.push({ employee: emp, netSalary: salaryResult });
    totalAmount += num(salaryResult.netSalary, decimals);
  }

  switch (country) {
    case "KW":
      fileName = `WPS_KW_${companySlug}_${month}.txt`;
      fileContent = generateKwWps(calculations, company, month, decimals);
      break;

    case "SA":
      fileName = `WPS_SA_${companySlug}_${month}.txt`;
      fileContent = generateSaWps(calculations, company, month, decimals);
      break;

    case "AE":
      fileName = `WPS_AE_${companySlug}_${month}.txt`;
      fileContent = generateAeWps(calculations, company, month, decimals);
      break;

    default:
      fileName = `WPS_${country}_${companySlug}_${month}.txt`;
      fileContent = generateGenericWps(calculations, company, month, country, decimals);
      break;
  }

  // Create or update WpsFile record
  const existingFile = await db.wpsFile.findUnique({
    where: {
      companySlug_country_month: { companySlug, country, month },
    },
  });

  if (existingFile) {
    await db.wpsFile.update({
      where: { id: existingFile.id },
      data: {
        fileName,
        fileContent,
        totalEmployees: employees.length,
        totalAmount: num(totalAmount, decimals).toFixed(decimals),
        status: "draft",
      },
    });
  } else {
    await db.wpsFile.create({
      data: {
        companySlug,
        country,
        month,
        fileName,
        fileContent,
        totalEmployees: employees.length,
        totalAmount: num(totalAmount, decimals).toFixed(decimals),
        status: "draft",
      },
    });
  }

  return {
    fileName,
    fileContent,
    totalEmployees: employees.length,
    totalAmount: num(totalAmount, decimals).toFixed(decimals),
    country,
    month,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Country-specific WPS format generators
// ────────────────────────────────────────────────────────────────────────────

function generateKwWps(
  calculations: WpsCalculationItem[],
  company: { slug: string; name: string; nameAr?: string | null },
  month: string,
  decimals: number,
): string {
  // Kuwait Central Bank format:
  // Header: Company info
  // Each line: civilId | nameAr | nameEn | basicSalary | allowances | netSalary | bankAccount | iban
  const lines: string[] = [];

  // Header
  lines.push(`H|${company.name}|${company.slug}|${month}|${calculations.length}|KWD`);
  lines.push("");

  // Data lines
  for (const calc of calculations) {
    const emp = calc.employee;
    const salary = calc.netSalary;
    const civilId = emp.civilId || "UNKNOWN";
    const nameAr = emp.name || "";
    const nameEn = emp.nameEn || "";
    const bankAccount = emp.bankAccount || "";
    const iban = ""; // IBAN would come from bank account record

    lines.push(
      `D|${civilId}|${nameAr}|${nameEn}|${salary.basicSalary}|${salary.housingAllowance}|${salary.transportAllowance}|${salary.otherAllowances}|${salary.socialInsurance.employeePortion}|${salary.totalDeductions}|${salary.netSalary}|${bankAccount}|${iban}`,
    );
  }

  // Footer
  lines.push("");
  const totalNet = calculations.reduce((sum, c) => sum + num(c.netSalary.netSalary, decimals), 0);
  lines.push(`F|${calculations.length}|${num(totalNet, decimals).toFixed(decimals)}`);

  return lines.join("\n");
}

function generateSaWps(
  calculations: WpsCalculationItem[],
  company: { slug: string; name: string; nameAr?: string | null },
  month: string,
  decimals: number,
): string {
  // Saudi MHRSD format:
  // Each line: employeeId | name | basic | housing | transport | net | bankAccount
  const lines: string[] = [];

  // Header
  lines.push(`HEADER|${company.name}|${month}|${calculations.length}|SAR`);

  for (const calc of calculations) {
    const emp = calc.employee;
    const salary = calc.netSalary;
    const bankAccount = emp.bankAccount || "";

    lines.push(
      `DATA|${emp.id}|${emp.name}|${emp.nameEn || ""}|${salary.basicSalary}|${salary.housingAllowance}|${salary.transportAllowance}|${salary.socialInsurance.employeePortion}|${salary.totalDeductions}|${salary.netSalary}|${bankAccount}`,
    );
  }

  const totalNet = calculations.reduce((sum, c) => sum + num(c.netSalary.netSalary, decimals), 0);
  lines.push(`FOOTER|${calculations.length}|${num(totalNet, decimals).toFixed(decimals)}`);

  return lines.join("\n");
}

function generateAeWps(
  calculations: WpsCalculationItem[],
  company: { slug: string; name: string; nameAr?: string | null },
  month: string,
  decimals: number,
): string {
  // UAE Ministry of Human Resources format:
  // Each line: employee name | basic | allowances | deductions | net | bankAccount
  const lines: string[] = [];

  // Header
  lines.push(`HDR|${company.name}|${company.slug}|${month}|AED`);
  lines.push(`COUNT|${calculations.length}`);

  for (const calc of calculations) {
    const emp = calc.employee;
    const salary = calc.netSalary;
    const bankAccount = emp.bankAccount || "";

    lines.push(
      `EMP|${emp.name}|${emp.nameEn || ""}|${emp.id}|${salary.basicSalary}|${salary.grossSalary}|${salary.totalDeductions}|${salary.netSalary}|${bankAccount}`,
    );
  }

  const totalNet = calculations.reduce((sum, c) => sum + num(c.netSalary.netSalary, decimals), 0);
  lines.push(`TOT|${num(totalNet, decimals).toFixed(decimals)}`);

  return lines.join("\n");
}

function generateGenericWps(
  calculations: WpsCalculationItem[],
  company: { slug: string; name: string; nameAr?: string | null },
  month: string,
  country: string,
  decimals: number,
): string {
  // Generic CSV format
  const lines: string[] = [];
  lines.push("employee_id,name_ar,name_en,basic_salary,allowances,deductions,net_salary,bank_account");

  for (const calc of calculations) {
    const emp = calc.employee;
    const salary = calc.netSalary;
    const bankAccount = emp.bankAccount || "";

    lines.push(
      `${emp.id},"${emp.name}","${emp.nameEn || ""}",${salary.basicSalary},${salary.housingAllowance},${salary.totalDeductions},${salary.netSalary},"${bankAccount}"`,
    );
  }

  return lines.join("\n");
}
