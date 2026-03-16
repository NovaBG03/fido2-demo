import React, { useEffect, useRef } from "react";

interface Props {
  log: any[];
}

const stepColors: Record<string, string> = {
  arrow_right: "#6366f1",
  server: "#0891b2",
  key: "#d97706",
  shield: "#059669",
  check: "#16a34a",
  error: "#dc2626",
};

const stepEmoji: Record<string, string> = {
  arrow_right: "➡️",
  server: "🖥️",
  key: "🔑",
  shield: "🛡️",
  check: "✅",
  error: "❌",
};

function renderValue(value: any, depth = 0): React.ReactNode {
  if (value === null || value === undefined) return <span className="val-null">null</span>;
  if (typeof value === "boolean") return <span className="val-bool">{value ? "true" : "false"}</span>;
  if (typeof value === "number") return <span className="val-num">{value}</span>;
  if (typeof value === "string") {
    // Long hex strings
    if (value.length > 60 && /^[0-9a-f]+$/.test(value)) {
      return <span className="val-hex">{value.slice(0, 30)}...{value.slice(-10)}</span>;
    }
    return <span className="val-str">{value}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="val-str">[] (празен)</span>;
    return (
      <div className="val-array" style={{ paddingLeft: depth > 0 ? 16 : 0 }}>
        {value.map((item, i) => (
          <div key={i} className="val-array-item">
            <span className="val-index">[{i}]</span> {renderValue(item, depth + 1)}
          </div>
        ))}
      </div>
    );
  }
  if (typeof value === "object") {
    return (
      <div className="val-obj" style={{ paddingLeft: depth > 0 ? 16 : 0 }}>
        {Object.entries(value).map(([k, v]) => (
          <div key={k} className="val-obj-entry">
            <span className="val-key">{k}:</span>{" "}
            {renderValue(v, depth + 1)}
          </div>
        ))}
      </div>
    );
  }
  return <span>{String(value)}</span>;
}

export function CryptoDetails({ log }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log.length]);

  if (log.length === 0) {
    return (
      <div className="crypto-empty">
        <p>Тук ще се показват криптографските детайли при изпълнение на операция.</p>
      </div>
    );
  }

  return (
    <div className="crypto-log">
      {log.map((entry, i) => (
        <div
          key={i}
          className="crypto-entry"
          style={{ borderLeftColor: stepColors[entry.icon] || "#6366f1" }}
        >
          <div className="crypto-entry-header">
            <span className="crypto-emoji">{stepEmoji[entry.icon] || "📋"}</span>
            <h3>{entry.step}</h3>
          </div>
          {entry.description && (
            <p className="crypto-entry-desc">{entry.description}</p>
          )}
          <div className="crypto-entry-data">{renderValue(entry.data)}</div>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
