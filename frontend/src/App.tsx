import { S } from "./styles/portfolioAnalyzerStyles";
import Sidebar from "./components/Sidebar";
import Results from "./components/Results";
import { useState } from "react";
import { type AnalysisResult, type Status } from "./types/type";

export default function App() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  return (
    <div style={S.app}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        input[type=date] { color-scheme: dark; }
        .qa-input:focus, .qa-select:focus, .qa-btn:focus-visible { outline: 2px solid #FFB020; outline-offset: 1px; }
        .qa-row:hover { background: #171D26; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-thumb { background: #2A3340; border-radius: 4px; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        @media (max-width: 768px) {
          .qa-body { flex-direction: column !important; }
          .qa-sidebar {
            width: 100% !important;
            position: static !important;
            border-right: none !important;
            border-bottom: 1px solid #232B36;
          }
          .qa-twocol { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 480px) {
          .qa-table { font-size: 11px !important; }
          .qa-table th, .qa-table td { padding: 5px 4px !important; }
        }
      `}</style>

      <div style={S.body} className="qa-body">
        <Sidebar setResult={setResult} status={status} setStatus={setStatus} />
        <Results result={result} status={status} />
      </div>
    </div>
  );
}
