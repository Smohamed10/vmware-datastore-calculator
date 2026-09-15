import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, Lock, OctagonX, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import type { Severity, Unit } from "../lib/engine";
import { UNITS, fmt } from "../lib/engine";

/* ── Card ──────────────────────────────────────────────────── */

interface CardProps {
  title?: string;
  sub?: string;
  accent?: string;
  delay?: number;
  glow?: string;
  children: ReactNode;
  className?: string;
}

export function Card({ title, sub, accent = "var(--maroon)", delay = 0, glow, children, className }: CardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ borderColor: "var(--border-3)" }}
      className={className}
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border-1)",
        borderRadius: 18,
        padding: 26,
        backdropFilter: "blur(12px)",
        boxShadow: glow ? `0 0 44px ${glow}, var(--shadow-card)` : "var(--shadow-card)",
        transition: "border-color 0.3s ease",
      }}
    >
      {(title || sub) && (
        <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid var(--border-1)" }}>
          <div className="flex items-center" style={{ gap: 12 }}>
            <div
              style={{
                width: 4,
                height: title ? 22 : 16,
                borderRadius: 2,
                background: `linear-gradient(180deg, ${accent}, ${accent}55)`,
              }}
            />
            <div>
              {title && <h3 style={{ fontSize: 17, fontWeight: 700, color: "var(--text-0)" }}>{title}</h3>}
              {sub && (
                <p style={{ fontSize: 13.5, color: "var(--text-3)", marginTop: 4, lineHeight: 1.6 }}>{sub}</p>
              )}
            </div>
          </div>
        </div>
      )}
      {children}
    </motion.div>
  );
}

/* ── Field (input + unit select, derived-value support) ────── */

interface FieldProps {
  label?: string;
  num?: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  unit?: Unit;
  onUnit?: (u: Unit) => void;
  showUnit?: boolean;
  suffix?: string;
  error?: string;
  step?: string;
  optional?: boolean;
  /** Visual treatment for policy-derived values (dimmed, lock icon). */
  derived?: boolean;
  derivedNote?: string;
  /** True when the user has hand-edited a derived value. */
  overridden?: boolean;
  onResetDerived?: () => void;
}

export function Field(props: FieldProps) {
  const {
    label, num, hint, value, onChange, unit, onUnit,
    showUnit = true, suffix, error, step = "any",
    optional, derived, derivedNote, overridden, onResetDerived,
  } = props;

  const borderColor = error
    ? "var(--red)"
    : derived && overridden
      ? "var(--gold-border)"
      : "var(--border-2)";

  const dimmed = derived && !overridden;

  return (
    <div style={{ marginBottom: 20 }}>
      {label && (
        <div className="flex items-center justify-between" style={{ marginBottom: 8, gap: 8 }}>
          <label
            className="flex items-center"
            style={{
              fontSize: 13,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.6px",
              color: "var(--text-3)",
              gap: 8,
              minWidth: 0,
            }}
          >
            {num && (
              <span
                className="font-num"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 24,
                  height: 24,
                  borderRadius: 7,
                  fontSize: 11,
                  fontWeight: 800,
                  flexShrink: 0,
                  background: "var(--maroon-bg)",
                  color: "var(--gold)",
                }}
              >
                {num}
              </span>
            )}
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
            {optional && !derived && <Tag tone="muted">optional</Tag>}
            {derived && !overridden && <Tag tone="gold">{derivedNote ?? "policy-derived"}</Tag>}
            {derived && overridden && <Tag tone="amber">manual override</Tag>}
          </label>
          {error && (
            <motion.span
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              style={{ fontSize: 12.5, color: "var(--red)", fontWeight: 700, textAlign: "right" }}
            >
              {error}
            </motion.span>
          )}
        </div>
      )}
      {hint && (
        <p
          className="flex items-start"
          style={{ fontSize: 12.5, color: "var(--text-4)", marginBottom: 10, lineHeight: 1.6, gap: 6, paddingLeft: num ? 32 : 0 }}
        >
          <Info size={12} style={{ flexShrink: 0, marginTop: 2, opacity: 0.7 }} />
          <span>{hint}</span>
        </p>
      )}
      <div className="flex items-center" style={{ gap: 8 }}>
        <div style={{ position: "relative", flex: 1, minWidth: 0, opacity: dimmed ? 0.72 : 1, transition: "opacity .25s" }}>
          {derived && (
            <Lock
              size={14}
              style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-4)", pointerEvents: "none" }}
            />
          )}
          <input
            type="number"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            step={step}
            min="0"
            aria-label={label}
            style={{
              width: "100%",
              padding: derived ? "14px 16px 14px 38px" : "14px 16px",
              borderRadius: 12,
              fontSize: 16,
              fontWeight: 600,
              outline: "none",
              background: dimmed ? "var(--bg-2)" : "var(--bg-input)",
              border: `1.5px solid ${borderColor}`,
              color: dimmed ? "var(--text-2)" : "var(--text-0)",
              boxShadow: error ? "0 0 0 3px var(--red-bg)" : "none",
              transition: "border-color .25s, box-shadow .25s, background .25s",
            }}
            onFocus={(e) => {
              if (!error) {
                e.currentTarget.style.borderColor = "var(--maroon)";
                e.currentTarget.style.boxShadow = "0 0 0 3px var(--maroon-bg)";
              }
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = borderColor;
              e.currentTarget.style.boxShadow = error ? "0 0 0 3px var(--red-bg)" : "none";
            }}
          />
        </div>
        {showUnit ? (
          <select
            value={unit}
            onChange={(e) => onUnit?.(e.target.value as Unit)}
            aria-label={`${label ?? "value"} unit`}
            style={{
              width: 84,
              padding: "14px 10px",
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 700,
              outline: "none",
              cursor: "pointer",
              background: "var(--bg-input)",
              border: "1.5px solid var(--border-2)",
              color: "var(--gold)",
              textAlign: "center",
            }}
          >
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        ) : (
          suffix && (
            <span
              className="font-num"
              style={{ fontSize: 13, fontWeight: 700, color: "var(--text-4)", whiteSpace: "nowrap", paddingRight: 4 }}
            >
              {suffix}
            </span>
          )
        )}
      </div>
      {derived && overridden && onResetDerived && (
        <motion.button
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={onResetDerived}
          className="flex items-center"
          style={{
            marginTop: 8,
            marginLeft: num ? 32 : 0,
            gap: 6,
            fontSize: 12,
            fontWeight: 700,
            color: "var(--gold)",
            background: "var(--gold-bg)",
            border: "1px solid var(--gold-border)",
            borderRadius: 8,
            padding: "5px 10px",
            cursor: "pointer",
          }}
        >
          <RotateCcw size={11} />
          Reset to policy default
        </motion.button>
      )}
    </div>
  );
}

function Tag({ tone, children }: { tone: "muted" | "gold" | "amber"; children: ReactNode }) {
  const c = {
    muted: { bg: "var(--bg-3)", fg: "var(--text-4)", bd: "var(--border-1)" },
    gold: { bg: "var(--gold-bg)", fg: "var(--gold)", bd: "var(--gold-border)" },
    amber: { bg: "var(--amber-bg)", fg: "var(--amber)", bd: "rgba(245,158,11,0.32)" },
  }[tone];
  return (
    <span
      style={{
        fontSize: 9.5,
        fontWeight: 800,
        letterSpacing: "1px",
        textTransform: "uppercase",
        padding: "3px 7px",
        borderRadius: 6,
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.bd}`,
        flexShrink: 0,
      }}
    >
      {children}
    </span>
  );
}

/* ── Result row / big result / units grid ──────────────────── */

export function Row({ label, value, gold, badge }: { label: string; value: string; gold?: boolean; badge?: ReactNode }) {
  return (
    <div
      className="flex items-center justify-between"
      style={{ padding: "10px 0", borderBottom: "1px dashed var(--border-1)", gap: 12 }}
    >
      <span className="flex items-center" style={{ fontSize: 14, color: "var(--text-2)", gap: 8 }}>
        {label}
        {badge}
      </span>
      <span className="font-num" style={{ fontSize: 14.5, fontWeight: 700, color: gold ? "var(--gold)" : "var(--text-0)", whiteSpace: "nowrap" }}>
        {value}
      </span>
    </div>
  );
}

export function BigResult({ label, value, sub, danger }: { label: string; value: string; sub?: string; danger?: boolean }) {
  const c = danger ? "var(--red)" : "var(--gold)";
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      style={{
        marginTop: 18,
        padding: "20px 16px",
        borderRadius: 14,
        textAlign: "center",
        background: `linear-gradient(135deg, ${danger ? "var(--red-bg)" : "var(--maroon-bg)"}, transparent)`,
        border: `1px solid ${danger ? "rgba(239,68,68,0.3)" : "var(--gold-border)"}`,
      }}
    >
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "2px", textTransform: "uppercase", color: "var(--text-4)" }}>
        {label}
      </div>
      <div className="font-num" style={{ fontSize: 32, fontWeight: 800, color: c, marginTop: 6 }}>
        {value}
      </div>
      {sub && (
        <div className="font-num" style={{ fontSize: 13, color: "var(--text-3)", marginTop: 4 }}>
          {sub}
        </div>
      )}
    </motion.div>
  );
}

export function UnitsGrid({ units }: { units: Record<Unit, number> }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginTop: 16 }}>
      {(["PB", "TB", "GB", "MB", "KB"] as Unit[]).map((u) => (
        <div
          key={u}
          style={{
            padding: "10px 6px",
            borderRadius: 10,
            textAlign: "center",
            background: "var(--bg-input)",
            border: "1px solid var(--border-1)",
          }}
        >
          <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "1.5px", color: "var(--text-4)" }}>{u}</div>
          <div className="font-num" title={String(units[u])} style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {fmt(units[u], u === "PB" || u === "TB" ? 3 : 1)}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Status panel / progress ───────────────────────────────── */

const SEV_COLOR: Record<Severity, string> = { success: "var(--green)", warning: "var(--amber)", danger: "var(--red)" };
const SEV_BG: Record<Severity, string> = { success: "var(--green-bg)", warning: "var(--amber-bg)", danger: "var(--red-bg)" };

export function StatusPanel({ sev, title, detail }: { sev: Severity; title: string; detail?: string }) {
  const Icon = sev === "success" ? CheckCircle2 : sev === "warning" ? AlertTriangle : OctagonX;
  return (
    <div
      className="flex items-start"
      style={{
        gap: 12,
        padding: "14px 16px",
        borderRadius: 14,
        background: SEV_BG[sev],
        border: `1px solid ${SEV_COLOR[sev]}44`,
      }}
    >
      <Icon size={20} style={{ color: SEV_COLOR[sev], flexShrink: 0, marginTop: 1 }} />
      <div>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: SEV_COLOR[sev], letterSpacing: "0.3px" }}>{title}</div>
        {detail && <div style={{ fontSize: 13, color: "var(--text-2)", marginTop: 5, lineHeight: 1.65 }}>{detail}</div>}
      </div>
    </div>
  );
}

interface ProgressProps {
  pct: number;
  sev: Severity;
  left?: string;
  right?: string;
  /** Draws the governance threshold tick (e.g. 25% policy line). */
  markerPct?: number;
  showMarkerLabel?: boolean;
}

export function Progress({ pct, sev, left, right, markerPct, showMarkerLabel }: ProgressProps) {
  const width = Math.max(0, Math.min(pct, 100));
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ position: "relative", height: 34 }}>
        {markerPct !== undefined && showMarkerLabel && (
          <div
            style={{
              position: "absolute",
              left: `${markerPct}%`,
              top: -4,
              transform: "translateX(-50%)",
              fontSize: 9.5,
              fontWeight: 800,
              letterSpacing: "0.8px",
              color: "var(--text-4)",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            {markerPct}% policy
          </div>
        )}
      </div>
      <div
        style={{
          position: "relative",
          height: 14,
          borderRadius: 7,
          background: "var(--bg-input)",
          border: "1px solid var(--border-1)",
          overflow: "visible",
          marginTop: -26,
        }}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${width}%` }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          style={{
            height: "100%",
            borderRadius: 7,
            background: `linear-gradient(90deg, ${SEV_COLOR[sev]}BB, ${SEV_COLOR[sev]})`,
            minWidth: width > 0 ? 8 : 0,
          }}
        />
        {markerPct !== undefined && (
          <div
            style={{
              position: "absolute",
              left: `${markerPct}%`,
              top: -5,
              bottom: -5,
              width: 2,
              background: "var(--text-4)",
              opacity: 0.65,
              borderRadius: 1,
            }}
          />
        )}
      </div>
      {(left || right) && (
        <div className="flex items-center justify-between" style={{ marginTop: 8, gap: 8 }}>
          <span className="font-num" style={{ fontSize: 12, color: "var(--text-3)" }}>{left}</span>
          <span className="font-num" style={{ fontSize: 12, color: "var(--text-3)" }}>{right}</span>
        </div>
      )}
    </div>
  );
}

/* ── Toggle / button / section label ───────────────────────── */

export function Toggle({ checked, onChange, label, sub }: { checked: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between w-full"
      style={{ gap: 14, cursor: "pointer", textAlign: "left", background: "none", border: "none", padding: 0 }}
    >
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>{label}</div>
        {sub && <div style={{ fontSize: 12.5, color: "var(--text-4)", marginTop: 3 }}>{sub}</div>}
      </div>
      <div
        style={{
          width: 46,
          height: 26,
          borderRadius: 13,
          flexShrink: 0,
          padding: 3,
          background: checked ? "var(--maroon)" : "var(--bg-3)",
          border: `1px solid ${checked ? "var(--gold-border)" : "var(--border-2)"}`,
          transition: "background .3s, border-color .3s",
        }}
      >
        <motion.div
          layout
          transition={{ type: "spring", stiffness: 500, damping: 32 }}
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: checked ? "var(--gold)" : "var(--text-4)",
            marginLeft: checked ? 20 : 0,
          }}
        />
      </div>
    </button>
  );
}

export function CalcButton({ onClick, label, disabled }: { onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <motion.button
      whileHover={{ scale: disabled ? 1 : 1.015, y: disabled ? 0 : -1 }}
      whileTap={{ scale: disabled ? 1 : 0.975 }}
      onClick={onClick}
      disabled={disabled}
      className="font-num"
      style={{
        width: "100%",
        padding: 16,
        marginTop: 6,
        borderRadius: 14,
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 14,
        fontWeight: 800,
        letterSpacing: "1.5px",
        textTransform: "uppercase",
        color: "#f3dd9a",
        border: "1.5px solid var(--gold-border)",
        background: "linear-gradient(135deg, var(--maroon), var(--maroon-2))",
        boxShadow: "0 6px 24px rgba(109,25,50,0.35)",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {label}
    </motion.button>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "2px", textTransform: "uppercase", color: "var(--text-4)", marginBottom: 10 }}>
      {children}
    </div>
  );
}
