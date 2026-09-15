/**
 * VCapacity shell — tab router, theme persistence, global toast styling,
 * crash boundary. Pure front-end: no backend, no external calls at runtime.
 */
import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Toaster } from "react-hot-toast";
import AmbientBackdrop from "./components/AmbientBackdrop";
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
  const [theme, setTheme] = usePersistentState("ui.theme", "dark");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", theme === "dark" ? "#070A12" : "#F2F4F8");
  }, [theme]);

  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      <AmbientBackdrop />
      <div style={{ position: "relative", zIndex: 1 }}>
      <Navbar tab={tab} setTab={setTab} theme={theme} toggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))} />

      <main>
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 16, filter: "blur(6px)", scale: 0.994 }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)", scale: 1 }}
            exit={{ opacity: 0, y: -10, filter: "blur(4px)", scale: 0.997 }}
            transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
          >
            <ErrorBoundary>
              {tab === "capacity" && <DatastoreTab />}
              {tab === "snapshot" && <SnapshotTab />}
              {tab === "bulk" && <BulkTab />}
              {tab === "planner" && <PlannerTab />}
            </ErrorBoundary>
          </motion.div>
        </AnimatePresence>
      </main>

      <footer style={{ maxWidth: 1500, margin: "36px auto 0", padding: "18px 20px 30px", borderTop: "1px solid var(--border-1)" }}>
        <div className="flex items-center justify-between flex-wrap" style={{ gap: 8 }}>
          <span style={{ fontSize: 11, color: "var(--text-4)", fontWeight: 600 }}>
            {APP.orgLine1} · {APP.orgLine2}
          </span>
          <span className="font-num" style={{ fontSize: 10.5, color: "var(--text-4)", letterSpacing: "0.5px" }}>
            {APP.name} v{APP.version} · {APP.formulaVersion} · {APP.classification}
          </span>
        </div>
      </footer>

      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "var(--bg-3)",
            color: "var(--text-1)",
            border: "1px solid var(--border-2)",
            borderRadius: "12px",
            fontSize: "12.5px",
            fontWeight: 600,
            boxShadow: "var(--shadow-card)",
          },
          success: { iconTheme: { primary: "var(--green)", secondary: "#0b0f1c" } },
          error: { iconTheme: { primary: "var(--red)", secondary: "#0b0f1c" } },
        }}
      />
      </div>
    </div>
  );
}
