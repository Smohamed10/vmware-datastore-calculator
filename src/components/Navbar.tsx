import { motion } from "framer-motion";
import { Camera, Database, FileSpreadsheet, Layers, Moon, Sun } from "lucide-react";
import { APP } from "../config/policy";

export type TabId = "capacity" | "snapshot" | "bulk" | "planner";

const NAV: { id: TabId; full: string; short: string; icon: typeof Database }[] = [
  { id: "capacity", full: "Capacity Assessment", short: "Capacity", icon: Database },
  { id: "snapshot", full: "Snapshot Sizing", short: "Snapshot", icon: Camera },
  { id: "bulk", full: "Bulk Assessment", short: "Bulk", icon: FileSpreadsheet },
  { id: "planner", full: "Multi-VM Planner", short: "Planner", icon: Layers },
];

interface NavbarProps {
  tab: TabId;
  setTab: (t: TabId) => void;
  theme: "dark" | "light";
  toggleTheme: () => void;
}

export default function Navbar({ tab, setTab, theme, toggleTheme }: NavbarProps) {
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "var(--bg-header)",
        backdropFilter: "blur(14px)",
        borderBottom: "1px solid var(--border-1)",
      }}
    >
      <div
        className="mx-auto flex items-center justify-between flex-wrap"
        style={{ maxWidth: 1500, padding: "12px 20px", gap: 12 }}
      >
        {/* Brand */}
        <div className="flex items-center" style={{ gap: 12, minWidth: 0 }}>
          <img
            src="/QNBLogo.png"
            alt={APP.orgLine1}
            style={{
              height: 38,
              width: 38,
              objectFit: "contain",
              borderRadius: 10,
              background: "#fff",
              padding: 3,
              border: "1px solid var(--border-2)",
            }}
          />
          <div style={{ lineHeight: 1.2 }}>
            <div className="flex items-center" style={{ gap: 8 }}>
              <span style={{ fontSize: 17, fontWeight: 800, color: "var(--text-0)", letterSpacing: "-0.2px" }}>
                {APP.name}
              </span>
              <span
                className="font-num"
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "2px 7px",
                  borderRadius: 6,
                  color: "var(--gold)",
                  background: "var(--gold-bg)",
                  border: "1px solid var(--gold-border)",
                }}
              >
                v{APP.version}
              </span>
            </div>
            <div className="hidden sm:block" style={{ fontSize: 10.5, color: "var(--text-4)", letterSpacing: "0.4px" }}>
              Datastore &amp; Snapshot Intelligence
            </div>
          </div>
        </div>

        {/* Tabs */}
        <nav
          aria-label="Primary"
          className="flex items-center"
          style={{ gap: 4, padding: 4, borderRadius: 14, background: "var(--bg-input)", border: "1px solid var(--border-1)" }}
        >
          {NAV.map((item) => {
            const active = tab === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                aria-current={active ? "page" : undefined}
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "9px 16px",
                  borderRadius: 10,
                  border: "none",
                  cursor: "pointer",
                  background: "transparent",
                  fontSize: 13.5,
                  fontWeight: active ? 700 : 500,
                  color: active ? "#f3dd9a" : "var(--text-3)",
                  transition: "color .25s",
                  whiteSpace: "nowrap",
                }}
              >
                {active && (
                  <motion.span
                    layoutId="nav-pill"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    style={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: 10,
                      background: "linear-gradient(135deg, var(--maroon), var(--maroon-2))",
                      border: "1px solid var(--gold-border)",
                      boxShadow: "0 4px 18px rgba(109,25,50,0.4)",
                    }}
                  />
                )}
                <span style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}>
                  <Icon size={15} />
                  <span className="hidden md:inline">{item.full}</span>
                  <span className="md:hidden">{item.short}</span>
                </span>
              </button>
            );
          })}
        </nav>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 40,
            height: 40,
            borderRadius: 12,
            cursor: "pointer",
            background: "var(--bg-input)",
            border: "1px solid var(--border-2)",
            color: "var(--gold)",
            transition: "border-color .25s",
          }}
        >
          {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        </button>
      </div>
    </header>
  );
}
