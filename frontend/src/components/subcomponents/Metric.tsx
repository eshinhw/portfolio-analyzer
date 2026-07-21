import type { CSSProperties } from "react";

interface MetricProps {
  label: string;
  value: string;
  positive?: boolean;
  neutral?: boolean;
}
export default function Metric({ label, value, positive, neutral }: MetricProps) {
  const color = neutral ? "#E7E5E0" : positive ? "#5FBF6F" : "#F2545B";
  const metricCard: CSSProperties = {
    background: "#131820",
    border: "1px solid #232B36",
    borderRadius: 8,
    padding: "12px 14px",
  };
  const metricLabel: CSSProperties = {
    fontSize: 11,
    color: "#8892A0",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  };
  const metricValue: CSSProperties = { fontFamily: "'IBM Plex Mono', monospace", fontSize: 19, fontWeight: 600 };

  return (
    <div style={metricCard}>
      <div style={metricLabel}>{label}</div>
      <div style={{ ...metricValue, color }}>{value}</div>
    </div>
  );
}
