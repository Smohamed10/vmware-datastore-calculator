import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import toast from "react-hot-toast";
import { AlertTriangle, FileDown, FileSpreadsheet, ShieldCheck, ShieldX, Trash2, Upload } from "lucide-react";
import { APP } from "../config/policy";
import { fmt, type Severity } from "../lib/engine";
import { RVTOOLS_PARSER_VERSION, assessRows, downloadTemplate, exportBulkReport, parseWorkbookFile, type DatastoreInputRow } from "../lib/bulk";
import { usePersistentState } from "../lib/persist";
import { BigResult, Card, SectionLabel } from "./ui";

interface FileMeta {
  fileName: string;
  source: "template" | "rvtools";
  sheetName: string;
  diskRowsRead?: number;
  diskRowsMapped?: number;
  warnings?: string[];
  parserVersion?: string;
}

type SortKey = "gap" | "status" | "name";
const SEV_ORDER: Record<Severity, number> = { danger: 0, warning: 1, success: 2 };
const SEV_COLOR: Record<Severity, string> = { success: "var(--green)", warning: "var(--amber)", danger: "var(--red)" };
const SEV_BG: Record<Severity, string> = { success: "var(--green-bg)", warning: "var(--amber-bg)", danger: "var(--red-bg)" };

export default function BulkTab() {
  // Parser-versioned cache prevents calculations produced by an older field
  // mapping from surviving a deployment and appearing current.
  const [rows, setRows] = usePersistentState<DatastoreInputRow[]>("bulk.rows.rvt-2026-2", []);
  const [meta, setMeta] = usePersistentState<FileMeta | null>("bulk.meta.rvt-2026-2", null);
  const [sort, setSort] = usePersistentState<SortKey>("bulk.sort", "gap");
  const [dragOver, setDragOver] = useState(false);
  const [exporting, setExporting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { valid, invalid } = useMemo(() => assessRows(rows), [rows]);

  const sorted = useMemo(() => {
    const arr = [...valid];
    if (sort === "gap") arr.sort((a, b) => (b.health.sufficient ? -1 : b.health.gapGB) - (a.health.sufficient ? -1 : a.health.gapGB));
    else if (sort === "status") arr.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
    else arr.sort((a, b) => a.input.datastore.localeCompare(b.input.datastore));
    return arr;
  }, [valid, sort]);

  const agg = useMemo(() => {
    const by = (s: string) => valid.filter((r) => r.health.status === s).length;
    return {
      approved: by("APPROVED"),
      warning: by("WARNING"),
      critical: by("CRITICAL"),
      breaches: valid.filter((r) => r.health.breachAtPeak).length,
      gap: valid.reduce((s, r) => s + (r.health.sufficient ? 0 : r.health.gapGB), 0),
    };
  }, [valid]);

  async function ingest(file: File) {
    try {
      const outcome = await parseWorkbookFile(file);
      setRows(outcome.rows);
      setMeta({
        fileName: file.name,
        source: outcome.source,
        sheetName: outcome.sheetName,
        diskRowsRead: outcome.inventory?.diagnostics?.diskRowsRead,
        diskRowsMapped: outcome.inventory?.diagnostics?.diskRowsMapped,
        warnings: outcome.inventory?.diagnostics?.warnings,
        parserVersion: outcome.source === "rvtools" ? RVTOOLS_PARSER_VERSION : undefined,
      });
      toast.success(
        outcome.source === "rvtools"
          ? `RVTools detected — ${outcome.rows.length} datastores built from vDatastore / vInfo / vDisk`
          : `${outcome.rows.length} rows parsed from "${outcome.sheetName}"`
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not parse the file");
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void ingest(f);
  }
  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) void ingest(f);
    e.target.value = "";
  }
  function clearAll() {
    setRows([]);
    setMeta(null);
  }

  async function doExport() {
    if (!meta) return;
    setExporting(true);
    try {
      const ref = await exportBulkReport(valid, invalid, meta);
      toast.success(`Storage Team report ${ref} exported`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 460px), 1fr))", gap: 22 }}>
      {/* ════════ INPUT ════════ */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <Card title="Source File" sub="One file in — a full storage-wide assessment out" accent="var(--maroon)" delay={0}>
          <div className="flex flex-wrap" style={{ gap: 10, marginBottom: 14 }}>
            <button onClick={() => void downloadTemplate().then(() => toast.success("Template downloaded"))} style={btnStyle("ghost")}>
              <FileDown size={14} />
              Download template
            </button>
            <button onClick={() => inputRef.current?.click()} style={btnStyle("solid")}>
              <Upload size={14} />
              Choose file
            </button>
            {rows.length > 0 && (
              <button onClick={clearAll} style={btnStyle("danger")}>
                <Trash2 size={14} />
                Clear
              </button>
            )}
          </div>
          <input ref={inputRef} type="file" accept=".xlsx,.xlsm" style={{ display: "none" }} onChange={onPick} />

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            role="button"
            aria-label="Drop an Excel or RVTools file"
            style={{
              borderRadius: 16,
              padding: "34px 20px",
              textAlign: "center",
              cursor: "pointer",
              border: `2px dashed ${dragOver ? "var(--gold)" : "var(--border-2)"}`,
              background: dragOver ? "var(--gold-bg)" : "var(--bg-input)",
              transition: "all .25s",
            }}
          >
            <FileSpreadsheet size={30} style={{ margin: "0 auto 10px", color: dragOver ? "var(--gold)" : "var(--text-4)" }} />
            <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>
              Drop the assessment template — or an RVTools export
            </p>
            <p style={{ fontSize: 12, color: "var(--text-4)", marginTop: 6 }}>
              .xlsx · RVTools sheets vDatastore / vInfo / vDisk are auto-detected
            </p>
          </div>

          <div style={{ marginTop: 12, padding: "12px 16px", borderRadius: 12, background: "var(--bg-input)", border: "1px solid var(--border-1)" }}>
            <p style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "1.2px", textTransform: "uppercase", color: "var(--text-4)", marginBottom: 8 }}>
              Getting the file from RVTools
            </p>
            <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
              {[
                "Open RVTools and log in to vCenter with a read-only account",
                "Let the inventory load, then File → Export all to Excel",
                "Drop the resulting .xlsx here — nothing to select or rename",
              ].map((s, i) => (
                <li key={i} style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.6 }}>{s}</li>
              ))}
            </ol>
          </div>

          {meta && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-between flex-wrap"
              style={{ gap: 8, marginTop: 12, padding: "10px 14px", borderRadius: 10, background: "var(--maroon-bg)", border: "1px solid var(--gold-border)" }}
            >
              <span className="font-num" style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-1)" }}>{meta.fileName}</span>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", padding: "3px 8px", borderRadius: 6, background: "var(--gold-bg)", color: "var(--gold)", border: "1px solid var(--gold-border)" }}>
                {meta.source === "rvtools" ? "RVTools" : "Template"}
              </span>
              {meta.source === "rvtools" && meta.diskRowsRead !== undefined && (
                <span className="font-num" style={{ fontSize: 10.5, color: "var(--text-4)", width: "100%" }}>
                  vDisk: {meta.diskRowsMapped ?? 0}/{meta.diskRowsRead} rows mapped · MiB values converted to GiB
                  {meta.parserVersion ? ` · ${meta.parserVersion}` : ""}
                </span>
              )}
            </motion.div>
          )}

          {meta?.warnings && meta.warnings.length > 0 && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
              {meta.warnings.map((warning, i) => (
                <div key={i} className="flex items-start" style={{ gap: 8, padding: "9px 12px", borderRadius: 9, fontSize: 11.5, lineHeight: 1.55, background: "var(--amber-bg)", color: "var(--amber)", border: "1px solid rgba(245,158,11,0.3)" }}>
                  <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <AnimatePresence>
          {invalid.length > 0 && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden" }}>
              <Card title={`Quarantined Rows — ${invalid.length}`} sub="Rejected before computation; fix the source rows and re-import" accent="var(--red)" delay={0}>
                <div style={{ maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                  {invalid.map((q) => (
                    <div key={q.rowNumber} className="flex items-start" style={{ gap: 10, padding: "10px 14px", borderRadius: 10, background: "var(--red-bg)", border: "1px solid rgba(239,68,68,0.3)" }}>
                      <AlertTriangle size={14} style={{ color: "var(--red)", flexShrink: 0, marginTop: 2 }} />
                      <div>
                        <span className="font-num" style={{ fontSize: 12.5, fontWeight: 800, color: "var(--red)" }}>
                          Excel row {q.rowNumber} · {q.datastore}
                        </span>
                        <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3, lineHeight: 1.6 }}>{q.reasons.join("; ")}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ════════ RESULTS ════════ */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }} aria-live="polite">
        <AnimatePresence mode="wait">
          {rows.length === 0 ? (
            <motion.div key="ph" exit={{ opacity: 0, scale: 0.96 }}>
              <Card delay={0.08}>
                <div style={{ textAlign: "center", padding: "72px 20px" }}>
                  <motion.div animate={{ y: [0, -9, 0] }} transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }} style={{ opacity: 0.16, marginBottom: 18 }}>
                    <FileSpreadsheet size={54} style={{ margin: "0 auto", color: "var(--gold)" }} />
                  </motion.div>
                  <p style={{ fontSize: 16.5, fontWeight: 600, color: "var(--text-3)" }}>No file loaded</p>
                  <p style={{ fontSize: 13.5, color: "var(--text-4)", marginTop: 8 }}>
                    Every datastore in the file is sized, threshold-checked, and rolled into one Storage Team report
                  </p>
                </div>
              </Card>
            </motion.div>
          ) : (
            <motion.div key="r" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <Card title="Fleet Roll-up" accent="var(--gold)" delay={0}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))", gap: 10 }}>
                  <Stat label="Assessed" value={String(valid.length)} tone="var(--text-0)" />
                  <Stat label="Approved" value={String(agg.approved)} tone="var(--green)" />
                  <Stat label="Warning" value={String(agg.warning)} tone="var(--amber)" />
                  <Stat label="Critical" value={String(agg.critical)} tone="var(--red)" />
                  <Stat label="Peak breaches" value={String(agg.breaches)} tone={agg.breaches > 0 ? "var(--amber)" : "var(--green)"} />
                </div>
                {agg.gap > 0 && (
                  <BigResult danger label="Total expansion required" value={`+${fmt(agg.gap, 2)} GB`} sub={`${fmt(agg.gap / 1024, 3)} TB across the assessed datastores`} />
                )}
              </Card>

              <Card title="Datastore Assessments" sub={`${valid.length} computed · severity-colored · sortable`} accent="var(--green)" delay={0.06}>
                <div className="flex items-center justify-between" style={{ marginBottom: 12, gap: 10 }}>
                  <SectionLabel>
                    <span style={{ marginBottom: 0, display: "inline-block" }}>Results table</span>
                  </SectionLabel>
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as SortKey)}
                    aria-label="Sort results"
                    style={{ padding: "7px 12px", borderRadius: 9, fontSize: 12.5, fontWeight: 700, background: "var(--bg-input)", border: "1.5px solid var(--border-2)", color: "var(--gold)", cursor: "pointer", outline: "none" }}
                  >
                    <option value="gap">Largest expansion gap</option>
                    <option value="status">Worst status first</option>
                    <option value="name">Datastore name</option>
                  </select>
                </div>

                <div style={{ overflowX: "auto", margin: "0 -6px", padding: "0 6px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
                    <thead>
                      <tr>
                        {["Datastore", "Free", "Peak", "Required", "Gap", "Snapshot", "Status"].map((h) => (
                          <th key={h} style={{ textAlign: h === "Datastore" ? "left" : "right", fontSize: 9.5, fontWeight: 800, letterSpacing: "1.2px", textTransform: "uppercase", color: "var(--text-4)", padding: "8px 10px", borderBottom: "1px solid var(--border-2)", whiteSpace: "nowrap" }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((r) => {
                        const h = r.health;
                        return (
                          <tr key={r.input.rowNumber} style={{ borderBottom: "1px solid var(--border-1)" }} title={r.recommendation}>
                            <td style={{ padding: "10px", maxWidth: 190 }}>
                              <div className="font-num" style={{ fontSize: 13, fontWeight: 700, color: "var(--text-0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {r.input.datastore}
                              </div>
                              {r.input.cluster && <div style={{ fontSize: 10.5, color: "var(--text-4)", marginTop: 2 }}>{r.input.cluster}</div>}
                            </td>
                            <td className="font-num" style={tdR(h.freePct >= 25 ? "var(--green)" : h.freePct >= 15 ? "var(--amber)" : "var(--red)")}>
                              {h.freePct}%
                            </td>
                            <td className="font-num" style={tdR(h.projectedFreePct >= 25 ? "var(--green)" : h.projectedFreePct >= 15 ? "var(--amber)" : "var(--red)")}>
                              {h.projectedFreePct}%
                            </td>
                            <td className="font-num" style={tdR("var(--text-1)")}>{fmt(r.requiredGB, 1)}</td>
                            <td className="font-num" style={tdR(h.sufficient ? "var(--text-4)" : "var(--red)")}>
                              {h.sufficient ? "—" : `+${fmt(h.gapGB, 1)}`}
                            </td>
                            <td style={{ padding: "10px", textAlign: "right" }}>
                              <Pill sev={h.snapAuthorized ? "success" : "danger"}>
                                {h.snapAuthorized ? <ShieldCheck size={11} /> : <ShieldX size={11} />}
                                {h.snapAuthorized ? "Auth" : "Denied"}
                              </Pill>
                            </td>
                            <td style={{ padding: "10px", textAlign: "right" }}>
                              <Pill sev={r.severity}>{r.health.status}</Pill>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <motion.button
                  whileHover={{ scale: 1.015, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => void doExport()}
                  disabled={exporting || valid.length === 0}
                  style={{
                    width: "100%",
                    padding: 15,
                    borderRadius: 14,
                    marginTop: 18,
                    cursor: exporting ? "wait" : "pointer",
                    border: "1.5px solid var(--gold-border)",
                    fontSize: 14,
                    fontWeight: 800,
                    letterSpacing: "1px",
                    background: "linear-gradient(135deg, var(--gold-bg), var(--maroon-bg))",
                    color: "var(--gold)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    opacity: valid.length === 0 ? 0.5 : 1,
                  }}
                >
                  <FileDown size={17} />
                  {exporting ? "GENERATING…" : "EXPORT STORAGE TEAM REPORT (XLSX)"}
                </motion.button>
                <p className="font-num" style={{ marginTop: 12, fontSize: 10.5, color: "var(--text-4)", letterSpacing: "0.4px" }}>
                  Summary + per-datastore detail + quarantine sheets · reference-numbered · {APP.formulaVersion}
                </p>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div style={{ padding: 12, borderRadius: 10, background: "var(--bg-input)", border: "1px solid var(--border-1)", textAlign: "center" }}>
      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "1.2px", textTransform: "uppercase", color: "var(--text-4)", marginBottom: 4 }}>{label}</div>
      <div className="font-num" style={{ fontSize: 19, fontWeight: 800, color: tone }}>{value}</div>
    </div>
  );
}

function Pill({ sev, children }: { sev: Severity; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center"
      style={{ gap: 5, fontSize: 10, fontWeight: 800, letterSpacing: "0.6px", textTransform: "uppercase", padding: "4px 9px", borderRadius: 7, background: SEV_BG[sev], color: SEV_COLOR[sev], border: `1px solid ${SEV_COLOR[sev]}44`, whiteSpace: "nowrap" }}
    >
      {children}
    </span>
  );
}

function tdR(color: string): React.CSSProperties {
  return { padding: "10px", textAlign: "right", fontSize: 12.5, fontWeight: 700, color, whiteSpace: "nowrap" };
}

function btnStyle(kind: "solid" | "ghost" | "danger"): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    padding: "10px 16px",
    borderRadius: 11,
    fontSize: 12.5,
    fontWeight: 800,
    letterSpacing: "0.4px",
    cursor: "pointer",
  };
  if (kind === "solid")
    return { ...base, color: "#f3dd9a", background: "linear-gradient(135deg, var(--maroon), var(--maroon-2))", border: "1.5px solid var(--gold-border)" };
  if (kind === "danger")
    return { ...base, color: "var(--red)", background: "var(--red-bg)", border: "1.5px solid rgba(239,68,68,0.3)" };
  return { ...base, color: "var(--gold)", background: "var(--gold-bg)", border: "1.5px solid var(--gold-border)" };
}
