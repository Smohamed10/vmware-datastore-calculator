/**
 * Top navigation — brand block, tab bar, theme toggle.
 *
 * BRAND LOGO: the file lives in /public as QNBLogo.png, so Vite copies it
 * verbatim into dist/ on every build and nginx serves it after deployment.
 * It renders directly on the header surface (object-fit: contain, no
 * forced white plate) so a transparent and an opaque logo both look right.
 * To use the official mark, just replace public/QNBLogo.png — same name.
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { CalendarClock, Database, FileSpreadsheet, Layers, Moon, Sun } from "lucide-react";
import { APP } from "../config/policy";

export type TabId = "capacity" | "snapshot" | "bulk" | "planner";

const NAV: { id: TabId; label: string; icon: typeof Database }[] = [
  { id: "capacity", label: "Capacity Assessment", icon: Database },
  { id: "snapshot", label: "Snapshot Sizing", icon: Layers },
  { id: "bulk", label: "Bulk Assessment", icon: FileSpreadsheet },
  { id: "planner", label: "Multi-VM Planner", icon: CalendarClock },
];

/** Brand mark: the official PNG from /public, with a drawn fallback if the
 *  asset is ever missing (mirrors the favicon concept so the brand never
 *  breaks). Never wrapped in a white plate — that was the "logo in a box"
 *  artifact. */
function BrandMark() {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <svg width="40" height="40" viewBox="0 0 40 40" role="img" aria-label={APP.name}>
        <rect x="1" y="1" width="38" height="38" rx="10" fill="var(--maroon)" />
        <rect x="4.5" y="4.5" width="31" height="31" rx="7" fill="none" stroke="var(--gold-border)" strokeWidth="1.4" />
        <path d="M11 13 L20 29 L29 13" fill="none" stroke="var(--gold)" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M25.5 20.5 a7 7 0 0 1 -11 0" fill="none" stroke="var(--gold)" strokeWidth="1.7" strokeLinecap="round" opacity="0.75" />
      </svg>
    );
  }
  return (
    <img
      src="/QNBLogo.png"
      alt={APP.orgLine1}
      onError={() => setFailed(true)}
      style={{ height: 40, width: "auto", maxWidth: 120, objectFit: "contain", borderRadius: 10, display: "block" }}
    />
  );
}

export default function Navbar({ tab, setTab, theme, toggleTheme }: { tab: TabId; setTab: (t: TabId) => void; theme: string; toggleTheme: () => void }) {
  return (
    <header
      className="sticky top-0 z-40"
      style={{ background: "var(--bg-header)", borderBottom: "1px solid var(--border-1)", backdropFilter: "blur(14px)" }}
    >
      <div className="mx-auto flex items-center justify-between flex-wrap" style={{ maxWidth: 1500, padding: "10px 20px", gap: 12 }}>
        {/* Brand */}
        <div className="flex items-center" style={{ gap: 12 }}>
          <motion.span
            whileHover={{ scale: 1.06, rotate: -3 }}
            whileTap={{ scale: 0.94 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
            style={{ display: "inline-flex" }}
          >
            <BrandMark />
          </motion.span>
          <div style={{ lineHeight: 1.2 }}>
            <div className="flex items-center" style={{ gap: 8 }}>
              <span className="brand-sheen" style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.2px" }}>{APP.name}</span>
              <span
                className="font-num"
                style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 6, color: "var(--gold)", background: "var(--gold-bg)", border: "1px solid var(--gold-border)" }}
              >
                v{APP.version}
              </span>
            </div>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--text-3)", letterSpacing: "0.4px" }}>Datastore & Snapshot Intelligence</span>
          </div>
        </div>

        {/* Tabs */}
        <nav aria-label="Primary" className="flex items-center" style={{ gap: 4, padding: 4, borderRadius: 14, background: "var(--bg-input)", border: "1px solid var(--border-1)" }}>
          {NAV.map((item) => {
            const active = tab === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                aria-current={active ? "page" : undefined}
                className="relative flex items-center"
                style={{
                  gap: 8, padding: "9px 15px", borderRadius: 11, border: "none", cursor: "pointer",
                  fontSize: 12, fontWeight: 700, letterSpacing: "0.2px",
                  color: active ? "#f3dd9a" : "var(--text-3)", background: "transparent", transition: "color .2s",
                }}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    style={{ position: "absolute", inset: 0, borderRadius: 11, background: "var(--maroon)", border: "1px solid var(--gold-border)" }}
                  />
                )}
                <Icon size={15} style={{ position: "relative" }} strokeWidth={2.1} />
                <span style={{ position: "relative" }} className="hidden lg:inline">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Theme toggle */}
        <motion.button
          whileTap={{ scale: 0.92, rotate: 15 }}
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          style={{
            width: 38, height: 38, borderRadius: 11, display: "grid", placeItems: "center", cursor: "pointer",
            color: "var(--gold)", background: "var(--bg-input)", border: "1px solid var(--border-2)",
          }}
        >
          {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        </motion.button>
      </div>
    </header>
  );
}
