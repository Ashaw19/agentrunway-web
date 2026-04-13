"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  FileText, Download, Plus, Trash2, ChevronDown, ChevronUp,
  Info, CheckCircle2, AlertTriangle, Edit3, Building2,
  Car, Home, Calculator, Receipt, CreditCard, RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { fmtCurrency, fmtPct } from "@/lib/formatters";
import { PROVINCE_LABELS, CCA_CLASSES } from "@/lib/types/database";
import type { UserSettings, Transaction, CcaAsset } from "@/lib/types/database";
import { computeT2125 } from "@/lib/engines/t2125-engine";
import type { T2125Result } from "@/lib/engines/t2125-engine";
import { generateTaxOptimizations } from "@/lib/engines/tax-optimization-engine";
import { T2125Pdf } from "@/components/pdf/t2125-pdf";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

// ── Props ─────────────────────────────────────────────────────────────────────

interface MileageLogRow {
  km: number;
  deduction: number;
  trip_date: string;
}

interface Props {
  settings: UserSettings | null;
  transactions: Transaction[];
  expenseAmounts: Record<string, number>;
  ccaAssets: CcaAsset[];
  mileageLogs: MileageLogRow[];
  taxYear: number;
  userId: string;
  referralSummary?: { inboundCount: number; outboundCount: number; feesEarned: number; feesPaid: number };
}

// ── Section header ─────────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  label,
  subtitle,
  color = "text-blue-600",
}: {
  icon: React.ElementType;
  label: string;
  subtitle?: string;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-3 pt-2 pb-1">
      <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg bg-current/10", color)}>
        <Icon className={cn("h-4 w-4", color)} />
      </div>
      <div>
        <p className="text-sm font-bold uppercase tracking-wide text-foreground">{label}</p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

// ── Line row ──────────────────────────────────────────────────────────────────

function LineRow({
  lineNum,
  label,
  value,
  note,
  highlight = false,
  indent = false,
  bold = false,
}: {
  lineNum?: string;
  label: string;
  value: number;
  note?: string;
  highlight?: boolean;
  indent?: boolean;
  bold?: boolean;
}) {
  return (
    <div className={cn(
      "flex items-start justify-between py-1.5 px-3 rounded-md text-sm",
      highlight ? "bg-amber-50 border border-amber-200" : "hover:bg-muted/30",
      indent && "ml-4",
    )}>
      <div className="flex items-start gap-2">
        {lineNum && (
          <span className="mt-0.5 shrink-0 text-[10px] font-mono text-muted-foreground/60 w-10">{lineNum}</span>
        )}
        <div>
          <span className={cn("text-sm", bold ? "font-semibold text-foreground" : "text-foreground/80")}>
            {label}
          </span>
          {note && <p className="text-[10px] text-amber-600 mt-0.5">{note}</p>}
        </div>
      </div>
      <span className={cn("tabular-nums shrink-0 ml-4", bold ? "font-bold text-lg" : "font-medium", value < 0 ? "text-red-600" : "")}>
        {fmtCurrency(Math.abs(value))}
      </span>
    </div>
  );
}

// ── Editable amount field ─────────────────────────────────────────────────────

function EditableAmount({
  label,
  value,
  onChange,
  note,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  note?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium">{label}</Label>
      <Input
        type="number"
        min={0}
        step={0.01}
        value={value || ""}
        placeholder="0.00"
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="h-8 text-sm"
      />
      {note && <p className="text-[10px] text-muted-foreground">{note}</p>}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function ReportsT2125Tab({
  settings,
  transactions,
  expenseAmounts,
  ccaAssets: initialCcaAssets,
  mileageLogs,
  taxYear,
  userId,
  referralSummary: _referralSummary,
}: Props) {
  const router = useRouter();
  const supabase = createClient();

  // ── State: user-editable overrides ─────────────────────────────────────────
  const [otherIncome, setOtherIncome] = useState(0);
  const [ccaAssets, setCcaAssets] = useState<CcaAsset[]>(initialCcaAssets);
  const [showCcaForm, setShowCcaForm] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    income: true, expenses: true, vehicle: true, meals: true,
    professional: true, cca: true, homeOffice: true, gstHst: true, instalments: true,
  });
  const [saving, setSaving] = useState(false);
  const [addingAsset, setAddingAsset] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  // Home office and GST/HST edits pulled from settings (live-editable)
  const [localSettings, setLocalSettings] = useState<UserSettings | null>(settings);

  const toggle = (section: string) =>
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));

  // ── Compute T2125 ────────────────────────────────────────────────────────────
  const result: T2125Result | null = useMemo(() => {
    if (!localSettings) return null;
    return computeT2125({
      settings: localSettings,
      transactions,
      expenseAmounts,
      ccaAssets,
      taxYear,
      otherIncome,
    });
  }, [localSettings, transactions, expenseAmounts, ccaAssets, taxYear, otherIncome]);

  // ── Save settings changes to Supabase ────────────────────────────────────────
  const saveSettings = useCallback(async (updates: Partial<UserSettings>) => {
    if (!localSettings) return;
    setSaving(true);
    const merged = { ...localSettings, ...updates };
    setLocalSettings(merged);
    const { error } = await supabase
      .from("user_settings")
      .update(updates)
      .eq("user_id", userId);
    setSaving(false);
    if (error) toast.error("Failed to save your tax data. Please try again.");
    else toast.success("Saved");
  }, [localSettings, supabase, userId]);

  // ── Add CCA asset ─────────────────────────────────────────────────────────
  const [newAsset, setNewAsset] = useState({
    description: "",
    cca_class: 10,
    class_rate: 0.30,
    class_half_year: true,
    acquisition_date: `${taxYear}-01-01`,
    original_cost: 0,
    business_use_pct: 1,
    opening_ucc: 0,
    additions_this_year: 0,
    disposals_this_year: 0,
    cca_claimed_prior: 0,
  });

  const addCcaAsset = async () => {
    if (!newAsset.description || newAsset.original_cost <= 0) {
      toast.error("Enter a description and cost");
      return;
    }
    setAddingAsset(true);
    const { data, error } = await supabase
      .from("t2125_cca_assets")
      .insert({ ...newAsset, user_id: userId })
      .select()
      .maybeSingle();
    setAddingAsset(false);
    if (error) { toast.error("Failed to save your tax data. Please try again."); return; }
    if (data) {
      setCcaAssets((prev) => [...prev, data]);
      setNewAsset({
        description: "", cca_class: 10, class_rate: 0.30, class_half_year: true,
        acquisition_date: `${taxYear}-01-01`, original_cost: 0, business_use_pct: 1,
        opening_ucc: 0, additions_this_year: 0, disposals_this_year: 0, cca_claimed_prior: 0,
      });
      setShowCcaForm(false);
      toast.success("Asset added");
    }
  };

  const deleteCcaAsset = async (id: string) => {
    const { error } = await supabase.from("t2125_cca_assets").delete().eq("id", id).eq("user_id", userId);
    if (error) { toast.error("Failed to save your tax data. Please try again."); return; }
    setCcaAssets((prev) => prev.filter((a) => a.id !== id));
    toast.success("Asset removed");
  };

  // ── Export PDF ─────────────────────────────────────────────────────────────
  const handleExportPdf = async () => {
    if (!result || !localSettings) return;
    setExportingPdf(true);
    try {
      // Compute mileage summary from logs for this tax year
      const yearLogs = mileageLogs.filter((l) => l.trip_date.startsWith(String(taxYear)));
      const totalKm = yearLogs.reduce((sum, l) => sum + l.km, 0);
      const totalDeduction = yearLogs.reduce((sum, l) => sum + l.deduction, 0);
      const mileageSummary = yearLogs.length > 0 ? {
        totalKm,
        totalDeduction,
        tripCount: yearLogs.length,
        businessUsePct: localSettings.vehicle_business_use_pct ?? 1,
      } : undefined;

      // Compute tax optimization cards
      const projectedGCI = result.totalGrossIncome;
      const totalExpenses = result.line9369_totalExpenses + result.line9936_totalCca + result.line9945_homeOfficeDeduction;
      const netIncome = result.line8270_netBusinessIncome;
      const gstRemitted = (localSettings.gst_hst_remitted_q1 ?? 0) +
        (localSettings.gst_hst_remitted_q2 ?? 0) +
        (localSettings.gst_hst_remitted_q3 ?? 0) +
        (localSettings.gst_hst_remitted_q4 ?? 0);
      const taxInstalments = (localSettings.tax_instalment_paid_q1 ?? 0) +
        (localSettings.tax_instalment_paid_q2 ?? 0) +
        (localSettings.tax_instalment_paid_q3 ?? 0) +
        (localSettings.tax_instalment_paid_q4 ?? 0);

      const optResult = generateTaxOptimizations({
        netIncome,
        projectedGCI,
        annualExpenses: totalExpenses,
        dealCount: transactions.length,
        province: localSettings.province,
        experienceYears: localSettings.experience_years ?? null,
        isIncorporated: localSettings.is_incorporated ?? false,
        corpType: (localSettings.corp_type as "prec" | "general" | null) ?? null,
        compensationMethod: (localSettings.compensation_method as "salary" | "dividends" | "mixed") ?? "salary",
        homeOfficeSqFootage: localSettings.home_office_sq_footage ?? null,
        homeOfficeBusinessUsePct: localSettings.home_office_business_use_pct ?? 0,
        homeOfficeRentMonthly: localSettings.home_office_rent_monthly ?? 0,
        homeOfficeUtilitiesMonthly: localSettings.home_office_utilities_monthly ?? 0,
        homeOfficePropertyTaxAnnual: localSettings.home_office_property_tax_annual ?? 0,
        homeOfficeInsuranceMonthly: localSettings.home_office_insurance_monthly ?? 0,
        homeOfficeMaintenanceAnnual: localSettings.home_office_maintenance_annual ?? 0,
        homeOfficeCondoFeesMonthly: localSettings.home_office_condo_fees_monthly ?? 0,
        vehicleType: (localSettings.vehicle_type as "own" | "lease" | "none") ?? "own",
        vehicleBusinessUsePct: localSettings.vehicle_business_use_pct ?? 0,
        hasTrackedMileage: totalKm > 0,
        annualMileageKm: totalKm,
        gstHstRegistered: localSettings.gst_hst_registered ?? false,
        gstHstPaidOnExpenses: localSettings.gst_hst_paid_on_expenses ?? 0,
        gstHstRemitted: gstRemitted,
        taxInstalmentsPaid: taxInstalments,
        cppInstalmentPaidYTD: localSettings.cpp_instalment_paid_ytd ?? 0,
        hasProfDevExpenses: (expenseAmounts["professional_development"] ?? 0) > 0,
        hasMarketingExpenses: (expenseAmounts["marketing"] ?? 0) > 0,
        hasClientGiftExpenses: (expenseAmounts["client_gifts"] ?? 0) > 0,
        hasMealExpenses: (expenseAmounts["meals_entertainment"] ?? 0) > 0,
        hasLicensingExpenses: (expenseAmounts["licenses_dues"] ?? 0) > 0,
        ccaAssetCount: ccaAssets.length,
        dismissed: [],
      });

      const { pdf } = await import("@react-pdf/renderer");
      const blob = await pdf(
        <T2125Pdf
          result={result}
          settings={localSettings}
          taxYear={taxYear}
          mileageSummary={mileageSummary}
          taxOptCards={optResult.cards}
          totalEstimatedSavings={optResult.totalEstimatedSavings}
        />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `t2125-summary-${localSettings.display_name || "agent"}-${taxYear}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error("PDF export failed");
      console.error(e);
    }
    setExportingPdf(false);
  };

  if (!localSettings) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Complete your Settings to generate a T2125 summary.</p>
      </div>
    );
  }

  if (!result) return null;

  return (
    <div className="space-y-6 p-6 max-w-4xl mx-auto">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">T2125 Summary</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Statement of Business Activities · {taxYear} · Pre-filled from your Agent Runway data
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.refresh()}
            disabled={saving}
            className="gap-2"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", saving && "animate-spin")} />
            Refresh
          </Button>
          <Button
            onClick={handleExportPdf}
            disabled={exportingPdf}
            size="sm"
            className="gap-2"
          >
            <Download className="h-3.5 w-3.5" />
            {exportingPdf ? "Generating…" : "Export for Accountant"}
          </Button>
        </div>
      </div>

      {/* ── Disclaimer banner ── */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="text-sm text-amber-800">
          <strong>Estimates only — not a filed T2125.</strong> Values are pre-filled from your
          Agent Runway data as a starting point for your accountant. Review every line,
          especially CCA, home office, and GST/HST. Always have a qualified accountant
          prepare and file your actual T2125 with CRA.{" "}
          <a href="/terms" className="underline">Terms of Service</a>.
        </div>
      </div>

      {/* ── Identification ── */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <SectionHeader icon={FileText} label="Identification" color="text-blue-600" />
            <Badge variant="outline" className="text-xs">NAICS 531210 — Real Estate Agents</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 text-sm">
            <div className="flex justify-between rounded-md bg-muted/30 px-3 py-2">
              <span className="text-muted-foreground">Agent Name</span>
              <span className="font-medium">{result.agentName || "—"}</span>
            </div>
            <div className="flex justify-between rounded-md bg-muted/30 px-3 py-2">
              <span className="text-muted-foreground">Province</span>
              <span className="font-medium">{PROVINCE_LABELS[localSettings.province] ?? localSettings.province}</span>
            </div>
            <div className="flex justify-between rounded-md bg-muted/30 px-3 py-2">
              <span className="text-muted-foreground">Business Name</span>
              <span className="font-medium">{result.businessName || "—"}</span>
            </div>
            <div className="flex justify-between rounded-md bg-muted/30 px-3 py-2">
              <span className="text-muted-foreground">GST/HST #</span>
              <span className="font-medium">{result.businessNumber || "Not entered"}</span>
            </div>
            <div className="flex justify-between rounded-md bg-muted/30 px-3 py-2">
              <span className="text-muted-foreground">Fiscal Year</span>
              <span className="font-medium">Jan 1 – Dec 31, {taxYear}</span>
            </div>
            <div className="flex justify-between rounded-md bg-muted/30 px-3 py-2">
              <span className="text-muted-foreground">Industry Code</span>
              <span className="font-medium">531210</span>
            </div>
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Edit3 className="h-3 w-3" />
            Edit your name, business name, and GST/HST number in{" "}
            <a href="/settings" className="underline">Settings</a>.
          </p>
        </CardContent>
      </Card>

      {/* ── Part 3A: Income ── */}
      <Card className="rounded-2xl">
        <CardHeader
          className="cursor-pointer pb-3"
          onClick={() => toggle("income")}
        >
          <div className="flex items-center justify-between">
            <SectionHeader
              icon={Receipt}
              label="Income (Line 8200)"
              subtitle="Gross commission income from closed deals"
              color="text-emerald-600"
            />
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-emerald-700">
                {fmtCurrency(result.totalGrossIncome)}
              </span>
              {expandedSections.income ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>
          </div>
        </CardHeader>
        {expandedSections.income && (
          <CardContent className="pt-0">
            <LineRow
              lineNum="8200"
              label="Gross Commission Income"
              value={result.grossCommissionIncome}
              note={`${transactions.filter(tx => tx.status === "closed").length} closed deals`}
            />
            <div className="mt-3 px-3">
              <EditableAmount
                label="Other business income (referrals, etc.)"
                value={otherIncome}
                onChange={setOtherIncome}
                note="Add any income not captured in transactions (referral fees, other sources)"
              />
            </div>
            <Separator className="my-3" />
            <LineRow
              lineNum="8200"
              label="Total Gross Income"
              value={result.totalGrossIncome}
              bold
              highlight
            />
          </CardContent>
        )}
      </Card>

      {/* ── Part 3B: Expenses ── */}
      <Card className="rounded-2xl">
        <CardHeader
          className="cursor-pointer pb-3"
          onClick={() => toggle("expenses")}
        >
          <div className="flex items-center justify-between">
            <SectionHeader
              icon={CreditCard}
              label="Deductible Expenses (Lines 8521–9369)"
              subtitle="Auto-filled from your expense tracking"
              color="text-violet-600"
            />
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-violet-700">
                {fmtCurrency(result.line9369_totalExpenses)}
              </span>
              {expandedSections.expenses ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>
          </div>
        </CardHeader>
        {expandedSections.expenses && (
          <CardContent className="pt-0 space-y-1">
            <LineRow lineNum="8521" label="Advertising & Marketing" value={result.line8521_advertising} />
            <LineRow lineNum="8811" label="Office Supplies & Software" value={result.line8811_officeSupplies} />
            <LineRow lineNum="9220" label="Utilities (Phone, Internet)" value={result.line9220_utilities} />
            <LineRow lineNum="9270" label="Other Expenses (Gifts, Education)" value={result.line9270_otherExpenses} />
            <LineRow lineNum="8760" label="Licences, Memberships & Dues" value={result.line8760_licencesMemberships} />
            {result.line8690_insurance > 0 && (
              <LineRow lineNum="8690" label="Insurance (E&O)" value={result.line8690_insurance} />
            )}
            <LineRow lineNum="8860" label="Professional Fees (Accounting & Legal)" value={result.line8860_professionalFees} />

            {/* Vehicle sub-section */}
            <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Car className="h-3.5 w-3.5 text-slate-500" />
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Motor Vehicle (Line 9281) — {fmtPct(localSettings.vehicle_business_use_pct)} business use applied
                </p>
              </div>
              <LineRow indent lineNum="9281" label="All Vehicle Expenses (lease, insurance, fuel, maintenance)" value={result.line9281_motorVehicle} />
              <p className="mt-2 text-[10px] text-muted-foreground">
                Vehicle business-use % set in <a href="/settings" className="underline">Settings</a> ·
                {localSettings.vehicle_type === "own" ? " Owned vehicle" : localSettings.vehicle_type === "lease" ? " Leased vehicle" : " No vehicle"}
              </p>
              <p className="mt-1 text-[10px] text-amber-600/90">
                * Business-use % ({fmtPct(localSettings.vehicle_business_use_pct)}) is user-declared.
                CRA requires a contemporaneous mileage logbook to substantiate this figure.
              </p>
            </div>

            {/* Meals & entertainment */}
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Info className="h-3.5 w-3.5 text-amber-600" />
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                  Meals & Entertainment — 50% Rule Applied
                </p>
              </div>
              <div className="flex justify-between text-xs text-amber-800 mb-1 px-3">
                <span>Gross receipts</span>
                <span>{fmtCurrency(result.line8523_mealsEntertainmentGross)}</span>
              </div>
              <LineRow
                lineNum="8523"
                label="Deductible amount (50% of gross)"
                value={result.line8523_mealsEntertainment50pct}
                note="CRA allows only 50% of meals & entertainment expenses — pre-applied"
              />
            </div>

            <Separator className="my-2" />
            <LineRow lineNum="9369" label="Total Deductible Expenses" value={result.line9369_totalExpenses} bold highlight />
          </CardContent>
        )}
      </Card>

      {/* ── CCA ── */}
      <Card className="rounded-2xl">
        <CardHeader
          className="cursor-pointer pb-3"
          onClick={() => toggle("cca")}
        >
          <div className="flex items-center justify-between">
            <SectionHeader
              icon={Calculator}
              label="Capital Cost Allowance (Line 9936)"
              subtitle="Depreciation on business assets — vehicle, equipment, computers"
              color="text-orange-600"
            />
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-orange-700">
                {fmtCurrency(result.line9936_totalCca)}
              </span>
              {expandedSections.cca ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>
          </div>
        </CardHeader>
        {expandedSections.cca && (
          <CardContent className="pt-0 space-y-3">
            {result.ccaLines.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No CCA assets added yet. Add your vehicle, computer, or office equipment below.
              </p>
            ) : (
              <div className="space-y-2">
                {result.ccaLines.map((line) => (
                  <div
                    key={line.asset.id}
                    className="rounded-lg border bg-muted/20 p-3 text-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{line.asset.description}</p>
                        <p className="text-xs text-muted-foreground">
                          Class {line.asset.cca_class} · {fmtPct(line.asset.class_rate)} rate ·{" "}
                          {fmtPct(line.asset.business_use_pct)} business use ·
                          Acquired {line.asset.acquisition_date}
                        </p>
                      </div>
                      <button
                        onClick={() => deleteCcaAsset(line.asset.id)}
                        className="shrink-0 text-muted-foreground hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Original cost</span>
                        <p className="font-medium">{fmtCurrency(line.asset.original_cost)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">UCC (adj.)</span>
                        <p className="font-medium">{fmtCurrency(line.ucc)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">CCA claimed</span>
                        <p className="font-bold text-orange-700">{fmtCurrency(line.ccaClaimed)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add asset form */}
            {showCcaForm ? (
              <div className="rounded-xl border border-dashed border-orange-300 bg-orange-50/40 p-4 space-y-3">
                <p className="text-sm font-semibold text-orange-800">Add CCA Asset</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Description</Label>
                    <Input
                      value={newAsset.description}
                      onChange={(e) => setNewAsset((p) => ({ ...p, description: e.target.value }))}
                      placeholder="e.g. 2023 Honda CR-V"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">CCA Class</Label>
                    <Select
                      value={String(newAsset.cca_class)}
                      onValueChange={(v) => {
                        const cls = CCA_CLASSES.find((c) => String(c.class) === v);
                        setNewAsset((p) => ({
                          ...p,
                          cca_class: cls?.class ?? 10,
                          class_rate: cls?.rate ?? 0.30,
                          class_half_year: cls?.halfYear ?? true,
                        }));
                      }}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CCA_CLASSES.map((c) => (
                          <SelectItem key={c.class} value={String(c.class)}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <EditableAmount
                    label="Original purchase cost ($)"
                    value={newAsset.original_cost}
                    onChange={(v) => setNewAsset((p) => ({ ...p, original_cost: v, additions_this_year: v, opening_ucc: 0 }))}
                  />
                  <EditableAmount
                    label="Business use % (e.g. 0.80)"
                    value={newAsset.business_use_pct}
                    onChange={(v) => setNewAsset((p) => ({ ...p, business_use_pct: Math.min(1, Math.max(0, v)) }))}
                    note="Enter as decimal: 0.80 = 80%"
                  />
                  <EditableAmount
                    label="Opening UCC (prior year closing UCC)"
                    value={newAsset.opening_ucc}
                    onChange={(v) => setNewAsset((p) => ({ ...p, opening_ucc: v }))}
                    note="$0 if this is a new purchase this year"
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={addCcaAsset} disabled={addingAsset} className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    {addingAsset ? "Adding…" : "Add Asset"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowCcaForm(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCcaForm(true)}
                className="gap-2 border-dashed"
              >
                <Plus className="h-3.5 w-3.5" />
                Add CCA Asset (vehicle, computer, equipment)
              </Button>
            )}

            <Separator />
            <LineRow lineNum="9936" label="Total CCA Deduction" value={result.line9936_totalCca} bold highlight />
          </CardContent>
        )}
      </Card>

      {/* ── Home Office ── */}
      <Card className="rounded-2xl">
        <CardHeader
          className="cursor-pointer pb-3"
          onClick={() => toggle("homeOffice")}
        >
          <div className="flex items-center justify-between">
            <SectionHeader
              icon={Home}
              label="Home Office (Line 9945)"
              subtitle="Business-use-of-home deduction"
              color="text-teal-600"
            />
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-teal-700">
                {fmtCurrency(result.line9945_homeOfficeDeduction)}
              </span>
              {expandedSections.homeOffice ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>
          </div>
        </CardHeader>
        {expandedSections.homeOffice && (
          <CardContent className="pt-0 space-y-4">
            {/* CRA actual-cost method — no simplified method in Canada */}
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                CRA home office deduction uses actual costs multiplied by your business-use percentage (office area ÷ total home area).
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <EditableAmount
                  label="Business-use %"
                  value={localSettings.home_office_business_use_pct}
                  onChange={(v) => saveSettings({ home_office_business_use_pct: Math.min(1, Math.max(0, v)) })}
                  note="Office area ÷ total home area"
                />
                <EditableAmount
                  label="Monthly rent or mortgage interest ($)"
                  value={localSettings.home_office_rent_monthly}
                  onChange={(v) => saveSettings({ home_office_rent_monthly: v })}
                />
                <EditableAmount
                  label="Monthly utilities — heat, hydro, water ($)"
                  value={localSettings.home_office_utilities_monthly}
                  onChange={(v) => saveSettings({ home_office_utilities_monthly: v })}
                />
                <EditableAmount
                  label="Annual property tax ($)"
                  value={localSettings.home_office_property_tax_annual}
                  onChange={(v) => saveSettings({ home_office_property_tax_annual: v })}
                />
                <EditableAmount
                  label="Monthly home insurance ($)"
                  value={localSettings.home_office_insurance_monthly}
                  onChange={(v) => saveSettings({ home_office_insurance_monthly: v })}
                />
                <EditableAmount
                  label="Annual maintenance & repairs ($)"
                  value={localSettings.home_office_maintenance_annual}
                  onChange={(v) => saveSettings({ home_office_maintenance_annual: v })}
                />
                <EditableAmount
                  label="Monthly condo fees (if applicable)"
                  value={localSettings.home_office_condo_fees_monthly}
                  onChange={(v) => saveSettings({ home_office_condo_fees_monthly: v })}
                />
              </div>
              <div className="rounded-lg bg-teal-50 border border-teal-200 px-4 py-3 text-sm space-y-1">
                <div className="flex justify-between text-teal-800">
                  <span>Total annual home costs</span>
                  <span>{fmtCurrency(result.homeOffice.totalAnnualHomeCosts)}</span>
                </div>
                <div className="flex justify-between text-teal-800">
                  <span>× Business use {fmtPct(localSettings.home_office_business_use_pct)}</span>
                  <strong>{fmtCurrency(result.homeOffice.deduction)}</strong>
                </div>
              </div>
            </div>

            <Separator />
            <LineRow lineNum="9945" label="Home Office Deduction" value={result.line9945_homeOfficeDeduction} bold highlight />
          </CardContent>
        )}
      </Card>

      {/* ── Net Business Income ── */}
      {/* ── Net Business Income ── */}
      <Card className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/50">
        <CardHeader className="pb-2">
          <SectionHeader
            icon={CheckCircle2}
            label="Net Business Income (Line 8270)"
            subtitle="T1 General Line 10400 — This is your reportable self-employment income"
            color="text-emerald-700"
          />
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          <div className="rounded-lg bg-white border border-emerald-200 px-4 py-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Gross Income (8200)</span>
              <span>{fmtCurrency(result.totalGrossIncome)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">− Deductible Expenses (9369)</span>
              <span className="text-red-600">−{fmtCurrency(result.line9369_totalExpenses)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">− CCA (9936)</span>
              <span className="text-red-600">−{fmtCurrency(result.line9936_totalCca)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">− Home Office (9945)</span>
              <span className="text-red-600">−{fmtCurrency(result.line9945_homeOfficeDeduction)}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-base font-bold text-emerald-800">
              <span>Net Business Income (8270)</span>
              <span>{fmtCurrency(result.line8270_netBusinessIncome)}</span>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 pt-1">
            <div className="rounded-lg bg-white border px-3 py-2 text-center">
              <p className="text-xs text-muted-foreground">CPP Contribution</p>
              <p className="text-sm font-bold">{fmtCurrency(result.cppContribution)}</p>
              <p className="text-[10px] text-muted-foreground">{fmtCurrency(result.cppDeductible)} deductible</p>
            </div>
            <div className="rounded-lg bg-white border px-3 py-2 text-center">
              <p className="text-xs text-muted-foreground">Est. Tax Burden</p>
              <p className="text-sm font-bold">{fmtCurrency(result.totalTaxBurden)}</p>
              <p className="text-[10px] text-muted-foreground">{fmtPct(result.effectiveRate)} eff. rate</p>
            </div>
            <div className="rounded-lg bg-white border px-3 py-2 text-center">
              <p className="text-xs text-muted-foreground">Quarterly Instalment</p>
              <p className="text-sm font-bold">{fmtCurrency(result.instalments.recommendedQuarterly)}</p>
              <p className="text-[10px] text-muted-foreground">Recommended per quarter</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── GST/HST ── */}
      <Card className="rounded-2xl">
        <CardHeader
          className="cursor-pointer pb-3"
          onClick={() => toggle("gstHst")}
        >
          <div className="flex items-center justify-between">
            <SectionHeader
              icon={Building2}
              label={`${result.gstHst.label} Remittance`}
              subtitle="Track amounts collected, remitted, and Input Tax Credits (ITCs)"
              color="text-sky-600"
            />
            {expandedSections.gstHst ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </CardHeader>
        {expandedSections.gstHst && (
          <CardContent className="pt-0 space-y-4">
            <div className="flex items-center gap-3 rounded-lg border px-4 py-3">
              <div className="flex-1">
                <p className="text-sm font-medium">GST/HST Registered?</p>
                <p className="text-xs text-muted-foreground">Required if annual revenue exceeds $30,000</p>
              </div>
              <div className="flex gap-2">
                {([false, true] as const).map((v) => (
                  <button
                    key={String(v)}
                    onClick={() => saveSettings({ gst_hst_registered: v })}
                    className={cn(
                      "rounded-md border px-3 py-1 text-sm font-medium transition-colors",
                      localSettings.gst_hst_registered === v
                        ? "border-sky-400 bg-sky-50 text-sky-800"
                        : "border-border text-muted-foreground hover:border-muted-foreground",
                    )}
                  >
                    {v ? "Yes" : "No"}
                  </button>
                ))}
              </div>
            </div>

            {localSettings.gst_hst_registered && (
              <>
                <div className="rounded-lg border px-4 py-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{result.gstHst.label} collected on GCI</span>
                    <span className="font-medium">{fmtCurrency(result.gstHst.collectedOnGCI)}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Based on {fmtCurrency(result.grossCommissionIncome)} GCI × {(result.gstHst.rate * 100).toFixed(result.gstHst.rate === 0.14975 ? 3 : 0)}% rate.
                    Verify against your actual records.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <EditableAmount
                    label="Q1 remitted to CRA"
                    value={localSettings.gst_hst_remitted_q1}
                    onChange={(v) => saveSettings({ gst_hst_remitted_q1: v })}
                    note="Jan–Mar payment"
                  />
                  <EditableAmount
                    label="Q2 remitted to CRA"
                    value={localSettings.gst_hst_remitted_q2}
                    onChange={(v) => saveSettings({ gst_hst_remitted_q2: v })}
                    note="Apr–Jun payment"
                  />
                  <EditableAmount
                    label="Q3 remitted to CRA"
                    value={localSettings.gst_hst_remitted_q3}
                    onChange={(v) => saveSettings({ gst_hst_remitted_q3: v })}
                    note="Jul–Sep payment"
                  />
                  <EditableAmount
                    label="Q4 remitted to CRA"
                    value={localSettings.gst_hst_remitted_q4}
                    onChange={(v) => saveSettings({ gst_hst_remitted_q4: v })}
                    note="Oct–Dec payment"
                  />
                  <EditableAmount
                    label={`${result.gstHst.label} paid on expenses (ITCs)`}
                    value={localSettings.gst_hst_paid_on_expenses}
                    onChange={(v) => saveSettings({ gst_hst_paid_on_expenses: v })}
                    note="Tax you paid on business purchases — reduces your net payable"
                  />
                </div>
                <div className={cn(
                  "rounded-lg border px-4 py-3 text-sm space-y-1",
                  result.gstHst.netPayable > 0 ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50",
                )}>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Collected on GCI</span>
                    <span>{fmtCurrency(result.gstHst.collectedOnGCI)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">− ITCs (paid on expenses)</span>
                    <span>−{fmtCurrency(result.gstHst.paidOnExpenses)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">− Already remitted</span>
                    <span>−{fmtCurrency(result.gstHst.remittedTotal)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-bold">
                    <span>{result.gstHst.netPayable > 0 ? "Balance owing to CRA" : "Refund / credit"}</span>
                    <span className={result.gstHst.netPayable > 0 ? "text-red-700" : "text-emerald-700"}>
                      {fmtCurrency(Math.abs(result.gstHst.netPayable))}
                    </span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        )}
      </Card>

      {/* ── Instalments ── */}
      <Card className="rounded-2xl">
        <CardHeader
          className="cursor-pointer pb-3"
          onClick={() => toggle("instalments")}
        >
          <div className="flex items-center justify-between">
            <SectionHeader
              icon={CreditCard}
              label="CRA Tax Instalment Tracker"
              subtitle="Compare recommended vs. paid to spot any shortfall"
              color="text-amber-600"
            />
            {expandedSections.instalments ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </CardHeader>
        {expandedSections.instalments && (
          <CardContent className="pt-0 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {([1, 2, 3, 4] as const).map((q) => {
                const key = `tax_instalment_paid_q${q}` as keyof UserSettings;
                return (
                  <div key={q} className="rounded-lg border p-3 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold">Q{q} Instalment</span>
                      <span className="text-muted-foreground">
                        Due: {q === 1 ? "Apr 30" : q === 2 ? "Jul 31" : q === 3 ? "Oct 31" : "Jan 31"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <p className="text-[10px] text-muted-foreground mb-1">Recommended</p>
                        <p className="text-sm font-medium">{fmtCurrency(result.instalments.recommendedQuarterly)}</p>
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] text-muted-foreground mb-1">Paid</p>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={(localSettings[key] as number) || ""}
                          placeholder="0.00"
                          onChange={(e) => saveSettings({ [key]: parseFloat(e.target.value) || 0 } as Partial<UserSettings>)}
                          className="h-7 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className={cn(
              "rounded-lg border px-4 py-3 text-sm space-y-1",
              result.instalments.balance > 0 ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50",
            )}>
              <div className="flex justify-between">
                <span>Recommended total</span>
                <span>{fmtCurrency(result.totalTaxBurden)}</span>
              </div>
              <div className="flex justify-between">
                <span>Total paid so far</span>
                <span>{fmtCurrency(result.instalments.totalPaid)}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-bold">
                <span>{result.instalments.balance > 0 ? "Estimated balance owing" : "On track / overpaid"}</span>
                <span className={result.instalments.balance > 0 ? "text-red-700" : "text-emerald-700"}>
                  {fmtCurrency(result.instalments.balance)}
                </span>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Footer disclaimer */}
      <p className="text-center text-xs leading-relaxed text-muted-foreground/60 pb-4">
        This T2125 summary is generated from your Agent Runway data for planning purposes only.
        It is not a filed tax return, professional tax advice, or a certified CRA document.
        Always have a qualified accountant review, adjust, and file your actual T2125 with CRA.{" "}
        <a href="/terms" className="underline underline-offset-2 hover:text-muted-foreground">
          Terms of Service
        </a>.
      </p>
    </div>
  );
}
