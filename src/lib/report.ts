/**
 * Single-assessment PNG report renderer — dependency-free (2D canvas),
 * theme-aware (follows the active UI palette), and self-contained so the
 * artifact can be attached straight to a change ticket.
 *
 * Layout: brand header → reference row → inputs echo → sizing breakdown →
 * health verdict → assumptions → sign-off block → classification footer.
 */
import { APP, POLICY } from "../config/policy";
import { fmt, smartUnit, type DatastoreResult, type HealthStatus } from "./engine";
import { downloadBlob } from "./bulk";
import { nextReportRef } from "./reportRef";

export interface AssessmentReportInput {
  datastoreName: string;
  usedGB: number;
  ramGB: number;
  dsCapGB: number;
  snapGB: number;
  curTotGB: number;
  curFreeGB: number;
  buffer: number;
  memSnap: boolean;
  source: "manual" | "rvtools";
  naaLunId?: string;
  cluster?: string;
  sizing: DatastoreResult;
  health: HealthStatus | null;
}

interface Palette {
  bg: string;
  card: string;
  line: string;
  text0: string;
  text2: string;
  text3: string;
  maroon: string;
  maroonDeep: string;
  gold: string;
  green: string;
  amber: string;
  red: string;
}

function palette(): Palette {
  const dark = document.documentElement.getAttribute("data-theme") !== "light";
  return dark
    ? {
        bg: "#0b0f1c", card: "#10152a", line: "rgba(148,163,205,0.16)",
        text0: "#ffffff", text2: "#b9c1d9", text3: "#8a94b0",
        maroon: "#7a1b37", maroonDeep: "#43101f", gold: "#c9a84c",
        green: "#22c55e", amber: "#f59e0b", red: "#ef4444",
      }
    : {
        bg: "#ffffff", card: "#f6f8fc", line: "rgba(25,34,64,0.14)",
        text0: "#0e1220", text2: "#3a4160", text3: "#5c6580",
        maroon: "#6d1932", maroonDeep: "#4c1123", gold: "#a8842f",
        green: "#15803d", amber: "#b45309", red: "#b91c1c",
      };
}

function loadLogo(): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = "/QNBLogo.png";
  });
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function exportAssessmentPng(input: AssessmentReportInput): Promise<string> {
  const ref = nextReportRef("VCA");
  const P = palette();
  const SCALE = 2;
  const W = 1240;
  const H = 1660;
  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);

  const M = 72; // page margin
  const CW = W - M * 2;
  let y = 0;

  /* page */
  ctx.fillStyle = P.bg;
  ctx.fillRect(0, 0, W, H);

  /* ── brand header ── */
  ctx.fillStyle = P.maroonDeep;
  ctx.fillRect(0, 0, W, 118);
  ctx.fillStyle = P.gold;
  ctx.fillRect(0, 118, W, 3);

  const logo = await loadLogo();
  if (logo) {
    const size = 66;
    ctx.save();
    rr(ctx, M, 26, size, size, 14);
    ctx.clip();
    ctx.drawImage(logo, M, 26, size, size);
    ctx.restore();
  } else {
    // Fallback monogram if the logo asset is unreachable: gold "V" tile.
    ctx.fillStyle = P.maroon;
    rr(ctx, M, 26, 66, 66, 14);
    ctx.fill();
    ctx.strokeStyle = "rgba(201,168,76,0.55)";
    ctx.lineWidth = 2;
    rr(ctx, M + 5, 31, 56, 56, 10);
    ctx.stroke();
    ctx.fillStyle = P.gold;
    ctx.font = "800 38px 'Inter Variable', 'Inter', sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText("V", M + 21, 62);
  }

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#f3dd9a";
  ctx.font = "800 30px 'Inter Variable', 'Inter', sans-serif";
  ctx.fillText("VCAPACITY", M + 88, 62);
  ctx.fillStyle = "rgba(237,239,247,0.72)";
  ctx.font = "500 15px 'Inter Variable', 'Inter', sans-serif";
  ctx.fillText("Datastore Capacity & Snapshot Assessment — Storage Team Report", M + 88, 88);

  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(237,239,247,0.6)";
  ctx.font = "600 13px 'Inter Variable', 'Inter', sans-serif";
  ctx.fillText(`${APP.orgLine1} · ${APP.orgLine2}`, W - M, 56);
  ctx.font = "700 15px 'JetBrains Mono Variable', 'JetBrains Mono', monospace";
  ctx.fillStyle = "#f3dd9a";
  ctx.fillText(ref, W - M, 80);
  ctx.textAlign = "left";

  y = 158;

  /* ── reference line ── */
  ctx.fillStyle = P.text3;
  ctx.font = "600 13px 'JetBrains Mono Variable', 'JetBrains Mono', monospace";
  ctx.fillText(
    `GENERATED ${new Date().toLocaleString("en-GB").toUpperCase()}   ·   ${APP.formulaVersion}   ·   v${APP.version}   ·   SOURCE ${input.source === "rvtools" ? "RVTOOLS IMPORT" : "MANUAL ENTRY"}`,
    M,
    y
  );
  y += 26;

  const card = (title: string, height: number) => {
    ctx.fillStyle = P.card;
    ctx.strokeStyle = P.line;
    ctx.lineWidth = 1.25;
    rr(ctx, M, y, CW, height, 18);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = P.gold;
    ctx.font = "800 13px 'Inter Variable', 'Inter', sans-serif";
    ctx.fillText(title, M + 28, y + 36);
    ctx.strokeStyle = P.line;
    ctx.beginPath();
    ctx.moveTo(M + 28, y + 52);
    ctx.lineTo(M + CW - 28, y + 52);
    ctx.stroke();
  };

  const kv = (x: number, yy: number, k: string, v: string, kw = 180) => {
  ctx.fillStyle = P.text3;
  ctx.font = "600 12.5px 'Inter Variable', 'Inter', sans-serif";
  ctx.fillText(k, x, yy);
  ctx.fillStyle = P.text0;
  ctx.font = "700 15px 'JetBrains Mono Variable', 'JetBrains Mono', monospace";
    ctx.fillText(v, x + kw, yy);
  };

  /* ── inputs echo ── */
  card("INPUTS ECHO", 232);
  let ry = y + 82;
  const col2x = M + 28 + CW / 2 - 14;
  kv(M + 28, ry, "Datastore", input.datastoreName || "—");
  kv(col2x, ry, "Cluster", input.cluster?.trim() || "—", 170);
  ry += 30;
  kv(M + 28, ry, "NAA / LUN ID", input.naaLunId?.trim() || "—");
  kv(col2x, ry, "Source", input.source === "rvtools" ? "RVTools import" : "Manual", 170);
  ry += 30;
  kv(M + 28, ry, "Used space", `${fmt(input.usedGB)} GB`);
  kv(col2x, ry, "Total VM RAM", `${fmt(input.ramGB)} GB${input.memSnap ? "  (×2 — memory state)" : ""}`, 170);
  ry += 30;
  kv(M + 28, ry, "Datastore capacity", `${fmt(input.dsCapGB)} GB`);
  kv(col2x, ry, "Current free", `${fmt(input.curFreeGB)} GB`, 170);
  ry += 30;
  kv(M + 28, ry, "Snapshot overhead", `${fmt(input.snapGB)} GB`);
  kv(col2x, ry, "Safety buffer", `${input.buffer}×`, 170);
  y += 232 + 22;

  /* ── sizing result ── */
  card("SIZING RESULT", 250);
  ry = y + 88;
  const s = input.sizing;
  ctx.fillStyle = P.text3;
  ctx.font = "600 13px 'Inter Variable', 'Inter', sans-serif";
  ctx.fillText("REQUIRED DATASTORE CAPACITY", M + 28, ry);
  ctx.fillStyle = P.gold;
  ctx.font = "800 52px 'JetBrains Mono Variable', 'JetBrains Mono', monospace";
  ctx.fillText(smartUnit(s.required), M + 28, ry + 56);

  const bx = M + 470;
  kv(bx, ry + 6, "Raw sum  (used + RAM + overhead)", `${fmt(s.raw)} GB`, 300);
  kv(bx, ry + 38, "Buffer padding", `${fmt(s.padding)} GB  (+${s.bufferPct.toFixed(0)}%)`, 300);
  kv(bx, ry + 70, "Effective RAM", `${fmt(s.ramGB)} GB`, 300);
  kv(bx, ry + 102, "Overhead reserve", `${fmt(s.snapGB)} GB`, 300);
  ctx.strokeStyle = P.line;
  ctx.beginPath();
  ctx.moveTo(bx, ry + 126);
  ctx.lineTo(M + CW - 28, ry + 126);
  ctx.stroke();
  kv(bx, ry + 154, "Formula", `(Used + RAM + Reserve) × ${input.buffer}`, 300);
  y += 250 + 22;

  /* ── health verdict ── */
  const h = input.health;
  const sevColor = h ? (h.status === "APPROVED" ? P.green : h.status === "WARNING" ? P.amber : P.red) : P.text3;
  card("HEALTH & GOVERNANCE VERDICT", 228);
  ry = y + 84;
  // status chip
  ctx.fillStyle = sevColor;
  rr(ctx, M + 28, ry - 24, 190, 44, 22);
  ctx.globalAlpha = 0.16;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = sevColor;
  ctx.lineWidth = 1.5;
  rr(ctx, M + 28, ry - 24, 190, 44, 22);
  ctx.stroke();
  ctx.fillStyle = sevColor;
  ctx.font = "800 19px 'Inter Variable', 'Inter', sans-serif";
  ctx.fillText(h ? h.status : "NOT ASSESSED", M + 52, ry + 4);

  ctx.fillStyle = h?.snapAuthorized ? P.green : P.red;
  ctx.font = "700 14px 'Inter Variable', 'Inter', sans-serif";
  ctx.fillText(h ? `Snapshots ${h.snapAuthorized ? "AUTHORIZED" : "DENIED — policy gate"}` : "", M + 240, ry + 3);

  ry += 34;
  kv(M + 28, ry, "Current free", `${fmt(h?.freePct ?? NaN)}%  (${fmt(h?.freeGB ?? NaN)} GB)`);
  kv(col2x, ry, "Projected free at peak", `${fmt(h?.projectedFreePct ?? NaN)}%  (${fmt(h?.projectedFreeGB ?? NaN)} GB)`, 220);
  ry += 30;
  kv(M + 28, ry, "Policy gate", `free ≥ ${POLICY.freeSpace.approvedPct}%  ·  peak ≥ ${POLICY.freeSpace.warningPct}%`);
  kv(col2x, ry, "Peak breach", h?.breachAtPeak ? "YES — demand crosses policy line" : "No", 220);
  ry += 34;
  if (h && !h.sufficient) {
    ctx.fillStyle = P.red;
    ctx.font = "700 14.5px 'Inter Variable', 'Inter', sans-serif";
    ctx.fillText(`Expansion required: +${fmt(h.gapGB)} GB to reach required capacity.`, M + 28, ry);
  } else {
    ctx.fillStyle = P.text2;
    ctx.font = "600 13.5px 'Inter Variable', 'Inter', sans-serif";
    ctx.fillText(h?.msg ?? "", M + 28, ry, );
  }
  y += 228 + 22;

  /* ── assumptions ── */
  card("ASSUMPTIONS & METHOD", 218);
  ry = y + 80;
  const assumptions = [
    `Required capacity = (Used + RAM${input.memSnap ? " ×2" : ""} + Overhead) × ${input.buffer}  ·  RAM doubles when memory state is captured`,
    `Overhead reserve = ${input.dsCapGB > 0 ? fmt((input.snapGB / input.dsCapGB) * 100, 1) : "—"}% of datastore capacity (policy default ${POLICY.overheadPercent * 100}%; user-overridable, tracked here)`,
    `Health approved when current free ≥ ${POLICY.freeSpace.approvedPct}% AND projected free at peak ≥ ${POLICY.freeSpace.warningPct}%`,
    `Projected free = current free − snapshot demand landing on this datastore at peak`,
    `Retention guidance: consolidate snapshots within ${POLICY.maxSnapshotAgeDays} day(s) to limit consolidation stun risk`,
  ];
  ctx.font = "600 13px 'Inter Variable', 'Inter', sans-serif";
  assumptions.forEach((a) => {
    ctx.fillStyle = P.gold;
    ctx.fillText("◆", M + 28, ry);
    ctx.fillStyle = P.text2;
    ctx.fillText(a, M + 52, ry);
    ry += 27;
  });
  y += 218 + 22;

  /* ── sign-off ── */
  card("SIGN-OFF", 168);
  ry = y + 92;
  const line = (x: number, label: string, wdt: number) => {
    ctx.strokeStyle = P.line;
    ctx.beginPath();
    ctx.moveTo(x, ry);
    ctx.lineTo(x + wdt, ry);
    ctx.stroke();
    ctx.fillStyle = P.text3;
    ctx.font = "600 12px 'Inter Variable', 'Inter', sans-serif";
    ctx.fillText(label, x, ry + 22);
  };
  line(M + 28, "Prepared by (Compute / Virtualization)", 330);
  line(M + 388, "Reviewed by (Storage Team)", 330);
  line(M + 748, "Change reference / date", 330);
  ctx.fillStyle = P.text3;
  ctx.font = "italic 500 12px 'Inter Variable', 'Inter', sans-serif";
  ctx.fillText("This assessment is advisory; execution requires an approved change record.", M + 28, ry + 52);
  y += 168 + 26;

  /* ── footer ── */
  ctx.fillStyle = P.maroonDeep;
  ctx.fillRect(0, H - 56, W, 56);
  ctx.fillStyle = "rgba(237,239,247,0.7)";
  ctx.font = "600 12px 'JetBrains Mono Variable', 'JetBrains Mono', monospace";
  ctx.fillText(`${APP.classification}  ·  ${ref}  ·  ${APP.formulaVersion}  ·  ${APP.orgLine1}`, M, H - 22);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
  if (blob) downloadBlob(blob, `VCapacity-Assessment-${(input.datastoreName || "datastore").replace(/[^\w.-]+/g, "-")}-${ref}.png`);
  return ref;
}
