"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadCsvBatchAction } from "@/app/actions";
import { IngestionRunItem, TenantSnapshot } from "@/lib/store";
import { SupportedLocale, UserRole } from "@/contracts/lead-contracts";
import {
  CheckCircle2,
  Eye,
  FileSpreadsheet,
  Loader2,
  Play,
  ShieldAlert,
  Upload,
  X,
  ArrowRight,
} from "lucide-react";

interface RunsClientProps {
  snapshot: TenantSnapshot;
  currentRole: UserRole;
}

export function RunsClient({ snapshot, currentRole }: RunsClientProps) {
  const router = useRouter();
  const { tenant } = snapshot;

  const [isPending, startTransition] = useTransition();
  const [locale, setLocale] = useState<SupportedLocale>(tenant.localeDefault);
  const [fileName, setFileName] = useState(`${tenant.slug}_batch_import.csv`);
  const [csvText, setCsvText] = useState("");
  const [stepLabel, setStepLabel] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null);
  const [selectedRun, setSelectedRun] = useState<IngestionRunItem | null>(null);

  const loadSampleCsv = () => {
    setBanner(null);
    if (locale === "AU") {
      setFileName("Sydney_Solar_Mixed_Batch.csv");
      setCsvText(
        [
          "name,phone,email,estimated_value,notes,is_dnc,created_at",
          ' Isla MacKenzie,0418 552 901,isla@sydneysolar.com.au,29500,"Ready to buy commercial rooftop solar ASAP",false,24/11/2026',
          ' Lachlan Murdoch,0412 345 678,lachlan@sydneyenergy.com.au,38500,"Duplicate check against existing master",false,24/11/2026',
          ' Bogus Click,idk,n/a,0,"Invalid placeholder tokens",false,24/11/2026',
          ' Opted Out Contact,0409 882 114,optout@spamact.com.au,15000,"Do not contact",true,24/11/2026',
        ].join("\n")
      );
    } else if (locale === "UK") {
      setFileName("London_HeatPump_Mixed_Batch.csv");
      setCsvText(
        [
          "name,phone,email,estimated_value,notes,is_dnc,created_at",
          ' Oliver Kensington,07700 900741,oliver@mayfairprop.co.uk,21800,"Emergency boiler leak in basement!",false,24/11/2026',
          ' Beatrice Holloway,07700 900885,beatrice@canarywharfops.co.uk,34200,"Duplicate submission",false,24/11/2026',
          ' Garbage Lead,none,fake,0,"Empty ad submission",false,24/11/2026',
        ].join("\n")
      );
    } else {
      setFileName("Austin_Storm_Mixed_Batch.csv");
      setCsvText(
        [
          "name,phone,email,estimated_value,notes,is_dnc,created_at",
          ' Caleb Thornton,(512) 555-0158,caleb.t@gmial.com,19800,"Hail storm roof leak! Need emergency tarp today",false,11/24/2026',
          ' David Miller,512-555-0199,david.miller@gmail.com,14500,"Duplicate submission — hits $0 cache",false,11/24/2026',
          ' Anonymous Ad Click,idk,n/a,0,"Dirty placeholder string check",false,11/24/2026',
          ' DNC Household Test,512-555-0144,dnc_match@outlook.com,32000,"High value but matches DNC phone",false,11/24/2026',
        ].join("\n")
      );
    }
  };

  const loadScaleStressCsv = () => {
    setBanner(null);
    setFileName(`${tenant.slug}_30_lead_scale_test.csv`);
    const rows = ["name,phone,email,estimated_value,notes,is_dnc,created_at"];
    for (let i = 1; i <= 30; i++) {
      const num = String(2000 + i).padStart(4, "0");
      const phone =
        locale === "AU"
          ? `0419 55${num.slice(0, 1)} ${num.slice(1)}`
          : locale === "UK"
            ? `07700 91${num}`
            : `(512) 555-${num}`;
      const isDnc = i % 10 === 0 ? "true" : "false";
      const val = 8500 + i * 450;
      const note =
        i % 5 === 0
          ? "Active storm leak in attic — urgent inspection"
          : "Requesting free on-site assessment";
      const dt = locale === "US" ? "11/25/2026" : "25/11/2026";
      rows.push(`Scale Lead ${i},${phone},scale.lead.${i}@example.com,${val},"${note}",${isDnc},${dt}`);
    }
    setCsvText(rows.join("\n"));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setCsvText(String(reader.result || ""));
    };
    reader.readAsText(file);
  };

  const handleRunCsv = (e: React.FormEvent) => {
    e.preventDefault();
    setBanner(null);
    setStepLabel("1/3 Parsing CSV columns & validating schema...");

    startTransition(async () => {
      await new Promise((r) => setTimeout(r, 220));
      setStepLabel("2/3 Running E.164 normalization, DNC cluster & hub gates...");
      await new Promise((r) => setTimeout(r, 240));
      setStepLabel("3/3 Enforcing two-sided mathematical reconciliation...");

      const res = await uploadCsvBatchAction({
        csvText,
        fileName,
        locale,
      });

      setStepLabel(null);
      setBanner({ ok: res.ok, text: res.message });
      if (res.ok && res.data) {
        setSelectedRun(res.data as IngestionRunItem);
      }
      router.refresh();
    });
  };

  return (
    <div className="p-6 xl:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#172554]">
            Ingestion Runs &amp; Row-Level Lineage — {tenant.name}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Upload or paste dirty CSV exports to execute deterministic normalization, deduplication, and zero-loss reconciliation. Session Role:{" "}
            <strong className="text-[#172554]">{currentRole}</strong>
          </p>
        </div>
      </div>

      {banner && (
        <div
          data-testid="runs-status-banner"
          className={`px-4 py-3 rounded-xl border text-xs font-semibold flex items-center justify-between ${
            banner.ok
              ? "bg-[#E3FAF4] border-[#B2EFE0] text-[#0B7A66]"
              : "bg-rose-50 border-rose-200 text-rose-700"
          }`}
        >
          <div className="flex items-center gap-2">
            {banner.ok ? <CheckCircle2 className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
            <span>{banner.text}</span>
          </div>
          <button type="button" onClick={() => setBanner(null)} className="text-[11px] underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Interactive CSV Batch Uploader Card */}
      <form onSubmit={handleRunCsv} className="soax-card p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#E3FAF4] text-[#0D9488] flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#172554]">Batch CSV Ingestion &amp; Simulator</h2>
              <p className="text-[11px] text-slate-400">
                Upload a `.csv` file or load a realistic dirty dataset with duplicates, typos, and DNC traps.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={loadSampleCsv}
              data-testid="load-sample-csv-btn"
              className="px-3.5 py-2 rounded-lg bg-[#EEF4FF] hover:bg-[#DCE8FF] text-[#1649C7] text-xs font-bold transition"
            >
              Load Sample Dirty CSV ({locale})
            </button>
            <button
              type="button"
              onClick={loadScaleStressCsv}
              data-testid="load-stress-csv-btn"
              className="px-3.5 py-2 rounded-lg bg-[#E3FAF4] hover:bg-[#CCF5EA] text-[#0E9F84] text-xs font-bold transition"
            >
              Load 30-Lead Scale Batch
            </button>
            <label className="px-3.5 py-2 rounded-lg bg-[#F1F5FB] hover:bg-[#E3EAF6] text-[#172554] text-xs font-bold cursor-pointer flex items-center gap-1.5 transition">
              <Upload className="w-3.5 h-3.5" /> Choose .CSV File
              <input type="file" accept=".csv,text/csv" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-[#172554] block mb-1">Batch File Name</label>
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-[#DCE4F0] bg-[#FAFBFD] text-xs font-mono text-[#172554] focus:outline-none focus:border-[#1E5EFF]"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[#172554] block mb-1">Date &amp; Telecom Locale</label>
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value as SupportedLocale)}
              className="w-full px-3.5 py-2 rounded-xl border border-[#DCE4F0] bg-[#FAFBFD] text-xs font-semibold text-[#172554] focus:outline-none focus:border-[#1E5EFF]"
            >
              <option value="US">US (+1 • MM/DD/YYYY)</option>
              <option value="AU">AU (+61 • DD/MM/YYYY)</option>
              <option value="UK">UK (+44 • DD/MM/YYYY)</option>
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-[#172554] block mb-1">
            CSV Payload (Editable — Header + Rows)
          </label>
          <textarea
            rows={5}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            data-testid="csv-textarea"
            placeholder="Click 'Load Sample Dirty CSV' above or paste CSV rows here..."
            className="w-full px-3.5 py-2.5 rounded-xl border border-[#DCE4F0] bg-[#FAFBFD] text-xs font-mono text-[#172554] focus:outline-none focus:border-[#1E5EFF] focus:bg-white"
          />
        </div>

        {isPending && stepLabel && (
          <div className="p-3.5 rounded-xl bg-[#EEF4FF] border border-[#C7DCFF] flex items-center gap-3 text-xs font-bold text-[#1649C7]">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{stepLabel}</span>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isPending || !csvText.trim()}
            data-testid="execute-csv-btn"
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#1649C7] to-[#1E5EFF] hover:opacity-95 text-white text-xs font-bold shadow-[0_6px_18px_rgba(22,73,199,0.25)] flex items-center gap-2 disabled:opacity-50 transition"
          >
            {isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Running Pipeline...
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" /> Run Batch Reconciliation
              </>
            )}
          </button>
        </div>
      </form>

      {/* Runs History Table */}
      <div className="soax-card p-6">
        <h2 className="text-[15px] font-bold text-[#172554] mb-4">Executed Ingestion Batches</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="text-[11px] font-semibold text-slate-400 border-b border-[#EEF2F8]">
                <th className="py-3 pr-4">Batch &amp; Source</th>
                <th className="py-3 px-3">Locale</th>
                <th className="py-3 px-3 text-center">Inbound</th>
                <th className="py-3 px-3 text-center">Clean</th>
                <th className="py-3 px-3 text-center">Merged</th>
                <th className="py-3 px-3 text-center">Quarantined</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 pl-4 text-right">Lineage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F4F7FC]">
              {tenant.runs.map((run) => (
                <tr key={run.id} className="hover:bg-[#F8FAFF] transition">
                  <td className="py-3.5 pr-4">
                    <span className="font-bold text-[#172554] block">{run.fileName}</span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {run.id} • {run.source}
                    </span>
                  </td>
                  <td className="py-3.5 px-3 font-mono font-semibold text-slate-600">{run.locale}</td>
                  <td className="py-3.5 px-3 text-center font-mono font-extrabold text-[#172554]">
                    {run.totalInbound}
                  </td>
                  <td className="py-3.5 px-3 text-center font-mono font-extrabold text-[#0D9488]">
                    {run.cleanMastersCount}
                  </td>
                  <td className="py-3.5 px-3 text-center font-mono font-extrabold text-[#1D4ED8]">
                    {run.mergedDuplicates}
                  </td>
                  <td className="py-3.5 px-3 text-center font-mono font-extrabold text-[#D97706]">
                    {run.quarantinedCount}
                  </td>
                  <td className="py-3.5 px-3 text-center">
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-[#E3FAF4] text-[#0D9488]">
                      {run.status}
                    </span>
                  </td>
                  <td className="py-3.5 pl-4 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedRun(run)}
                      data-testid={`inspect-run-${run.id}`}
                      className="px-3 py-1.5 rounded-lg bg-[#F1F5FB] hover:bg-[#1649C7] text-[#1E3A8A] hover:text-white text-xs font-bold inline-flex items-center gap-1.5 transition"
                    >
                      <Eye className="w-3.5 h-3.5" /> Inspect ({run.lineage.length})
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Row-Level Lineage Modal */}
      {selectedRun && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A194E]/45 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="Batch Row Lineage"
        >
          <div className="w-full max-w-4xl bg-white rounded-2xl border border-[#E4EBF5] shadow-2xl overflow-hidden max-h-[88vh] flex flex-col">
            <div className="px-6 py-4 bg-[#F8FAFE] border-b border-[#E8EEF6] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#172554]">
                  Row-Level Normalization &amp; Dedupe Lineage — {selectedRun.fileName}
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  Equation: {selectedRun.totalInbound} Inbound = {selectedRun.cleanMastersCount} Clean +{" "}
                  {selectedRun.mergedDuplicates} Merged + {selectedRun.quarantinedCount} Quarantined + 0 Failed
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRun(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="text-[11px] font-semibold text-slate-400 border-b border-[#EEF2F8]">
                    <th className="py-2.5 pr-3">#</th>
                    <th className="py-2.5 px-3">Raw Input</th>
                    <th className="py-2.5 px-3">Normalized Canonical</th>
                    <th className="py-2.5 px-3">Gate Outcome</th>
                    <th className="py-2.5 pl-3 text-right">FinOps</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F4F7FC]">
                  {selectedRun.lineage.map((row) => (
                    <tr key={row.rowNumber}>
                      <td className="py-3 pr-3 font-mono text-slate-400">{row.rowNumber}</td>
                      <td className="py-3 px-3 font-mono text-[11px] text-slate-600">
                        <div className="font-sans font-bold text-[#172554]">{row.rawName}</div>
                        <div>Phone: {row.rawPhone ?? "—"}</div>
                        <div>Email: {row.rawEmail ?? "—"}</div>
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px]">
                        <div className="font-sans font-bold text-[#172554]">{row.normalizedName}</div>
                        <div className="text-[#0D9488]">
                          E.164: {row.normalizedPhone ?? "null"}
                        </div>
                        <div className="text-[#1649C7]">
                          Email: {row.normalizedEmail ?? "null"}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold mb-1 ${
                            row.outcome === "CLEAN_MASTER"
                              ? "bg-[#E3FAF4] text-[#0D9488]"
                              : row.outcome === "MERGED_DUPLICATE"
                                ? "bg-[#EBF2FF] text-[#1D4ED8]"
                                : "bg-[#FEF3C7] text-[#B45309]"
                          }`}
                        >
                          {row.outcome}
                        </span>
                        <p className="text-[11px] text-slate-500">{row.detail}</p>
                      </td>
                      <td className="py-3 pl-3 text-right font-mono text-[11px]">
                        <strong className="text-[#172554] block">
                          ${(row.costCents / 100).toFixed(2)}
                        </strong>
                        <span className="text-slate-400 text-[10px]">{row.finOpsProvider}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
