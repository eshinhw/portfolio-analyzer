import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, Play, Plus, Trash2 } from "lucide-react";
import { S } from "../styles/portfolioAnalyzerStyles";

interface Asset {
  id: number;
  symbol: string;
  weight: number | string;
}
interface CsvRow {
  date: string;
  close: number;
}
interface GrowthPoint {
  date: string;
  portfolio: number;
  benchmark: number;
}
interface DrawdownPoint {
  date: string;
  drawdown: number;
}
interface AssetStat {
  symbol: string;
  weight: number;
  totalReturn: number;
  cagr: number;
  vol: number;
  sharpe: number;
}
interface AnalysisResult {
  growthSeries: GrowthPoint[];
  drawdownSeries: DrawdownPoint[];
  maxDrawdown: number;
  totalReturn: number;
  cagr: number;
  annualVol: number;
  sharpe: number;
  beta: number;
  alpha: number;
  benchCagr: number;
  assetStats: AssetStat[];
  corr: number[][];
  symbols: string[];
  weights: number[];
  nObs: number;
  benchmark: string;
}
type Status = "idle" | "loading" | "error" | "done";
type DataSource = "live" | "demo" | null;

// ---------- deterministic PRNG / synthetic data helpers ----------
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seededNormal(rng: () => number): number {
  const u = Math.max(rng(), 1e-9);
  const v = Math.max(rng(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function businessDays(start: string, end: string): string[] {
  const days: string[] = [];
  let d = new Date(start);
  const endD = new Date(end);
  while (d <= endD) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) days.push(new Date(d).toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return days;
}
function generateSyntheticSeries(symbol: string, dates: string[]): number[] {
  const seed = hashString(symbol.toUpperCase());
  const rng = mulberry32(seed);
  const mu = 0.0002 + (seed % 100) / 1000000; // small drift, varies per symbol
  const sigma = 0.011 + ((seed >> 3) % 40) / 4000; // vol varies per symbol
  let price = 40 + (seed % 260);
  const closes: number[] = [];
  for (let i = 0; i < dates.length; i++) {
    const r = mu + sigma * seededNormal(rng);
    price = price * (1 + r);
    closes.push(price);
  }
  return closes;
}

// ---------- stats helpers ----------
const mean = (arr: number[]): number => arr.reduce((a, b) => a + b, 0) / arr.length;
const stdev = (arr: number[]): number => {
  const m = mean(arr);
  return Math.sqrt(mean(arr.map((x) => (x - m) ** 2)));
};
const covariance = (a: number[], b: number[]): number => {
  const ma = mean(a),
    mb = mean(b);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - ma) * (b[i] - mb);
  return s / a.length;
};
const correlation = (a: number[], b: number[]): number => {
  const sa = stdev(a),
    sb = stdev(b);
  if (sa === 0 || sb === 0) return 0;
  return covariance(a, b) / (sa * sb);
};
const dailyReturns = (closes: number[]): number[] => {
  const r: number[] = [];
  for (let i = 1; i < closes.length; i++) r.push(closes[i] / closes[i - 1] - 1);
  return r;
};

// ---------- live data fetch (stooq, CORS permitting) ----------
function parseCSV(text: string): CsvRow[] | null {
  const lines = text.trim().split("\n");
  if (lines.length < 2 || !lines[0].toLowerCase().includes("date")) return null;
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (parts.length < 5) continue;
    const [date, , , , close] = parts;
    const c = parseFloat(close);
    if (date && !Number.isNaN(c)) rows.push({ date, close: c });
  }
  return rows.length > 5 ? rows : null;
}

async function fetchLiveSeries(symbol: string, start: string, end: string): Promise<CsvRow[]> {
  const d1 = start.replace(/-/g, "");
  const d2 = end.replace(/-/g, "");
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol.toLowerCase())}.us&d1=${d1}&d2=${d2}&i=d`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("network");
  const text = await res.text();
  const parsed = parseCSV(text);
  if (!parsed) throw new Error("no data");
  return parsed;
}

export default function Sidebar() {
  const todayStr = (): string => new Date().toISOString().slice(0, 10);
  const yearsAgoStr = (n: number): string => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - n);
    return d.toISOString().slice(0, 10);
  };
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [assets, setAssets] = useState<Asset[]>([
    { id: 1, symbol: "AAPL", weight: 30 },
    { id: 2, symbol: "MSFT", weight: 30 },
    { id: 3, symbol: "SPY", weight: 40 },
  ]);
  const [nextId, setNextId] = useState<number>(4);
  const weightSum = assets.reduce((s, r) => s + (parseFloat(String(r.weight)) || 0), 0);
  const addRow = () => setAssets((r) => [...r, { id: nextId, symbol: "", weight: 0 }]);
  const removeRow = (id: number) => setAssets((r) => r.filter((x) => x.id !== id));
  const updateRow = (id: number, field: keyof Asset, value: string) =>
    setAssets((r) => r.map((x) => (x.id === id ? { ...x, [field]: value } : x)));
  const [startDate, setStartDate] = useState<string>(yearsAgoStr(3));
  const [endDate, setEndDate] = useState<string>(todayStr());
  const [benchmark, setBenchmark] = useState<string>("SPY");
  const [riskFree, setRiskFree] = useState<number | string>(4.0);
  const [forceDemo, setForceDemo] = useState<boolean>(false);
  const [status, setStatus] = useState<Status>("idle");
  const [dataSource, setDataSource] = useState<DataSource>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const normalizeWeights = () => {
    if (weightSum <= 0) return;
    setAssets((r) =>
      r.map((x) => ({
        ...x,
        weight: +(((parseFloat(String(x.weight)) || 0) * 100) / weightSum).toFixed(2),
      })),
    );
  };
  useEffect(() => {
    setNextId((n) => Math.max(n, ...assets.map((r) => r.id)) + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runAnalysis = useCallback(async () => {
    setStatus("loading");
    setErrorMsg("");
    setResult(null);

    const cleanAssets = assets
      .map((r) => ({ ...r, symbol: r.symbol.trim().toUpperCase(), weight: parseFloat(String(r.weight)) || 0 }))
      .filter((r) => r.symbol && r.weight > 0);

    if (cleanAssets.length === 0) {
      setStatus("error");
      setErrorMsg("Add at least one symbol with a positive weight.");
      return;
    }

    const wSum = cleanAssets.reduce((s, r) => s + r.weight, 0);
    const weights = cleanAssets.map((r) => r.weight / wSum);
    const symbols = cleanAssets.map((r) => r.symbol);
    const benchmarkSymbol = benchmark.trim().toUpperCase();
    const allSymbols = Array.from(new Set([...symbols, benchmarkSymbol]));

    let source: DataSource = forceDemo ? "demo" : "live";
    let seriesMap: Record<string, number[]> = {};
    let dates: string[] = [];

    if (!forceDemo) {
      try {
        const fetched = await Promise.all(allSymbols.map((s) => fetchLiveSeries(s, startDate, endDate)));
        const rawMap: Record<string, CsvRow[]> = {};
        fetched.forEach((rowsCsv, i) => {
          rawMap[allSymbols[i]] = rowsCsv;
        });
        const dateSets = allSymbols.map((s) => new Set(rawMap[s].map((r) => r.date)));
        const commonDates = [...dateSets[0]].filter((d) => dateSets.every((set) => set.has(d))).sort();
        if (commonDates.length < 20) throw new Error("insufficient overlap");
        allSymbols.forEach((s) => {
          const byDate = Object.fromEntries(rawMap[s].map((r) => [r.date, r.close]));
          seriesMap[s] = commonDates.map((d) => byDate[d]);
        });
        dates = commonDates;
      } catch (e) {
        source = "demo";
        seriesMap = {};
      }
    }

    if (source === "demo") {
      dates = businessDays(startDate, endDate);
      allSymbols.forEach((s) => {
        seriesMap[s] = generateSyntheticSeries(s, dates);
      });
    }

    setDataSource(source);

    const assetCloses = symbols.map((s) => seriesMap[s]);
    const benchCloses = seriesMap[benchmarkSymbol];

    const assetReturns = assetCloses.map((c) => dailyReturns(c));
    const benchReturns = dailyReturns(benchCloses);
    const n = assetReturns[0].length;

    const portfolioReturns: number[] = [];
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let j = 0; j < weights.length; j++) r += weights[j] * assetReturns[j][i];
      portfolioReturns.push(r);
    }

    const growth = [100];
    portfolioReturns.forEach((r) => growth.push(growth[growth.length - 1] * (1 + r)));
    const benchGrowth = [100];
    benchReturns.forEach((r) => benchGrowth.push(benchGrowth[benchGrowth.length - 1] * (1 + r)));

    const chartDates = dates.slice(1);
    const growthSeries: GrowthPoint[] = chartDates.map((d, i) => ({
      date: d,
      portfolio: growth[i + 1],
      benchmark: benchGrowth[i + 1],
    }));

    let peak = growth[0];
    const drawdownSeries: DrawdownPoint[] = chartDates.map((d, i) => {
      peak = Math.max(peak, growth[i + 1]);
      return { date: d, drawdown: (growth[i + 1] - peak) / peak };
    });
    const maxDrawdown = Math.min(...drawdownSeries.map((d) => d.drawdown));

    const totalReturn = growth[growth.length - 1] / 100 - 1;
    const years = n / 252;
    const cagr = Math.pow(1 + totalReturn, 1 / years) - 1;
    const annualVol = stdev(portfolioReturns) * Math.sqrt(252);
    const rf = (parseFloat(String(riskFree)) || 0) / 100;
    const sharpe = annualVol > 0 ? (cagr - rf) / annualVol : 0;
    const beta = covariance(portfolioReturns, benchReturns) / (stdev(benchReturns) ** 2 || 1e-9);
    const benchTotalReturn = benchGrowth[benchGrowth.length - 1] / 100 - 1;
    const benchCagr = Math.pow(1 + benchTotalReturn, 1 / years) - 1;
    const alpha = cagr - (rf + beta * (benchCagr - rf));

    const assetStats: AssetStat[] = symbols.map((s, j) => {
      const r = assetReturns[j];
      const tot = assetCloses[j][assetCloses[j].length - 1] / assetCloses[j][0] - 1;
      const cg = Math.pow(1 + tot, 1 / years) - 1;
      const vol = stdev(r) * Math.sqrt(252);
      return {
        symbol: s,
        weight: weights[j],
        totalReturn: tot,
        cagr: cg,
        vol,
        sharpe: vol > 0 ? (cg - rf) / vol : 0,
      };
    });

    const corr: number[][] = symbols.map((_s1, i) =>
      symbols.map((_s2, j) => correlation(assetReturns[i], assetReturns[j])),
    );

    setResult({
      growthSeries,
      drawdownSeries,
      maxDrawdown,
      totalReturn,
      cagr,
      annualVol,
      sharpe,
      beta,
      alpha,
      benchCagr,
      assetStats,
      corr,
      symbols,
      weights,
      nObs: n,
      benchmark: benchmarkSymbol,
    });
    setStatus("done");
  }, [assets, startDate, endDate, benchmark, riskFree, forceDemo]);

  return (
    <aside style={S.sidebar}>
      <h1 style={S.h1}>Portfolio Analyzer</h1>
      <p style={S.subtitle}>Enter tickers and weights, then run a historical performance &amp; risk analysis.</p>
      {/* Portfolio Assets */}
      <div style={S.section}>
        <div style={S.sectionLabel}>Holdings</div>
        {assets.map((r) => (
          <div className="qa-row" key={r.id} style={S.holdingRow}>
            <input
              className="qa-input"
              style={S.symbolInput}
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
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
        <label style={S.fieldLabel}>End date</label>
        <input
          className="qa-input"
          style={S.fullInput}
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
        <label style={S.fieldLabel}>Benchmark</label>
        <input
          className="qa-input"
          style={S.fullInput}
          value={benchmark}
          onChange={(e) => setBenchmark(e.target.value.toUpperCase())}
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
        <label style={S.checkboxLabel}>
          <input type="checkbox" checked={forceDemo} onChange={(e) => setForceDemo(e.target.checked)} />
          Use simulated data (skip live fetch)
        </label>
      </div>

      <button className="qa-btn" style={S.runBtn} onClick={runAnalysis} disabled={status === "loading"}>
        {status === "loading" ? (
          <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />
        ) : (
          <Play size={15} />
        )}
        {status === "loading" ? "Running analysis…" : "Run analysis"}
      </button>
      {status === "error" && (
        <div style={S.errorBox}>
          <AlertTriangle size={14} /> {errorMsg}
        </div>
      )}
    </aside>
  );
}
