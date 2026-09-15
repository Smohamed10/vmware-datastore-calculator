/**
 * VCapacity shared UI primitives — cards, fields, meters, pills and the
 * hover-knowledge system (Tip / Th) that documents every header and value
 * in place. Everything reads the CSS design tokens so dark/light themes
 * and PNG report exports stay consistent.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, animate, motion, useMotionValue } from "framer-motion";
import { AlertTriangle, CheckCircle2, Eraser, Info, XCircle } from "lucide-react";
import type { Severity, Unit, UnitValue } from "../lib/engine";
import { UNITS } from "../lib/engine";
import { cn } from "../utils/cn";

export const SEV_COLOR: Record<Severity, string> = {
  success: "var(--green)",
  warning: "var(--amber)",
  danger: "var(--red)",
};

/* ── Hover knowledge tooltip ───────────────────────────────── *
 * Wrap any label/value with <Tip tip="…"> and users get a brief
 * explanation on hover (or keyboard focus).
 *
 * The bubble is rendered through a PORTAL into document.body. This is
 * essential, not cosmetic: `position: fixed` resolves against the nearest
 * ancestor that has a transform / filter / backdrop-filter / will-change —
 * and Cards use backdrop-filter while tab transitions animate blur+scale.
 * Rendered inline, the bubble was positioned relative to those ancestors
 * and landed in seemingly random places. In a body-level portal there is
 * no such containing block, so viewport coordinates are exact.
 * Placement is measured from the anchor rect, clamped to the viewport,
 * and flipped above/below depending on available room.                  */

const TIP_W = 280;

interface TipPos {
  left: number;
  top: number;
  below: boolean;
}

export function Tip({ tip, title, children, className }: { tip: string; title?: string; children: ReactNode; className?: string }) {
  const [pos, setPos] = useState<TipPos | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  const compute = (): TipPos | null => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || (r.width === 0 && r.height === 0)) return null;
    const vw = window.innerWidth;
    const half = Math.min(TIP_W, vw - 24) / 2;
    const cx = r.left + r.width / 2;
    const left = Math.max(12 + half, Math.min(vw - 12 - half, cx));
    // Prefer above; flip below when the anchor sits near the top edge.
    const below = r.top < 210;
    return below
      ? { left, top: Math.round(r.bottom + 10), below: true }
      : { left, top: Math.round(r.top - 10), below: false };
  };

  const show = () => setPos(compute());
  const hide = () => setPos(null);

  // A fixed bubble can't track a moving anchor — dismiss on scroll/resize.
  useEffect(() => {
    if (pos === null) return;
    window.addEventListener("scroll", hide, { capture: true, passive: true });
    window.addEventListener("resize", hide, { passive: true });
    window.addEventListener("wheel", hide, { passive: true });
    return () => {
      window.removeEventListener("scroll", hide, { capture: true } as EventListenerOptions);
      window.removeEventListener("resize", hide);
      window.removeEventListener("wheel", hide);
    };
  }, [pos !== null]);

  return (
    <span
      ref={ref}
      className={cn("inline-flex items-center", className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      tabIndex={0}
      role="note"
      aria-label={tip}
    >
      <span className="tip-anchor inline-flex items-center gap-1">{children}</span>
      {createPortal(
        <AnimatePresence>
          {pos !== null && (
            <motion.span
              className="tip-bubble"
              initial={{ opacity: 0, scale: 0.96, y: pos.below ? 4 : -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
              style={{
                left: pos.left,
                top: pos.top,
                maxWidth: TIP_W,
                translateX: "-50%",
                translateY: pos.below ? "0%" : "-100%",
              }}
            >
              {title && <span className="tip-title">{title}</span>}
              {tip}
            </motion.span>
          )}
        </AnimatePresence>,
        document.body
      )}
    </span>
  );
}

/** Small (i) glyph marking an element as documented on hover. */
export function InfoDot() {
  return <Info size={11} strokeWidth={2.4} style={{ color: "var(--text-4)", flexShrink: 0 }} aria-hidden />;
}

/* ── Table header with built-in explanation ────────────────── */

export function Th({ label, tip, align = "left", className }: { label: string; tip?: string; align?: "left" | "right" | "center"; className?: string }) {
  return (
    <th
      className={cn("font-num whitespace-nowrap px-3 py-2.5", className)}
      style={{
        textAlign: align,
        fontSize: 10.5,
        fontWeight: 800,
        letterSpacing: "0.9px",
        textTransform: "uppercase",
        color: "var(--text-3)",
        background: "var(--bg-2)",
        borderBottom: "1px solid var(--border-2)",
        position: "sticky",
        top: 0,
        zIndex: 5,
      }}
      scope="col"
    >
      {tip ? (
        <Tip tip={tip} title={label}>
          {label}
          <InfoDot />
        </Tip>
      ) : (
        label
      )}
    </th>
  );
}

export function Td({ children, align = "left", className, mono = true }: { children: ReactNode; align?: "left" | "right" | "center"; className?: string; mono?: boolean }) {
  return (
    <td
      className={cn(mono && "font-num", "whitespace-nowrap px-3 py-2.5", className)}
      style={{ textAlign: align, fontSize: 12, color: "var(--text-2)", borderBottom: "1px solid var(--border-1)" }}
    >
      {children}
    </td>
  );
}

/* ── Card ──────────────────────────────────────────────────── */

export function Card({ children, className, title, sub, right, id }: { children: ReactNode; className?: string; title?: ReactNode; sub?: ReactNode; right?: ReactNode; id?: string }) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 18, scale: 0.988 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={{ y: -2, boxShadow: "0 18px 50px rgba(2,6,17,0.5)" }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={cn("rounded-2xl", className)}
      style={{ background: "var(--bg-card)", border: "1px solid var(--border-1)", boxShadow: "var(--shadow-card)", backdropFilter: "blur(10px)" }}
    >
      {(title || right) && (
        <div className="flex items-center justify-between flex-wrap gap-3" style={{ padding: "18px 22px 0" }}>
          <div>
            {title && (
              <h2 className="flex items-center gap-2" style={{ fontSize: 13, fontWeight: 800, letterSpacing: "1.2px", textTransform: "uppercase", color: "var(--gold)" }}>
                {title}
              </h2>
            )}
            {sub && <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4, lineHeight: 1.5 }}>{sub}</p>}
          </div>
          {right}
        </div>
      )}
      <div style={{ padding: title || right ? "14px 22px 22px" : 22 }}>{children}</div>
    </motion.section>
  );
}

/* ── Status pill / chip ────────────────────────────────────── */

export function SevDot({ sev, size = 8, pulse = false }: { sev: Severity; size?: number; pulse?: boolean }) {
  const dot = (
    <span
      aria-hidden
      style={{
        width: size, height: size, borderRadius: "50%", display: "inline-block",
        background: SEV_COLOR[sev], boxShadow: `0 0 10px ${SEV_COLOR[sev]}66`, flexShrink: 0,
      }}
    />
  );
  if (!pulse) return dot;
  return (
    <motion.span
      aria-hidden
      initial={false}
      animate={{ scale: [1, 1.45, 1], opacity: [1, 0.55, 1] }}
      transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}
    >
      {dot}
    </motion.span>
  );
}

/** Small live indicator for panels whose numbers recompute as you type. */
export function LiveBadge() {
  return (
    <motion.span
      className="inline-flex items-center font-num"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 22 }}
      style={{
        gap: 7, padding: "3px 10px", borderRadius: 999, fontSize: 9.5, fontWeight: 800,
        letterSpacing: "1.2px", color: "var(--green)", background: "var(--green-bg)",
        border: "1px solid rgba(34,197,94,0.35)",
      }}
    >
      <SevDot sev="success" size={6} pulse />
      LIVE — UPDATES AS YOU TYPE
    </motion.span>
  );
}

/* ── Spring-tweened numbers ────────────────────────────────── *
 * Values glide between states instead of snapping — applied to
 * hero figures and planner stats so linked-field recomputation
 * feels physical.                                               */

export function AnimatedValue({
  value, format, className, style,
}: {
  value: number; format: (n: number) => string; className?: string; style?: CSSProperties;
}) {
  const mv = useMotionValue(value);
  const [txt, setTxt] = useState(() => format(value));

  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.65, ease: [0.22, 1, 0.36, 1] });
    const unsub = mv.on("change", (v) => setTxt(format(v)));
    return () => {
      controls.stop();
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <span className={className} style={style}>
      {txt}
    </span>
  );
}

const SEV_BG: Record<Severity, string> = { success: "var(--green-bg)", warning: "var(--amber-bg)", danger: "var(--red-bg)" };

export function StatusPill({ sev, children }: { sev: Severity; children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 font-num"
      style={{
        padding: "3px 10px", borderRadius: 999, fontSize: 10.5, fontWeight: 800, letterSpacing: "0.8px",
        color: SEV_COLOR[sev], background: SEV_BG[sev], border: `1px solid ${SEV_COLOR[sev]}44`,
      }}
    >
      <SevDot sev={sev} size={6} />
      {children}
    </span>
  );
}

export function Chip({ children, tone = "neutral", tip }: { children: ReactNode; tone?: "neutral" | "gold" | Severity; tip?: string }) {
  const color = tone === "gold" ? "var(--gold)" : tone === "neutral" ? "var(--text-3)" : SEV_COLOR[tone];
  const bg = tone === "gold" ? "var(--gold-bg)" : tone === "neutral" ? "var(--bg-input)" : SEV_BG[tone as Severity];
  const inner = (
    <span
      className="inline-flex items-center gap-1.5 font-num"
      style={{ padding: "3px 10px", borderRadius: 8, fontSize: 10.5, fontWeight: 700, color, background: bg, border: `1px solid ${color}33` }}
    >
      {children}
    </span>
  );
  return tip ? <Tip tip={tip}>{inner}</Tip> : inner;
}

/* ── Section label / field label ───────────────────────────── */

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="font-num" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "1.4px", textTransform: "uppercase", color: "var(--text-4)", marginTop: 18, marginBottom: 10 }}>
      {children}
    </div>
  );
}

export function FieldLabel({ children, tip }: { children: ReactNode; tip?: string }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 700, color: "var(--text-3)", marginBottom: 7, letterSpacing: "0.3px" }}>
      {tip ? (
        <Tip tip={tip} title={typeof children === "string" ? children : undefined}>
          {children}
          <InfoDot />
        </Tip>
      ) : (
        children
      )}
    </label>
  );
}

/* ── Inputs ────────────────────────────────────────────────── */

const inputStyle = (invalid?: boolean): React.CSSProperties => ({
  width: "100%",
  background: "var(--bg-input)",
  border: `1px solid ${invalid ? "var(--red)" : "var(--border-2)"}`,
  borderRadius: 11,
  padding: "10px 12px",
  fontSize: 13.5,
  color: "var(--text-1)",
  outline: "none",
  transition: "border-color .18s ease, box-shadow .18s ease",
  boxShadow: invalid ? "0 0 0 3px rgba(239,68,68,0.12)" : "none",
});

export function NumField({
  label, tip, value, onChange, min = 0, step = "any", invalid, placeholder = "0", hint,
}: {
  label?: string; tip?: string; value: UnitValue; onChange: (v: UnitValue) => void;
  min?: number; step?: string | number; invalid?: boolean; placeholder?: string; hint?: ReactNode;
}) {
  return (
    <div>
      {label && <FieldLabel tip={tip}>{label}</FieldLabel>}
      <div className="flex" style={{ gap: 8 }}>
        <input
          type="number"
          inputMode="decimal"
          min={min}
          step={step}
          placeholder={placeholder}
          value={value.v}
          onChange={(e) => onChange({ ...value, v: e.target.value })}
          style={inputStyle(invalid)}
          onFocus={(e) => (e.currentTarget.style.borderColor = invalid ? "var(--red)" : "var(--gold)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = invalid ? "var(--red)" : "var(--border-2)")}
        />
        <select
          value={value.u}
          onChange={(e) => onChange({ ...value, u: e.target.value as Unit })}
          className="font-num"
          style={{ ...inputStyle(false), width: 86, flexShrink: 0, cursor: "pointer" }}
          aria-label="Unit"
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
      </div>
      {hint && <div style={{ fontSize: 11, color: "var(--text-4)", marginTop: 6, lineHeight: 1.5 }}>{hint}</div>}
    </div>
  );
}

export function TextField({
  label, tip, value, onChange, placeholder, invalid,
}: {
  label?: string; tip?: string; value: string; onChange: (v: string) => void; placeholder?: string; invalid?: boolean;
}) {
  return (
    <div>
      {label && <FieldLabel tip={tip}>{label}</FieldLabel>}
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle(invalid)}
        onFocus={(e) => (e.currentTarget.style.borderColor = invalid ? "var(--red)" : "var(--gold)")}
        onBlur={(e) => (e.currentTarget.style.borderColor = invalid ? "var(--red)" : "var(--border-2)")}
      />
    </div>
  );
}

export function PlainNumInput({
  value, onChange, invalid, width, align = "right", step = "any",
}: {
  value: string; onChange: (v: string) => void; invalid?: boolean; width?: number | string; align?: "left" | "right"; step?: string | number;
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      min={0}
      step={step}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...inputStyle(invalid), padding: "6px 9px", fontSize: 12, width: width ?? "100%", textAlign: align }}
    />
  );
}

/* ── Toggle ────────────────────────────────────────────────── */

export function Toggle({ checked, onChange, label, sub }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; sub?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center w-full text-left"
      style={{ gap: 12, padding: "11px 13px", borderRadius: 12, background: "var(--bg-input)", border: `1px solid ${checked ? "var(--gold-border)" : "var(--border-1)"}`, cursor: "pointer", transition: "border-color .2s" }}
    >
      <span
        aria-hidden
        style={{
          width: 34, height: 20, borderRadius: 999, position: "relative", flexShrink: 0,
          background: checked ? "var(--maroon)" : "var(--bg-3)", border: `1px solid ${checked ? "var(--gold-border)" : "var(--border-2)"}`, transition: "background .2s",
        }}
      >
        <motion.span
          animate={{ x: checked ? 15 : 2 }}
          transition={{ type: "spring", stiffness: 500, damping: 32 }}
          style={{ position: "absolute", top: 2, width: 14, height: 14, borderRadius: "50%", background: checked ? "var(--gold)" : "var(--text-4)" }}
        />
      </span>
      <span style={{ flex: 1 }}>
        <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "var(--text-1)" }}>{label}</span>
        {sub && <span style={{ display: "block", fontSize: 11, color: "var(--text-3)", marginTop: 2, lineHeight: 1.45 }}>{sub}</span>}
      </span>
    </button>
  );
}

/* ── Buttons ───────────────────────────────────────────────── */

export function CalcButton({ onClick, label, disabled }: { onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <motion.button
      whileHover={disabled ? undefined : { scale: 1.015, y: -1 }}
      whileTap={disabled ? undefined : { scale: 0.975 }}
      onClick={onClick}
      disabled={disabled}
      className="font-num"
      style={{
        width: "100%", padding: 15, borderRadius: 13, cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 13, fontWeight: 800, letterSpacing: "1.5px", textTransform: "uppercase",
        color: "#f3dd9a", border: "1.5px solid var(--gold-border)",
        background: "var(--maroon)",
        boxShadow: "0 6px 24px rgba(109,25,50,0.35)",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {label}
    </motion.button>
  );
}

export function GhostButton({
  onClick, icon, label, danger = false, disabled = false, title,
}: {
  onClick: () => void; icon?: ReactNode; label: string; danger?: boolean; disabled?: boolean; title?: string;
}) {
  return (
    <motion.button
      whileHover={disabled ? undefined : { y: -1 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex items-center font-num"
      style={{
        gap: 8, padding: "9px 15px", borderRadius: 11, cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 11.5, fontWeight: 800, letterSpacing: "0.6px",
        color: danger ? "var(--red)" : "var(--text-2)",
        background: "var(--bg-input)",
        border: `1px solid ${danger ? "rgba(239,68,68,0.35)" : "var(--border-2)"}`,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {icon}
      {label}
    </motion.button>
  );
}

/** The canonical Clear control — identical across tabs so muscle
 *  memory transfers (Bulk ⇄ Capacity ⇄ Planner ⇄ Snapshot).      */
export function ClearButton({ onClick, disabled, label = "Clear" }: { onClick: () => void; disabled?: boolean; label?: string }) {
  return <GhostButton onClick={onClick} disabled={disabled} icon={<Eraser size={14} strokeWidth={2.2} />} label={label} title="Reset every input on this tab and wipe its saved values" />;
}

/* ── Progress meter with policy marker ─────────────────────── */

export function Meter({
  pct, sev, markerPct, left, right, showMarkerLabel = true,
}: {
  pct: number; sev: Severity; markerPct?: number; left?: string; right?: string; showMarkerLabel?: boolean;
}) {
  const width = Math.max(0, Math.min(100, pct));
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ position: "relative", height: markerPct !== undefined && showMarkerLabel ? 14 : 0 }}>
        {markerPct !== undefined && showMarkerLabel && (
          <span className="font-num" style={{ position: "absolute", left: `${markerPct}%`, transform: "translateX(-50%)", fontSize: 9.5, fontWeight: 700, color: "var(--text-4)", letterSpacing: "0.4px", whiteSpace: "nowrap" }}>
            {markerPct}% policy
          </span>
        )}
      </div>
      <div style={{ position: "relative", height: 13, borderRadius: 7, background: "var(--bg-input)", border: "1px solid var(--border-1)", overflow: "visible", marginTop: markerPct !== undefined && showMarkerLabel ? -2 : 0 }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${width}%` }}
          transition={{ type: "spring", stiffness: 90, damping: 18, mass: 0.7 }}
          style={{
            height: "100%", borderRadius: 7, opacity: 0.95, minWidth: width > 0 ? 8 : 0,
            background: `linear-gradient(90deg, ${SEV_COLOR[sev]}AA, ${SEV_COLOR[sev]})`,
            position: "relative", overflow: "hidden",
          }}
        >
          {/* travelling sheen — makes the meter feel instrumented */}
          <motion.span
            aria-hidden
            animate={{ x: ["-120%", "320%"] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut", repeatDelay: 1.6 }}
            style={{
              position: "absolute", top: 0, bottom: 0, width: "38%",
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
            }}
          />
        </motion.div>
        {markerPct !== undefined && (
          <span aria-hidden style={{ position: "absolute", left: `${markerPct}%`, top: -4, bottom: -4, width: 2, background: "var(--text-3)", borderRadius: 2, opacity: 0.7 }} />
        )}
      </div>
      {(left || right) && (
        <div className="flex items-center justify-between" style={{ marginTop: 7 }}>
          <span className="font-num" style={{ fontSize: 11.5, color: "var(--text-3)" }}>{left}</span>
          <span className="font-num" style={{ fontSize: 11.5, color: "var(--text-3)" }}>{right}</span>
        </div>
      )}
    </div>
  );
}

/* ── Stat card ─────────────────────────────────────────────── */

export function StatCard({ label, value, sub, tone, tip }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Severity | "gold"; tip?: string }) {
  const accent = tone === "gold" ? "var(--gold)" : tone ? SEV_COLOR[tone] : "var(--text-0)";
  return (
    <motion.div
      className="rounded-xl"
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={{ y: -3, borderColor: "var(--border-3)" }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      style={{ padding: "13px 15px", background: "var(--bg-input)", border: "1px solid var(--border-1)" }}
    >
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", color: "var(--text-4)", marginBottom: 6 }}>
        {tip ? (
          <Tip tip={tip} title={label}>
            {label}
            <InfoDot />
          </Tip>
        ) : (
          label
        )}
      </div>
      <div className="font-num" style={{ fontSize: 21, fontWeight: 800, color: accent, letterSpacing: "-0.3px", lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 5, lineHeight: 1.45 }}>{sub}</div>}
    </motion.div>
  );
}

/* ── Banner / empty state ──────────────────────────────────── */

export function InfoBanner({ sev, title, children, icon }: { sev: Severity; title?: ReactNode; children: ReactNode; icon?: ReactNode }) {
  const Icon = icon ?? (sev === "success" ? <CheckCircle2 size={18} /> : sev === "warning" ? <AlertTriangle size={18} /> : <XCircle size={18} />);
  return (
    <div
      className="flex items-start rounded-xl"
      style={{ gap: 12, padding: "13px 15px", background: SEV_BG[sev], border: `1px solid ${SEV_COLOR[sev]}44` }}
    >
      <span style={{ color: SEV_COLOR[sev], marginTop: 1, flexShrink: 0 }}>{Icon}</span>
      <div style={{ flex: 1 }}>
        {title && <div style={{ fontSize: 12.5, fontWeight: 800, color: SEV_COLOR[sev], marginBottom: 3, letterSpacing: "0.3px" }}>{title}</div>}
        <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.6 }}>{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, body, children }: { icon: ReactNode; title: string; body?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center" style={{ padding: "44px 24px", gap: 12 }}>
      <span
        style={{
          width: 62, height: 62, borderRadius: 18, display: "grid", placeItems: "center", color: "var(--gold)",
          background: "var(--gold-bg)", border: "1px solid var(--gold-border)", animation: "float-y 4.5s ease-in-out infinite",
        }}
      >
        {icon}
      </span>
      <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text-1)", marginTop: 4 }}>{title}</div>
      {body && <p style={{ fontSize: 12.5, color: "var(--text-3)", lineHeight: 1.65, maxWidth: 420 }}>{body}</p>}
      {children}
    </div>
  );
}

/* ── Segmented control ─────────────────────────────────────── */

export function Segmented<T extends string>({
  options, value, onChange,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex" style={{ gap: 4, padding: 4, borderRadius: 12, background: "var(--bg-input)", border: "1px solid var(--border-1)" }} role="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className="flex-1 inline-flex items-center justify-center font-num"
            style={{
              gap: 7, padding: "8px 12px", borderRadius: 9, border: "none", cursor: "pointer",
              fontSize: 11.5, fontWeight: 800, letterSpacing: "0.5px",
              color: active ? "#f3dd9a" : "var(--text-3)",
              background: active ? "var(--maroon)" : "transparent",
              transition: "background .2s, color .2s",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── Result rows (label + tip : value) ─────────────────────── */

export function ResultRow({ label, tip, value, strong = false, tone }: { label: string; tip?: string; value: ReactNode; strong?: boolean; tone?: Severity | "gold" }) {
  const color = tone === "gold" ? "var(--gold)" : tone ? SEV_COLOR[tone] : strong ? "var(--text-0)" : "var(--text-1)";
  return (
    <div className="flex items-center justify-between" style={{ padding: "7px 0", borderBottom: "1px dashed var(--border-1)" }}>
      <span style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 600 }}>
        {tip ? (
          <Tip tip={tip} title={label}>
            {label}
            <InfoDot />
          </Tip>
        ) : (
          label
        )}
      </span>
      <span className="font-num" style={{ fontSize: strong ? 15 : 13, fontWeight: strong ? 800 : 700, color }}>{value}</span>
    </div>
  );
}
