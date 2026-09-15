/**
 * TAB 3 — Bulk Assessment.
 * Drop the VCapacity template or an RVTools export; every datastore is
 * sized and threshold-checked, bad rows are quarantined with their Excel
 * row numbers, and a styled XLSX report (summary + detail + quarantine)
 * is produced for the Storage Team.
 *
 * v2.0 additions: the NAA / LUN identifier travels end-to-end (template
 * column → RVTools vMultiPath → on-screen table → Storage Team report),
 * and every column header documents itself on hover.
 */
import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import toast from "react-hot-toast";
import { Download, Fingerprint, ListX, ScanSearch, Sheet, ShieldAlert } from "lucide-react";
import { POLICY } from "../config/policy";
import { fmt } from "../lib/engine";
import {
  assessRows, BULK_COL_TIPS, downloadTemplate, exportBulkReport, parseWorkbookFile, reportExpansion,
  RVTOOLS_PARSER_VERSION, type AssessedRow, type DatastoreInputRow, type ParseOutcome, type QuarantinedRow,
} from "../lib/bulk";
import { Card, Chip, ClearButton, GhostButton, InfoBanner, StatusPill, StatCard, Th, Td, Tip } from "./ui";
import FileDrop from "./FileDrop";

interface BulkState {
  meta: ParseOutcome;
  fileName: string;
  rows: DatastoreInputRow[];
  valid: AssessedRow[];
  invalid: QuarantinedRow[];
}

/* Session-scoped: tabs unmount on switch, so the parsed assessment is kept
   in a module-level holder rather than component state. Leaving the tab and
   returning restores the whole result set without re-importing. */
let bulkSession: BulkState | null = null;

export default function BulkTab() {
  const [state, setStateRaw] = useState<BulkState | null>(bulkSession);
  const setState = (next: BulkState | null) => {
    bulkSession = next;
    setStateRaw(next);
  };
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function importFile(file: File) {
    setBusy(true);
    try {
      const outcome = await parseWorkbookFile(file);
      const { valid, invalid } = assessRows(outcome.rows);
      setState({ meta: outcome, fileName: file.name, rows: outcome.rows, valid, invalid });
      toast.success(
        `${outcome.source === "rvtools" ? "RVTools" : "Template"} parsed — ${valid.length} assessed${invalid.length ? `, ${invalid.length} quarantined` : ""}`
      );
      if (invalid.length > 0) toast.error(`${invalid.length} row(s) quarantined — review below`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not parse that workbook.");
    } finally {
      setBusy(false);
    }
  }

  function clearAll() {
    setState(null);
    toast.success("Bulk inputs cleared");
  }

  async function exportReport() {
    if (!state) return;
    setExporting(true);
    try {
      const ref = await exportBulkReport(state.valid, state.invalid, {
        source: state.meta.source,
        sheetName: state.meta.sheetName,
        fileName: state.fileName,
      });
      toast.success(`Storage Team report exported — ${ref}`);
    } catch {
      toast.error("Export failed.");
    } finally {
      setExporting(false);
    }
  }

  const counts = useMemo(() => {
    if (!state) return null;
    const v = state.valid;
    return {
      approved: v.filter((r) => r.health.status === "APPROVED").length,
      warning: v.filter((r) => r.health.status === "WARNING").length,
      critical: v.filter((r) => r.health.status === "CRITICAL").length,
      denied: v.filter((r) => !r.health.snapAuthorized).length,
      breaches: v.filter((r) => r.health.breachAtPeak).length,
      expansion: v.reduce((s, r) => s + Math.ceil(r.expansionGB), 0),
      provisioned: v.reduce((s, r) => s + r.provisionedGB, 0),
      required: v.reduce((s, r) => s + r.requiredGB, 0),
      lun: v.filter((r) => !!r.input.naaLunId?.trim()).length,
      op: v.filter((r) => reportExpansion(r).overprovisioned).length,
    };
  }, [state]);

  const diag = state?.meta.inventory?.diagnostics;

  return (
    <div className="mx-auto" style={{ maxWidth: 1500, padding: "24px 20px 8px" }}>
      {/* toolbar */}
      <div className="flex items-center justify-between flex-wrap" style={{ gap: 10, marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 17, fontWeight: 800, color: "var(--text-0)", letterSpacing: "-0.2px" }}>Bulk Assessment</h1>
          <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }}>
            Template or RVTools in — sized, governed, quarantined, and reported for the Storage Team.
          </p>
        </div>
        <div className="flex flex-wrap" style={{ gap: 8 }}>
          <GhostButton onClick={() => void downloadTemplate()} icon={<Sheet size={14} />} label="Download template" title="XLSX with the field guide sheet — includes the NAA / LUN ID column" />
          <GhostButton onClick={() => fileRef.current?.click()} icon={<ScanSearch size={14} />} label="Import .xlsx" title="VCapacity template or a full RVTools export (auto-detected)" />
          <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ""; }} />
          <ClearButton onClick={clearAll} disabled={!state} label="Clear" />
          {state && (
            <GhostButton
              onClick={exportReport}
              disabled={exporting}
              icon={<Download size={14} />}
              label={exporting ? "Exporting…" : "Export Storage Team report"}
              title="Styled XLSX: Summary + Assessments (with NAA / LUN IDs, report-only overprovisioning rule and per-row driver) + Quarantined sheets, references and policy basis"
            />
          )}
        </div>
      </div>

      {!state ? (
        <Card>
          <div style={{ padding: 22 }}>
            <FileDrop
              onFile={importFile}
              busy={busy}
              note="RVTools: vDatastore + vInfo + vDisk are read automatically; include vMultiPath to capture NAA / LUN identifiers onto the report."
            />
            <div className="flex flex-wrap justify-center" style={{ gap: 8, marginTop: 18 }}>
              <Chip tone="gold" tip="vDatastore / vInfo / vDisk (+vMultiPath) sheets are detected automatically — no manual column mapping.">RVTools {RVTOOLS_PARSER_VERSION} auto-detect</Chip>
              <Chip tip="Malformed rows are isolated with their Excel row numbers and rejection reasons instead of silently skipped.">Row quarantine</Chip>
              <Chip tip="The 'NAA / LUN ID' template column and the vMultiPath Device column carry the LUN identifier into the Storage Team report.">NAA / LUN on the report</Chip>
              <Chip tip="A summary sheet, a styled Assessments detail sheet and the quarantine sheet — referenced and formula-stamped.">Styled XLSX report</Chip>
            </div>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col" style={{ gap: 16 }}>
          {/* file + import meta */}
          <Card>
            <div className="flex items-center justify-between flex-wrap" style={{ gap: 10 }}>
              <div className="flex items-center" style={{ gap: 10 }}>
                <Sheet size={18} style={{ color: "var(--gold)" }} />
                <div>
                  <div className="font-num" style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-0)" }}>{state.fileName}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2 }}>
                    {state.meta.source === "rvtools" ? "RVTools export" : "VCapacity template"} · sheet “{state.meta.sheetName}” · {state.rows.length} rows read
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap" style={{ gap: 6 }}>
                {state.meta.source === "rvtools" && (
                  <Chip tone="gold" tip="Parser build that read this file. Re-import after a parser upgrade so cached results refresh.">{RVTOOLS_PARSER_VERSION}</Chip>
                )}
                {diag && (
                  <Chip tip={`vDisk rows read: ${diag.diskRowsRead} · mapped to a datastore: ${diag.diskRowsMapped}. Unmapped rows typically lack a VMDK Path (e.g. RDMs).`}>
                    vDisk {diag.diskRowsMapped}/{diag.diskRowsRead} mapped
                  </Chip>
                )}
                <Chip
                  tip={`${counts!.lun} of ${state.valid.length} assessed datastores carry an NAA / LUN identifier that will appear on the report. Source: template column or RVTools vMultiPath.`}
                  tone={counts!.lun > 0 ? "success" : "warning"}
                >
                  <Fingerprint size={11} /> LUN ids {counts!.lun}/{state.valid.length}
                </Chip>
                {counts!.op > 0 && (
                  <Chip
                    tone="gold"
                    tip="These datastores are overprovisioned (provisioned > capacity). In the exported Storage Team report their requested increase is raised so total capacity reaches at least the provisioned value — this applies even where free space exists today, because thin allocation can be claimed at any time. The on-screen figures below and all snapshot / health operations keep the governance view."
                  >
                    {counts!.op} overprovisioned — report requests full provisioned size
                  </Chip>
                )}
              </div>
            </div>
            {diag && diag.warnings.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <InfoBanner sev="warning" title="Import diagnostics">
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {diag.warnings.slice(0, 4).map((w, i) => (
                      <li key={i} style={{ fontSize: 12, lineHeight: 1.55 }}>{w}</li>
                    ))}
                  </ul>
                </InfoBanner>
              </div>
            )}
          </Card>

          {/* summary */}
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            <StatCard label="Assessed" value={state.valid.length} tip="Datastore rows that passed validation and were sized. Quarantined rows are listed separately." />
            <StatCard label="Approved" value={counts!.approved} tone="success" tip={`Current free space ≥ ${POLICY.freeSpace.approvedPct}% of capacity.`} />
            <StatCard label="Warning" value={counts!.warning} tone={counts!.warning ? "warning" : undefined} tip={`Free space between ${POLICY.freeSpace.warningPct}% and ${POLICY.freeSpace.approvedPct}% — elevate before snapshot work.`} />
            <StatCard label="Critical" value={counts!.critical} tone={counts!.critical ? "danger" : undefined} tip={`Free space below ${POLICY.freeSpace.warningPct}% — expansion required, snapshots denied.`} />
            <StatCard label="Auth denied" value={counts!.denied} tone={counts!.denied ? "danger" : undefined} tip="Rows where the policy gate blocks snapshot operations (free or projected-peak free shortfall)." />
            <StatCard label="Peak breaches" value={counts!.breaches} tone={counts!.breaches ? "warning" : undefined} tip="Datastores that pass today but fall below the policy line at projected snapshot peak." />
            <StatCard label="Provisioned" value={`${fmt(counts!.provisioned / 1024, 1)} TB`} tip="Total provisioned (virtual) footprint across assessed datastores — vDatastore 'Provisioned MiB' or the template column; thin over-allocation shows up here." />
            <StatCard label="Expansion needed" value={`+${counts!.expansion.toLocaleString("en-US")} GB`} tone={counts!.expansion > 0 ? "gold" : undefined} tip="Total rounded-up expansion to action across all datastores — the larger per row of the sizing gap and the 25% free-space floor." />
          </div>

          {/* results table */}
          <Card title="Assessments" sub="Every header and the NAA / LUN values document themselves on hover.">
            <div style={{ overflowX: "auto", margin: "0 -8px" }}>
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 1350 }}>
                <thead>
                  <tr>
                    <Th label="#" tip={BULK_COL_TIPS.idx} align="center" />
                    <Th label="Datastore" tip={BULK_COL_TIPS.datastore} />
                    <Th label="NAA / LUN ID" tip={BULK_COL_TIPS.naaLunId} />
                    <Th label="Cluster" tip={BULK_COL_TIPS.cluster} />
                    <Th label="Capacity" tip={BULK_COL_TIPS.capacity} align="right" />
                    <Th label="Prov. GB" tip={BULK_COL_TIPS.provisioned} align="right" />
                    <Th label="Free" tip={BULK_COL_TIPS.free} align="right" />
                    <Th label="Free %" tip={BULK_COL_TIPS.freePct} align="right" />
                    <Th label="Reserve" tip={BULK_COL_TIPS.reserve} align="right" />
                    <Th label="VM RAM" tip={BULK_COL_TIPS.vmRam} align="right" />
                    <Th label="Buffer" tip={BULK_COL_TIPS.buffer} align="right" />
                    <Th label="Required" tip={BULK_COL_TIPS.required} align="right" />
                    <Th label="Expansion" tip={BULK_COL_TIPS.expansion} align="right" />
                    <Th label="Peak Free %" tip={BULK_COL_TIPS.peakFreePct} align="right" />
                    <Th label="Snapshot Auth" tip={BULK_COL_TIPS.snapAuth} align="center" />
                    <Th label="Status" tip={BULK_COL_TIPS.status} align="center" />
                    <Th label="Recommendation" tip={BULK_COL_TIPS.recommendation} />
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {state.valid.map((r, i) => {
                      const h = r.health;
                      return (
                        <motion.tr
                          key={`${r.input.datastore}-${i}`}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          whileHover={{ backgroundColor: "rgba(201,168,76,0.06)" }}
                          transition={{ delay: Math.min(i * 0.025, 0.5), duration: 0.3 }}
                          style={{ background: i % 2 ? "rgba(148,163,205,0.035)" : "transparent" }}
                        >
                          <Td align="center" className="text-xs">{i + 1}</Td>
                          <Td>
                            <span style={{ fontWeight: 700, color: "var(--text-0)", fontSize: 12 }}>{r.input.datastore}</span>
                          </Td>
                          <Td>
                            {r.input.naaLunId?.trim() ? (
                              <Tip tip={`${r.input.naaLunId}\n\n${BULK_COL_TIPS.naaLunId}`} title="NAA / LUN ID">
                                <span className="font-num" style={{ fontSize: 11, color: "var(--gold)", letterSpacing: "-0.2px" }}>
                                  {r.input.naaLunId.length > 28 ? `${r.input.naaLunId.slice(0, 28)}…` : r.input.naaLunId}
                                </span>
                              </Tip>
                            ) : (
                              <Tip tip={BULK_COL_TIPS.naaLunId} title="NAA / LUN ID">
                                <span style={{ color: "var(--text-4)", fontSize: 11.5 }}>—</span>
                              </Tip>
                            )}
                          </Td>
                          <Td>{r.input.cluster || "—"}</Td>
                          <Td align="right">{fmt(r.input.capacityGB, 1)}</Td>
                          <Td align="right">
                            <span style={{ color: r.provisionedGB > r.input.capacityGB ? "var(--amber)" : "var(--text-2)", fontWeight: r.provisionedGB > r.input.capacityGB ? 700 : 400 }}>
                              {fmt(r.provisionedGB, 1)}
                            </span>
                          </Td>
                          <Td align="right">{fmt(r.input.freeGB, 1)}</Td>
                          <Td align="right"><span style={{ color: `var(--${h.sev === "success" ? "green" : h.sev === "warning" ? "amber" : "red"})`, fontWeight: 700 }}>{fmt(h.freePct, 1)}%</span></Td>
                          <Td align="right">{fmt(r.reserveGB, 1)}</Td>
                          <Td align="right">{fmt(r.input.ramGB, 1)}</Td>
                          <Td align="right">{r.input.buffer}×</Td>
                          <Td align="right"><span style={{ fontWeight: 700, color: "var(--text-0)" }}>{fmt(r.requiredGB, 1)}</span></Td>
                          <Td align="right">
                            {Math.ceil(r.expansionGB) > 0 ? (
                              <span style={{ color: "var(--amber)", fontWeight: 800 }}>+{Math.ceil(r.expansionGB).toLocaleString("en-US")}</span>
                            ) : (
                              <span style={{ color: "var(--green)", fontWeight: 700 }}>0</span>
                            )}
                          </Td>
                          <Td align="right">{fmt(Math.max(h.projectedFreePct, 0), 1)}%</Td>
                          <Td align="center">
                            <StatusPill sev={h.snapAuthorized ? "success" : "danger"}>{h.snapAuthorized ? "AUTHORIZED" : "DENIED"}</StatusPill>
                          </Td>
                          <Td align="center"><StatusPill sev={r.severity}>{h.status}</StatusPill></Td>
                          <Td>
                            <span
                              className="font-num"
                              style={{
                                fontSize: 12, fontWeight: 800, letterSpacing: "0.2px",
                                color: Math.ceil(r.expansionGB) > 0 ? "var(--amber)" : "var(--green)",
                              }}
                            >
                              {r.recommendation}
                            </span>
                          </Td>
                        </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </Card>

          {/* quarantine */}
          {state.invalid.length > 0 && (
            <Card
              title="Quarantined rows"
              sub="Rejected before assessment — fix them in the source file and re-import. Row numbers match the workbook."
            >
              <div className="flex flex-col" style={{ gap: 8 }}>
                {state.invalid.map((q, i) => (
                  <div key={i} className="flex items-start rounded-xl" style={{ gap: 12, padding: "10px 14px", background: "var(--red-bg)", border: "1px solid rgba(239,68,68,0.3)" }}>
                    <ShieldAlert size={16} style={{ color: "var(--red)", marginTop: 1, flexShrink: 0 }} />
                    <div>
                      <div className="font-num" style={{ fontSize: 12, fontWeight: 800, color: "var(--text-0)" }}>
                        Row {q.rowNumber} · {q.datastore}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>{q.reasons.join("; ")}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {state.invalid.length === 0 && (
            <div className="flex items-center" style={{ gap: 8 }}>
              <Chip tone="success" tip="Every imported row passed validation — nothing was quarantined.">
                <ListX size={11} /> Zero quarantined — clean import
              </Chip>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
