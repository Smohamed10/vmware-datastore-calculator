/**
 * Ambient animated backdrop — the app's living atmosphere.
 *
 * Four cheap, GPU-only layers behind everything:
 *   1. Drifting aurora orbs (maroon/gold brand light)
 *   2. A slowly panning technical grid (the "storage fabric")
 *   3. Rising data motes — light particles moving up the page
 *   4. Sweeping scan beams suggesting continuous measurement
 *
 * Rules that keep it safe for a bank dashboard:
 *   • pointer-events: none — never intercepts a click
 *   • transform/opacity only — no layout thrash, no repaint storms
 *   • fully disabled under prefers-reduced-motion
 *   • pauses when the tab is hidden (zero background CPU)
 */
import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

function useVisible() {
  const [visible, setVisible] = useState(!document.hidden);
  useEffect(() => {
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return visible;
}

interface Mote {
  id: number;
  left: number;
  size: number;
  delay: number;
  duration: number;
  drift: number;
  gold: boolean;
}

export default function AmbientBackdrop() {
  const reduced = useReducedMotion();
  const visible = useVisible();

  const motes = useMemo<Mote[]>(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        id: i,
        left: (i * 5.6 + ((i * 37) % 11)) % 100,
        size: 2 + ((i * 7) % 4),
        delay: (i * 1.35) % 16,
        duration: 17 + ((i * 5) % 13),
        drift: ((i % 5) - 2) * 26,
        gold: i % 3 === 0,
      })),
    []
  );

  if (reduced) return null;

  const animate = visible;

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        overflow: "hidden",
        pointerEvents: "none",
        contain: "strict",
      }}
    >
      {/* ── 1. drifting aurora orbs ── */}
      <motion.div
        animate={animate ? { x: [0, 90, -40, 0], y: [0, -60, 40, 0], scale: [1, 1.14, 0.95, 1] } : undefined}
        transition={{ duration: 34, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "absolute", top: "-16%", right: "-8%", width: 620, height: 620, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(122,27,55,0.30), rgba(122,27,55,0) 68%)",
          filter: "blur(38px)", willChange: "transform",
        }}
      />
      <motion.div
        animate={animate ? { x: [0, -70, 50, 0], y: [0, 50, -35, 0], scale: [1, 0.92, 1.1, 1] } : undefined}
        transition={{ duration: 42, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
        style={{
          position: "absolute", bottom: "-20%", left: "-10%", width: 700, height: 700, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(201,168,76,0.20), rgba(201,168,76,0) 68%)",
          filter: "blur(44px)", willChange: "transform",
        }}
      />
      <motion.div
        animate={animate ? { x: [0, 60, -55, 0], y: [0, -45, 55, 0], opacity: [0.5, 0.85, 0.45, 0.5] } : undefined}
        transition={{ duration: 28, repeat: Infinity, ease: "easeInOut", delay: 3 }}
        style={{
          position: "absolute", top: "38%", left: "42%", width: 460, height: 460, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(96,165,250,0.16), rgba(96,165,250,0) 70%)",
          filter: "blur(52px)", willChange: "transform, opacity",
        }}
      />

      {/* ── 2. panning storage-fabric grid ── */}
      <motion.div
        animate={animate ? { backgroundPosition: ["0px 0px", "72px 72px"] } : undefined}
        transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
        style={{
          position: "absolute", inset: "-72px",
          backgroundImage:
            "linear-gradient(var(--grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--grid-line) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          maskImage: "radial-gradient(ellipse 85% 65% at 50% 40%, #000 35%, transparent 78%)",
          WebkitMaskImage: "radial-gradient(ellipse 85% 65% at 50% 40%, #000 35%, transparent 78%)",
          willChange: "background-position",
        }}
      />

      {/* ── 3. rising data motes ── */}
      {motes.map((m) => (
        <motion.span
          key={m.id}
          initial={{ opacity: 0, y: "100vh", x: 0 }}
          animate={
            animate
              ? { opacity: [0, 0.9, 0.9, 0], y: "-12vh", x: [0, m.drift, 0] }
              : undefined
          }
          transition={{
            duration: m.duration,
            repeat: Infinity,
            delay: m.delay,
            ease: "linear",
            opacity: { duration: m.duration, times: [0, 0.12, 0.85, 1], repeat: Infinity, delay: m.delay },
            x: { duration: m.duration, repeat: Infinity, delay: m.delay, ease: "easeInOut" },
          }}
          style={{
            position: "absolute",
            left: `${m.left}%`,
            width: m.size,
            height: m.size,
            borderRadius: "50%",
            background: m.gold ? "var(--gold)" : "var(--mote-cool)",
            boxShadow: `0 0 ${m.size * 4}px ${m.gold ? "rgba(201,168,76,0.75)" : "rgba(122,27,55,0.65)"}`,
            willChange: "transform, opacity",
          }}
        />
      ))}

      {/* ── 4. measurement scan beams ── */}
      <motion.div
        animate={animate ? { y: ["-10vh", "110vh"] } : undefined}
        transition={{ duration: 13, repeat: Infinity, ease: "easeInOut", repeatDelay: 5 }}
        style={{
          position: "absolute", left: 0, right: 0, height: 180,
          background: "linear-gradient(180deg, transparent, var(--scan-tint), transparent)",
          willChange: "transform",
        }}
      />
      <motion.div
        animate={animate ? { x: ["-15vw", "115vw"] } : undefined}
        transition={{ duration: 19, repeat: Infinity, ease: "easeInOut", repeatDelay: 9, delay: 6 }}
        style={{
          position: "absolute", top: 0, bottom: 0, width: 240,
          background: "linear-gradient(90deg, transparent, var(--scan-tint-gold), transparent)",
          willChange: "transform",
        }}
      />
    </div>
  );
}
