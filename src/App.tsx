import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Toaster } from "react-hot-toast";
import Navbar, { type TabId } from "./components/Navbar";
import DatastoreTab from "./components/DatastoreTab";
import SnapshotTab from "./components/SnapshotTab";
import BulkTab from "./components/BulkTab";
import PlannerTab from "./components/PlannerTab";
import ErrorBoundary from "./components/ErrorBoundary";
import { APP } from "./config/policy";
import { usePersistentState } from "./lib/persist";

export default function App() {
  const [tab, setTab] = usePersistentState<TabId>("ui.tab", "capacity");
  const [theme, setTheme] = usePersistentState<"dark" | "light">("ui.theme", "dark");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return (
    <ErrorBoundary>
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: "var(--bg-3)",
              color: "var(--text-1)",
              border: "1px solid var(--border-2)",
              borderRadius: 14,
              fontSize: 13.5,
              fontWeight: 500,
              padding: "14px 18px",
              boxShadow: "var(--shadow-card)",
            },
            success: { iconTheme: { primary: "#22C55E", secondary: "var(--bg-0)" } },
            error: { iconTheme: { primary: "#EF4444", secondary: "var(--bg-0)" } },
          }}
        />

        <Navbar tab={tab} setTab={setTab} theme={theme} toggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))} />

        <main style={{ flex: 1, padding: "32px 20px 48px", maxWidth: 1500, margin: "0 auto", width: "100%" }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 14, filter: "blur(5px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -10, filter: "blur(5px)" }}
              transition={{ duration: 0.32, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              {tab === "capacity" && <DatastoreTab />}
              {tab === "snapshot" && <SnapshotTab />}
              {tab === "bulk" && <BulkTab />}
              {tab === "planner" && <PlannerTab />}
            </motion.div>
          </AnimatePresence>
        </main>

        <footer style={{ borderTop: "1px solid var(--border-1)", padding: "20px", textAlign: "center", background: "var(--bg-header)" }}>
          <p style={{ fontSize: 12, color: "var(--text-4)", letterSpacing: "0.3px" }}>
            {APP.orgLine1} · {APP.orgLine2}
          </p>
          <p className="font-num" style={{ fontSize: 10.5, color: "var(--text-4)", marginTop: 6, opacity: 0.75 }}>
            {APP.name} v{APP.version} · {APP.formulaVersion} · {APP.classification}
          </p>
        </footer>
      </div>
    </ErrorBoundary>
  );
}
