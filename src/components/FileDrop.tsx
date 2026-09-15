/**
 * Shared drag-and-drop zone for .xlsx ingestion (template or RVTools).
 * Used by Capacity Assessment, Bulk Assessment and the Multi-VM Planner so
 * the import gesture is identical everywhere.
 */
import { useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";

export default function FileDrop({
  onFile,
  busy = false,
  label = "Drop an RVTools export or the VCapacity template here",
  note,
  compact = false,
}: {
  onFile: (file: File) => void;
  busy?: boolean;
  label?: string;
  note?: string;
  compact?: boolean;
}) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handle = (f?: File | null) => {
    if (f && !busy) onFile(f);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        handle(e.dataTransfer.files?.[0]);
      }}
      className={over ? "dz-active" : undefined}
      style={{
        border: `1.5px dashed ${over ? "var(--gold)" : "var(--border-3)"}`,
        borderRadius: 14,
        padding: compact ? "16px" : "26px 22px",
        textAlign: "center",
        cursor: busy ? "wait" : "pointer",
        background: over ? "var(--gold-bg)" : "var(--bg-input)",
        transition: "background .18s ease, border-color .18s ease",
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        hidden
        onChange={(e) => {
          handle(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <div className="flex flex-col items-center" style={{ gap: 7 }}>
        {busy ? (
          <Loader2 size={compact ? 20 : 26} style={{ color: "var(--gold)", animation: "spin 1s linear infinite" }} />
        ) : (
          <FileUp size={compact ? 20 : 26} style={{ color: "var(--gold)" }} strokeWidth={1.8} />
        )}
        <div style={{ fontSize: compact ? 11.5 : 13, fontWeight: 700, color: "var(--text-1)", lineHeight: 1.45 }}>
          {busy ? "Parsing workbook…" : label}
        </div>
        {!busy && (
          <div className="font-num" style={{ fontSize: 10.5, color: "var(--text-4)", letterSpacing: "0.5px" }}>
            CLICK TO BROWSE · .XLSX ONLY · PARSED 100% IN-BROWSER
          </div>
        )}
        {note && !busy && <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2, lineHeight: 1.5 }}>{note}</div>}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
