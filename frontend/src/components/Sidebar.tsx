import { useEffect, useState } from "react";
import { Loader2, Play, Plus, Trash2 } from "lucide-react";
import { S } from "../styles/portfolioAnalyzerStyles";
import { analyzePortfolio, PortfolioApiError, validateSymbols } from "../../services/portfolioApi";

import { type Asset, type Status, type AnalysisResult } from "../types/type";
type Props = {
  setResult: React.Dispatch<React.SetStateAction<AnalysisResult | null>>;
  status: Status;
  setStatus: React.Dispatch<React.SetStateAction<Status>>;
  setErrorMsg: React.Dispatch<React.SetStateAction<string>>;
};
export default function Sidebar({ setResult, status, setStatus, setErrorMsg }: Props) {
  const todayStr = (): string => new Date().toISOString().slice(0, 10);
  const yearsAgoStr = (n: number): string => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - n);
    return d.toISOString().slice(0, 10);
  };
  const minDate = yearsAgoStr(10);

  const [invalidSymbols, setInvalidSymbols] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<"idle" | "validating" | "analyzing">("idle");
  const [assets, setAssets] = useState<Asset[]>([
    { id: 1, symbol: "AAPL", weight: 30 },
    { id: 2, symbol: "MSFT", weight: 30 },
    { id: 3, symbol: "SPY", weight: 40 },
  ]);
  const [nextId, setNextId] = useState<number>(4);
  const weightSum = assets.reduce((s, r) => s + (parseFloat(String(r.weight)) || 0), 0);
  const addRow = () => {
    setAssets((r) => [...r, { id: nextId, symbol: "", weight: 0 }]);
    setNextId((nextId) => nextId + 1);
  };
  const removeRow = (id: number) => setAssets((r) => r.filter((x) => x.id !== id));
  const updateRow = (id: number, field: keyof Asset, value: string) => {
    setAssets((r) => r.map((x) => (x.id === id ? { ...x, [field]: value } : x)));
    if (field === "symbol") setInvalidSymbols(new Set());
  };
  const [startDate, setStartDate] = useState<string>(yearsAgoStr(3));
  const [endDate, setEndDate] = useState<string>(todayStr());
  const [benchmark, setBenchmark] = useState<string>("SPY");
  const [riskFree, setRiskFree] = useState<number | string>(4.0);

  const normalizeWeights = () => {
    if (weightSum <= 0) return;
    setAssets((r) =>
      r.map((x) => ({
        ...x,
        weight: +(((parseFloat(String(x.weight)) || 0) * 100) / weightSum).toFixed(1),
      })),
    );
  };
  useEffect(() => {
    setNextId((n) => Math.max(n, ...assets.map((r) => r.id)) + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runAnalysis = async () => {
    setStatus("loading");
    setInvalidSymbols(new Set());
    const cleanAssets = assets
      .map((r) => ({ ...r, symbol: r.symbol.trim().toUpperCase(), weight: parseFloat(String(r.weight)) || 0 }))
      .filter((r) => r.symbol && r.weight > 0);

    if (cleanAssets.length === 0) {
      setStatus("error");
      setErrorMsg("Add at least one symbol with a positive weight.");
      return;
    }

    if (weightSum > 100) {
      setStatus("error");
      setErrorMsg(
        `Total portfolio weight is ${weightSum}% that is greater than 100%. Please adjust or normalize the weights.`,
      );
      return;
    }

    if (weightSum != 100) {
      setStatus("error");
      setErrorMsg(
        `Total portfolio weight is ${weightSum}% that is not equal to 100%. Please adjust the weights and rerun the analysis.`,
      );
      return;
    }

    const cleanBenchmark = benchmark.trim().toUpperCase();
    const symbolsToCheck = Array.from(new Set([...cleanAssets.map((r) => r.symbol), cleanBenchmark]));

    setPhase("validating");
    try {
      const { results } = await validateSymbols(symbolsToCheck);
      const invalid = results.filter((r) => !r.valid).map((r) => r.symbol);
      if (invalid.length > 0) {
        setInvalidSymbols(new Set(invalid));
        setStatus("error");
        setErrorMsg(`Unrecognized symbol${invalid.length > 1 ? "s" : ""}: ${invalid.join(", ")}`);
        return;
      }
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof PortfolioApiError ? err.message : "Could not validate symbols.");
      return;
    } finally {
      setPhase("idle");
    }

    setPhase("analyzing");
    try {
      const result = await analyzePortfolio({
        holdings: cleanAssets.map((r) => ({ symbol: r.symbol, weight: r.weight })),
        startDate,
        endDate,
        benchmark: cleanBenchmark,
        riskFreeRate: Number(riskFree),
      });
      setResult(result);
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof PortfolioApiError ? err.message : "Something went wrong running the analysis.");
    } finally {
      setPhase("idle");
    }
  };

  return (
    <aside style={S.sidebar} className="qa-sidebar">
      <h1 style={S.h1}>Portfolio Analyzer</h1>
      <p style={S.subtitle}>Enter symbols and weights, then run a historical performance &amp; risk analysis.</p>
      {/* Portfolio Assets */}
      <div style={S.section}>
        <div style={S.sectionLabel}>Assets</div>
        {assets.map((r) => (
          <div className="qa-row" key={r.id} style={S.holdingRow}>
            <input
              className="qa-input"
              style={{
                ...S.symbolInput,
                ...(invalidSymbols.has(r.symbol.trim().toUpperCase()) ? S.invalidInput : {}),
              }}
              value={r.symbol}
              placeholder="TICKER"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                updateRow(r.id, "symbol", e.target.value.toUpperCase())
              }
            />
            <input
              className="qa-input"
              style={S.weightInput}
              type="number"
              value={r.weight}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateRow(r.id, "weight", e.target.value)}
            />
            <span style={S.pctSign}>%</span>
            <button
              className="qa-btn"
              style={S.iconBtn}
              onClick={() => removeRow(r.id)}
              aria-label={`Remove ${r.symbol}`}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <div style={S.rowActions}>
          <button className="qa-btn" style={S.ghostBtn} onClick={addRow}>
            <Plus size={13} /> Add symbol
          </button>
          <button className="qa-btn" style={S.ghostBtn} onClick={normalizeWeights}>
            Normalize to 100%
          </button>
        </div>
        <div style={{ ...S.weightSumLine, color: Math.abs(weightSum - 100) < 0.01 ? "#5FBF6F" : "#F2545B" }}>
          Weight total: {weightSum.toFixed(2)}%
        </div>
      </div>
      {/* Other Inputs */}
      <div style={S.section}>
        <div style={S.sectionLabel}>Parameters</div>
        <label style={S.fieldLabel}>Start date</label>
        <input
          className="qa-input"
          style={S.fullInput}
          type="date"
          min={minDate}
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
        <label style={S.fieldLabel}>End date</label>
        <input
          className="qa-input"
          style={S.fullInput}
          type="date"
          max={todayStr()}
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
        <label style={S.fieldLabel}>Benchmark</label>
        <input
          className="qa-input"
          style={{
            ...S.fullInput,
            ...(invalidSymbols.has(benchmark.trim().toUpperCase()) ? S.invalidInput : {}),
          }}
          value={benchmark}
          onChange={(e) => {
            setBenchmark(e.target.value.toUpperCase());
            setInvalidSymbols(new Set());
          }}
        />
        <label style={S.fieldLabel}>Risk-free rate (annual %)</label>
        <input
          className="qa-input"
          style={S.fullInput}
          type="number"
          step="0.1"
          value={riskFree}
          onChange={(e) => setRiskFree(e.target.value)}
        />
      </div>

      <button className="qa-btn" style={S.runBtn} onClick={runAnalysis} disabled={status === "loading"}>
        {status === "loading" ? (
          <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />
        ) : (
          <Play size={15} />
        )}
        {status === "loading" ? (phase === "validating" ? "Checking symbols…" : "Running analysis…") : "Run analysis"}
      </button>
    </aside>
  );
}
