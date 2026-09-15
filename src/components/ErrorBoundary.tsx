import { Component, type ReactNode } from "react";
import { OctagonX, RefreshCw } from "lucide-react";
import { APP } from "../config/policy";

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  message: string;
}

/**
 * Enterprise guardrail: a rendering fault must surface as a controlled
 * panel with a recovery action — never a white screen in front of a manager.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(err: unknown): State {
    return { hasError: true, message: err instanceof Error ? err.message : String(err) };
  }

  componentDidCatch(err: unknown) {
    console.error("[VCapacity] unhandled render error:", err);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ minHeight: "70vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div
          style={{
            maxWidth: 520,
            width: "100%",
            textAlign: "center",
            padding: "40px 32px",
            borderRadius: 18,
            background: "var(--bg-card)",
            border: "1px solid var(--red-bg)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <OctagonX size={40} style={{ color: "var(--red)", margin: "0 auto 16px" }} />
          <h2 style={{ fontSize: 19, fontWeight: 800, color: "var(--text-0)" }}>Something went wrong</h2>
          <p style={{ fontSize: 13.5, color: "var(--text-3)", marginTop: 10, lineHeight: 1.7 }}>
            {APP.name} hit an unexpected state. Your inputs are preserved locally — reload to recover. If this recurs,
            report it to Cloud &amp; Platform Services with the reference below.
          </p>
          <pre
            className="font-num"
            style={{
              marginTop: 16,
              padding: "10px 14px",
              borderRadius: 10,
              fontSize: 11.5,
              textAlign: "left",
              color: "var(--text-3)",
              background: "var(--bg-input)",
              border: "1px solid var(--border-1)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {this.state.message}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 20,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 22px",
              borderRadius: 12,
              border: "1.5px solid var(--gold-border)",
              background: "linear-gradient(135deg, var(--maroon), var(--maroon-2))",
              color: "#f3dd9a",
              fontWeight: 800,
              fontSize: 13,
              letterSpacing: "1px",
              cursor: "pointer",
            }}
          >
            <RefreshCw size={14} />
            RELOAD
          </button>
        </div>
      </div>
    );
  }
}
