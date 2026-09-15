/**
 * ErrorBoundary — a crash in any tab must never white-screen the console.
 * Presents a branded recovery card with a reload action; the error is kept
 * on screen (and copyable) for the support ticket.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { OctagonAlert, RotateCcw } from "lucide-react";
import { APP } from "../config/policy";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Deliberately console-only: no external telemetry leaves the cluster.
    console.error(`[${APP.name}] component crash`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto flex flex-col items-center text-center" style={{ maxWidth: 560, margin: "80px auto", padding: 32 }}>
        <span
          style={{
            width: 64, height: 64, borderRadius: 20, display: "grid", placeItems: "center",
            color: "var(--red)", background: "var(--red-bg)", border: "1px solid rgba(239,68,68,0.35)",
          }}
        >
          <OctagonAlert size={30} />
        </span>
        <h1 style={{ fontSize: 19, fontWeight: 800, color: "var(--text-0)", margin: "20px 0 8px" }}>Something went wrong</h1>
        <p style={{ fontSize: 13, color: "var(--text-3)", lineHeight: 1.6 }}>
          {APP.name} hit an unexpected error. Your other tabs are unaffected — reload to recover this one, and include the
          message below if you open a ticket.
        </p>
        <pre
          className="font-num"
          style={{
            margin: "18px 0", padding: "12px 16px", borderRadius: 12, maxWidth: "100%", overflow: "auto",
            fontSize: 11.5, lineHeight: 1.5, textAlign: "left", whiteSpace: "pre-wrap",
            color: "var(--red)", background: "var(--bg-input)", border: "1px solid var(--border-1)",
          }}
        >
          {this.state.error.message}
        </pre>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center font-num"
          style={{
            gap: 8, padding: "11px 22px", borderRadius: 12, cursor: "pointer", fontSize: 12, fontWeight: 800,
            letterSpacing: "1px", textTransform: "uppercase", color: "#f3dd9a",
            background: "var(--maroon)", border: "1.5px solid var(--gold-border)",
          }}
        >
          <RotateCcw size={14} />
          Reload {APP.name}
        </button>
      </div>
    );
  }
}
