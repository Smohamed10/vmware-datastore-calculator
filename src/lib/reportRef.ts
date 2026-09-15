const SEQ_KEY = "vcap.reportSeq";

/**
 * Generates a traceable reference ID for every exported artifact,
 * e.g. VCA-2026-0042. The counter persists locally so IDs are
 * monotonic per workstation and never repeat.
 */
export function nextReportRef(kind = "VCA"): string {
  let seq = 0;
  try {
    seq = parseInt(localStorage.getItem(SEQ_KEY) || "0", 10) || 0;
  } catch {
    seq = 0;
  }
  seq += 1;
  try {
    localStorage.setItem(SEQ_KEY, String(seq));
  } catch {
    // non-fatal
  }
  return `${kind}-${new Date().getFullYear()}-${String(seq).padStart(4, "0")}`;
}
