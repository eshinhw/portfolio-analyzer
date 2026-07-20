import React, { useState, useMemo, useCallback, useEffect, CSSProperties } from "react";
import {
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from "recharts";
import { Plus, Trash2, Play, Loader2, AlertTriangle, RadioTower, ArrowUpRight, ArrowDownRight } from "lucide-react";

// ---------- types ----------
interface HoldingRow {
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
    a |= 0; a = (a + 0x6D2B79F5) | 0;
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

// ---------- stats helpers ----------
const mean = (arr: number[]): number => arr.reduce((a, b) => a + b, 0) / arr.length;
const stdev = (arr: number[]): number => {
  const m = mean(arr);
  return Math.sqrt(mean(arr.map((x) => (x - m) ** 2)));
};
const covariance = (a: number[], b: number[]): number => {
  const ma = mean(a), mb = mean(b);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - ma) * (b[i] - mb);
  return s / a.length;
};
const correlation = (a: number[], b: number[]): number => {
  const sa = stdev(a), sb = stdev(b);
  if (sa === 0 || sb === 0) return 0;
  return covariance(a, b) / (sa * sb);
};
const dailyReturns = (closes: number[]): number[] => {
  const r: number[] = [];
  for (let i = 1; i < closes.length; i++) r.push(closes[i] / closes[i - 1] - 1);
  return r;
};
const fmtPct = (x: number, d = 2): string => `${(x * 100).toFixed(d)}%`;
const fmtNum = (x: number, d = 2): string => x.toFixed(d);

const PALETTE = ["#FFB020", "#4FD1C5", "#F2545B", "#8B7EF2", "#5FBF6F", "#E8963B", "#6EC6E8", "#D986C0"];

const todayStr = (): string => new Date().toISOString().slice(0, 10);
const yearsAgoStr = (n: number): string => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return d.toISOString().slice(0, 10);
};

export default function PortfolioAnalyzer() {
  const [rows, setRows] = useState<HoldingRow[]>([
    { id: 1, symbol: "AAPL", weight: 30 },
    { id: 2, symbol: "MSFT", weight: 30 },
    { id: 3, symbol: "SPY", weight: 40 },
  ]);
  const [nextId, setNextId] = useState<number>(4);
  const [startDate, setStartDate] = useState<string>(yearsAgoStr(3));
  const [endDate, setEndDate] = useState<string>(todayStr());
  const [benchmark, setBenchmark] = useState<string>("SPY");
  const [riskFree, setRiskFree] = useState<number | string>(4.0);
  const [forceDemo, setForceDemo] = useState<boolean>(false);

  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [dataSource, setDataSource] = useState<DataSource>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const weightSum = rows.reduce((s, r) => s + (parseFloat(String(r.weight)) || 0), 0);

  const addRow = () => setRows((r) => [...r, { id: nextId, symbol: "", weight: 0 }]);
  const removeRow = (id: number) => setRows((r) => r.filter((x) => x.id !== id));
  const updateRow = (id: number, field: keyof HoldingRow, value: string) =>
    setRows((r) => r.map((x) => (x.id === id ? { ...x, [field]: value } : x)));
  const normalizeWeights = () => {
    if (weightSum <= 0) return;
    setRows((r) => r.map((x) => ({
      ...x,
      weight: +(((parseFloat(String(x.weight)) || 0) * 100) / weightSum).toFixed(2),
    })));
  };
  useEffect(() => {
    setNextId((n) => Math.max(n, ...rows.map((r) => r.id)) + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runAnalysis = useCallback(async () => {
    setStatus("loading");
    setErrorMsg("");
    setResult(null);

    const cleanRows = rows
      .map((r) => ({ ...r, symbol: r.symbol.trim().toUpperCase(), weight: parseFloat(String(r.weight)) || 0 }))
      .filter((r) => r.symbol && r.weight > 0);

    if (cleanRows.length === 0) {
      setStatus("error");
      setErrorMsg("Add at least one symbol with a positive weight.");
      return;
    }
    const wSum = cleanRows.reduce((s, r) => s + r.weight, 0);
    const weights = cleanRows.map((r) => r.weight / wSum);
    const symbols = cleanRows.map((r) => r.symbol);
    const benchmarkSymbol = benchmark.trim().toUpperCase();
    const allSymbols = Array.from(new Set([...symbols, benchmarkSymbol]));

    let source: DataSource = forceDemo ? "demo" : "live";
    let seriesMap: Record<string, number[]> = {};
    let dates: string[] = [];

    if (!forceDemo) {
      try {
        const fetched = await Promise.all(allSymbols.map((s) => fetchLiveSeries(s, startDate, endDate)));
        const rawMap: Record<string, CsvRow[]> = {};
        fetched.forEach((rowsCsv, i) => { rawMap[allSymbols[i]] = rowsCsv; });
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
      allSymbols.forEach((s) => { seriesMap[s] = generateSyntheticSeries(s, dates); });
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
      date: d, portfolio: growth[i + 1], benchmark: benchGrowth[i + 1],
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
        symbol: s, weight: weights[j], totalReturn: tot, cagr: cg, vol,
        sharpe: vol > 0 ? (cg - rf) / vol : 0,
      };
    });

    const corr: number[][] = symbols.map((_s1, i) => symbols.map((_s2, j) => correlation(assetReturns[i], assetReturns[j])));

    setResult({
      growthSeries, drawdownSeries, maxDrawdown, totalReturn, cagr, annualVol, sharpe,
      beta, alpha, benchCagr, assetStats, corr, symbols, weights, nObs: n,
      benchmark: benchmarkSymbol,
    });
    setStatus("done");
  }, [rows, startDate, endDate, benchmark, riskFree, forceDemo]);

  const pieData = useMemo(
    () =>
      rows
        .map((r) => ({ name: (r.symbol || "?").toUpperCase(), value: parseFloat(String(r.weight)) || 0 }))
        .filter((d) => d.value > 0),
    [rows]
  );

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
      `}</style>

      {/* ticker strip */}
      <div style={S.tickerStrip}>
        <RadioTower size={14} color="#FFB020" style={{ flexShrink: 0 }} />
        <div style={S.tickerScroll}>
          {(pieData.length ? pieData : [{ name: "ADD", value: 0 }]).concat(pieData).map((d, i) => (
            <span key={i} style={S.tickerItem}>
              <b style={{ color: "#E7E5E0" }}>{d.name}</b>
              <span style={{ color: "#8892A0" }}>{d.value ? `${d.value}%` : ""}</span>
            </span>
          ))}
        </div>
      </div>

      <div style={S.body}>
        {/* sidebar */}
        <aside style={S.sidebar}>
          <h1 style={S.h1}>Portfolio<br />Quant Desk</h1>
          <p style={S.subtitle}>Enter tickers and weights, then run a historical performance &amp; risk analysis.</p>

          <div style={S.section}>
            <div style={S.sectionLabel}>Holdings</div>
            {rows.map((r) => (
              <div className="qa-row" key={r.id} style={S.holdingRow}>
                <input
                  className="qa-input"
                  style={S.symbolInput}
                  value={r.symbol}
                  placeholder="TICKER"
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateRow(r.id, "symbol", e.target.value.toUpperCase())}
                />
                <input
                  className="qa-input"
                  style={S.weightInput}
                  type="number"
                  value={r.weight}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateRow(r.id, "weight", e.target.value)}
                />
                <span style={S.pctSign}>%</span>
                <button className="qa-btn" style={S.iconBtn} onClick={() => removeRow(r.id)} aria-label={`Remove ${r.symbol}`}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <div style={S.rowActions}>
              <button className="qa-btn" style={S.ghostBtn} onClick={addRow}><Plus size={13} /> Add symbol</button>
              <button className="qa-btn" style={S.ghostBtn} onClick={normalizeWeights}>Normalize to 100%</button>
            </div>
            <div style={{ ...S.weightSumLine, color: Math.abs(weightSum - 100) < 0.01 ? "#5FBF6F" : "#F2545B" }}>
              Weight total: {weightSum.toFixed(2)}%
            </div>
          </div>

          <div style={S.section}>
            <div style={S.sectionLabel}>Parameters</div>
            <label style={S.fieldLabel}>Start date</label>
            <input className="qa-input" style={S.fullInput} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <label style={S.fieldLabel}>End date</label>
            <input className="qa-input" style={S.fullInput} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            <label style={S.fieldLabel}>Benchmark</label>
            <input className="qa-input" style={S.fullInput} value={benchmark} onChange={(e) => setBenchmark(e.target.value.toUpperCase())} />
            <label style={S.fieldLabel}>Risk-free rate (annual %)</label>
            <input className="qa-input" style={S.fullInput} type="number" step="0.1" value={riskFree} onChange={(e) => setRiskFree(e.target.value)} />
            <label style={S.checkboxLabel}>
              <input type="checkbox" checked={forceDemo} onChange={(e) => setForceDemo(e.target.checked)} />
              Use simulated data (skip live fetch)
            </label>
          </div>

          <button className="qa-btn" style={S.runBtn} onClick={runAnalysis} disabled={status === "loading"}>
            {status === "loading" ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> : <Play size={15} />}
            {status === "loading" ? "Running analysis…" : "Run analysis"}
          </button>
          {status === "error" && (
            <div style={S.errorBox}><AlertTriangle size={14} /> {errorMsg}</div>
          )}
        </aside>

        {/* main */}
        <main style={S.main}>
          {status !== "done" && (
            <div style={S.emptyState}>
              <div style={S.emptyGlyph}>◆</div>
              <p>Set up your holdings on the left, then run the analysis to see historical returns, risk metrics, drawdown, and correlations.</p>
            </div>
          )}

          {status === "done" && result && (
            <>
              {dataSource === "demo" && (
                <div style={S.banner}>
                  <AlertTriangle size={14} color="#FFB020" />
                  Showing simulated price data — live market data wasn't reachable from this browser session (or "simulated data" was selected). Methodology and math are identical to the live path; figures are illustrative only.
                </div>
              )}

              {/* metric strip */}
              <div style={S.metricGrid}>
                <Metric label="Total return" value={fmtPct(result.totalReturn)} positive={result.totalReturn >= 0} />
                <Metric label="CAGR" value={fmtPct(result.cagr)} positive={result.cagr >= 0} />
                <Metric label="Annualized volatility" value={fmtPct(result.annualVol)} neutral />
                <Metric label="Sharpe ratio" value={fmtNum(result.sharpe)} positive={result.sharpe >= 0} />
                <Metric label="Max drawdown" value={fmtPct(result.maxDrawdown)} positive={false} />
                <Metric label={`Beta vs ${result.benchmark}`} value={fmtNum(result.beta)} neutral />
                <Metric label="Alpha (annualized)" value={fmtPct(result.alpha)} positive={result.alpha >= 0} />
                <Metric label="Observations" value={`${result.nObs} days`} neutral />
              </div>

              {/* growth chart */}
              <Panel title={`Growth of $100 — Portfolio vs ${result.benchmark}`}>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={result.growthSeries}>
                    <CartesianGrid stroke="#232B36" strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fill: "#8892A0", fontSize: 11 }} minTickGap={40} />
                    <YAxis tick={{ fill: "#8892A0", fontSize: 11 }} domain={["auto", "auto"]} />
                    <Tooltip contentStyle={S.tooltip} labelStyle={{ color: "#8892A0" }} />
                    <Legend wrapperStyle={{ fontSize: 12, color: "#8892A0" }} />
                    <Line type="monotone" dataKey="portfolio" name="Portfolio" stroke="#FFB020" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="benchmark" name={result.benchmark} stroke="#4FD1C5" dot={false} strokeWidth={1.5} strokeDasharray="4 3" />
                  </LineChart>
                </ResponsiveContainer>
              </Panel>

              {/* drawdown */}
              <Panel title="Portfolio drawdown">
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={result.drawdownSeries}>
                    <CartesianGrid stroke="#232B36" strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fill: "#8892A0", fontSize: 11 }} minTickGap={40} />
                    <YAxis tick={{ fill: "#8892A0", fontSize: 11 }} tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`} />
                    <Tooltip contentStyle={S.tooltip} formatter={(v: number) => fmtPct(v)} labelStyle={{ color: "#8892A0" }} />
                    <ReferenceLine y={0} stroke="#2A3340" />
                    <Area type="monotone" dataKey="drawdown" stroke="#F2545B" fill="#F2545B" fillOpacity={0.18} strokeWidth={1.5} />
                  </AreaChart>
                </ResponsiveContainer>
              </Panel>

              <div style={S.twoCol}>
                <Panel title="Allocation">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                        {pieData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} stroke="#0B0F14" strokeWidth={2} />)}
                      </Pie>
                      <Tooltip contentStyle={S.tooltip} formatter={(v: number) => `${v}%`} />
                      <Legend wrapperStyle={{ fontSize: 12, color: "#8892A0" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </Panel>

                <Panel title="Correlation matrix">
                  <div style={{ overflowX: "auto" }}>
                    <table style={S.table}>
                      <thead>
                        <tr>
                          <th style={S.thCorner}></th>
                          {result.symbols.map((s) => <th key={s} style={S.th}>{s}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {result.symbols.map((s1, i) => (
                          <tr key={s1}>
                            <th style={S.th}>{s1}</th>
                            {result.symbols.map((s2, j) => {
                              const v = result.corr[i][j];
                              const intensity = Math.abs(v);
                              const bg = v >= 0
                                ? `rgba(255,176,32,${0.08 + intensity * 0.45})`
                                : `rgba(242,84,91,${0.08 + intensity * 0.45})`;
                              return <td key={s2} style={{ ...S.corrCell, background: bg }}>{v.toFixed(2)}</td>;
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              </div>

              <Panel title="Holdings breakdown">
                <div style={{ overflowX: "auto" }}>
                  <table style={S.table}>
                    <thead>
                      <tr>
                        <th style={S.thLeft}>Symbol</th>
                        <th style={S.th}>Weight</th>
                        <th style={S.th}>Total return</th>
                        <th style={S.th}>CAGR</th>
                        <th style={S.th}>Ann. vol</th>
                        <th style={S.th}>Sharpe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.assetStats.map((a) => (
                        <tr key={a.symbol}>
                          <td style={S.tdLeft}><b>{a.symbol}</b></td>
                          <td style={S.td}>{(a.weight * 100).toFixed(1)}%</td>
                          <td style={{ ...S.td, color: a.totalReturn >= 0 ? "#5FBF6F" : "#F2545B" }}>
                            {a.totalReturn >= 0 ? <ArrowUpRight size={12} style={S.inlineIcon} /> : <ArrowDownRight size={12} style={S.inlineIcon} />}
                            {fmtPct(a.totalReturn)}
                          </td>
                          <td style={S.td}>{fmtPct(a.cagr)}</td>
                          <td style={S.td}>{fmtPct(a.vol)}</td>
                          <td style={S.td}>{fmtNum(a.sharpe)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

// ---------- subcomponents ----------
interface MetricProps {
  label: string;
  value: string;
  positive?: boolean;
  neutral?: boolean;
}
function Metric({ label, value, positive, neutral }: MetricProps) {
  const color = neutral ? "#E7E5E0" : positive ? "#5FBF6F" : "#F2545B";
  return (
    <div style={S.metricCard}>
      <div style={S.metricLabel}>{label}</div>
      <div style={{ ...S.metricValue, color }}>{value}</div>
    </div>
  );
}
interface PanelProps {
  title: string;
  children: React.ReactNode;
}
function Panel({ title, children }: PanelProps) {
  return (
    <div style={S.panel}>
      <div style={S.panelTitle}>{title}</div>
      {children}
    </div>
  );
}

// ---------- styles ----------
const S: Record<string, CSSProperties> = {
  app: { background: "#0B0F14", minHeight: "100vh", color: "#E7E5E0", fontFamily: "'Inter', sans-serif", fontSize: 14 },
  tickerStrip: { display: "flex", alignItems: "center", gap: 10, background: "#0F141B", borderBottom: "1px solid #232B36", padding: "8px 16px", overflow: "hidden", whiteSpace: "nowrap" },
  tickerScroll: { display: "flex", gap: 24, overflow: "hidden" },
  tickerItem: { display: "flex", gap: 6, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, flexShrink: 0 },
  body: { display: "flex", alignItems: "flex-start" },
  sidebar: { width: 320, flexShrink: 0, padding: "24px 20px", borderRight: "1px solid #232B36", position: "sticky", top: 0 },
  h1: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 26, fontWeight: 700, lineHeight: 1.1, margin: "0 0 8px" },
  subtitle: { color: "#8892A0", fontSize: 12.5, lineHeight: 1.5, margin: "0 0 20px" },
  section: { marginBottom: 20 },
  sectionLabel: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#FFB020", marginBottom: 10 },
  holdingRow: { display: "flex", alignItems: "center", gap: 6, marginBottom: 6, padding: "4px 4px", borderRadius: 6 },
  symbolInput: { flex: 1, background: "#131820", border: "1px solid #232B36", borderRadius: 6, color: "#E7E5E0", padding: "7px 8px", fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, width: 0 },
  weightInput: { width: 56, background: "#131820", border: "1px solid #232B36", borderRadius: 6, color: "#E7E5E0", padding: "7px 6px", fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, textAlign: "right" },
  pctSign: { color: "#8892A0", fontSize: 12, width: 10 },
  iconBtn: { background: "transparent", border: "none", color: "#8892A0", cursor: "pointer", padding: 4, display: "flex" },
  rowActions: { display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" },
  ghostBtn: { display: "flex", alignItems: "center", gap: 5, background: "transparent", border: "1px solid #2A3340", color: "#C4CBD4", borderRadius: 6, padding: "6px 10px", fontSize: 12, cursor: "pointer" },
  weightSumLine: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, marginTop: 10 },
  fieldLabel: { display: "block", fontSize: 11.5, color: "#8892A0", marginTop: 10, marginBottom: 4 },
  fullInput: { width: "100%", background: "#131820", border: "1px solid #232B36", borderRadius: 6, color: "#E7E5E0", padding: "8px 9px", fontFamily: "'IBM Plex Mono', monospace", fontSize: 13 },
  checkboxLabel: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#8892A0", marginTop: 14, cursor: "pointer" },
  runBtn: { width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "#FFB020", color: "#0B0F14", border: "none", borderRadius: 7, padding: "12px 0", fontWeight: 600, fontSize: 14, cursor: "pointer", marginTop: 6 },
  errorBox: { display: "flex", alignItems: "center", gap: 6, color: "#F2545B", fontSize: 12.5, marginTop: 10 },
  main: { flex: 1, padding: "24px 28px", minWidth: 0 },
  emptyState: { textAlign: "center", color: "#8892A0", padding: "100px 40px", maxWidth: 460, margin: "0 auto" },
  emptyGlyph: { fontSize: 28, color: "#FFB020", marginBottom: 14 },
  banner: { display: "flex", alignItems: "center", gap: 8, background: "#1A1607", border: "1px solid #4A3A10", color: "#E7C77A", borderRadius: 8, padding: "10px 14px", fontSize: 12.5, marginBottom: 18, lineHeight: 1.5 },
  metricGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 22 },
  metricCard: { background: "#131820", border: "1px solid #232B36", borderRadius: 8, padding: "12px 14px" },
  metricLabel: { fontSize: 11, color: "#8892A0", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.03em" },
  metricValue: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 19, fontWeight: 600 },
  panel: { background: "#101520", border: "1px solid #232B36", borderRadius: 10, padding: "16px 18px", marginBottom: 18 },
  panelTitle: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 14.5, fontWeight: 600, marginBottom: 12, color: "#E7E5E0" },
  twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 },
  tooltip: { background: "#131820", border: "1px solid #2A3340", borderRadius: 6, fontSize: 12 },
  table: { width: "100%", borderCollapse: "collapse", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5 },
  th: { textAlign: "center", color: "#8892A0", fontWeight: 500, padding: "6px 8px", borderBottom: "1px solid #232B36" },
  thLeft: { textAlign: "left", color: "#8892A0", fontWeight: 500, padding: "6px 8px", borderBottom: "1px solid #232B36" },
  thCorner: { padding: "6px 8px", borderBottom: "1px solid #232B36" },
  td: { textAlign: "center", padding: "7px 8px", borderBottom: "1px solid #1A2029" },
  tdLeft: { textAlign: "left", padding: "7px 8px", borderBottom: "1px solid #1A2029" },
  corrCell: { textAlign: "center", padding: "7px 8px", borderBottom: "1px solid #1A2029", borderRadius: 3 },
  inlineIcon: { verticalAlign: "-1px", marginRight: 2 },
};
