import type { CSSProperties } from "react";

interface PanelProps {
  title: string;
  children: React.ReactNode;
}
export default function Panel({ title, children }: PanelProps) {
  const panel: CSSProperties = {
    background: "#101520",
    border: "1px solid #232B36",
    borderRadius: 10,
    padding: "16px 18px",
    marginBottom: 18,
  };
  const panelTitle: CSSProperties = {
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: 14.5,
    fontWeight: 600,
    marginBottom: 12,
    color: "#E7E5E0",
  };
  return (
    <div style={panel}>
      <div style={panelTitle}>{title}</div>
      {children}
    </div>
  );
}
