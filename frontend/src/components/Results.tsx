import { S } from "../styles/portfolioAnalyzerStyles";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Pie,
  Cell,
  PieChart,
} from "recharts";
import { ArrowUpRight, ArrowDownRight, Loader2, AlertTriangle } from "lucide-react";
import Metric from "./subcomponents/Metric";
import Panel from "./subcomponents/Panel";
import { type Status, type AnalysisResult, type PieDataPoint } from "../types/type";
import { useMemo } from "react";

type Props = {
  result: AnalysisResult | null;
  status: Status;
  errorMsg: string;
};

export default function Results({ result, status, errorMsg }: Props) {
  const fmtPct = (x: number, d = 2): string => `${(x * 100).toFixed(d)}%`;
  const fmtNum = (x: number, d = 2): string => x.toFixed(d);

  const PALETTE = ["#FFB020", "#4FD1C5", "#F2545B", "#8B7EF2", "#5FBF6F", "#E8963B", "#6EC6E8", "#D986C0"];
  const pieData: PieDataPoint[] = useMemo(() => {
    if (!result) return [{ name: "", value: 0 }];
    return result.assetStats.map((a) => ({
      name: a.symbol,
      value: +(a.weight * 100).toFixed(2), // weights come back as 0-1 fractions
    }));
  }, [result]);
  return (
    <main style={S.main}>
      {status === "idle" && (
        <div style={S.emptyState}>
          <div style={S.emptyGlyph}>◆</div>
          <p>
            Set up your assets on the left, then run the analysis to see historical returns, risk metrics, drawdown, and
            correlations.
          </p>
        </div>
      )}
      {status === "loading" && !result && (
        <div style={S.loadingState}>
          <Loader2 size={15} style={{ color: "#FFB020", animation: "spin 1s linear infinite" }} />
          <p>Running the analysis...Please hold on.</p>
        </div>
      )}
      {status === "error" && (
        <div style={S.loadingState}>
          <AlertTriangle size={15} style={{ color: "#FFB020" }} /> <p>{errorMsg}</p>
        </div>
      )}

      {status === "done" && result && (
        <>
          {/* metric strip */}
          <div style={S.metricGrid}>
            <Metric label="Total Return" value={fmtPct(result.totalReturn)} positive={result.totalReturn >= 0} />
            <Metric label="CAGR" value={fmtPct(result.cagr)} positive={result.cagr >= 0} />
            <Metric label="Sharpe" value={fmtNum(result.sharpe)} positive={result.sharpe >= 0} />
            <Metric label="Annualized Alpha" value={fmtPct(result.alpha)} positive={result.alpha >= 0} />
            <Metric label="Max Drawdown" value={fmtPct(result.maxDrawdown)} positive={false} />
            <Metric label="Annualized Vol" value={fmtPct(result.annualVol)} neutral />

            <Metric label={`Beta vs ${result.benchmark}`} value={fmtNum(result.beta)} neutral />
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
                <Line
                  type="monotone"
                  dataKey="portfolio"
                  name="Portfolio"
                  stroke="#FFB020"
                  dot={false}
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="benchmark"
                  name={`Benchmark (${result.benchmark})`}
                  stroke="#4FD1C5"
                  dot={false}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                />
              </LineChart>
            </ResponsiveContainer>
          </Panel>

          {/* drawdown */}
          <Panel title="Portfolio Drawdown">
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={result.drawdownSeries}>
                <CartesianGrid stroke="#232B36" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fill: "#8892A0", fontSize: 11 }} minTickGap={40} />
                <YAxis
                  tick={{ fill: "#8892A0", fontSize: 11 }}
                  tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                />
                <Tooltip contentStyle={S.tooltip} formatter={(v: any) => fmtPct(v)} labelStyle={{ color: "#8892A0" }} />
                <ReferenceLine y={0} stroke="#2A3340" />
                <Area
                  type="monotone"
                  dataKey="drawdown"
                  stroke="#F2545B"
                  fill="#F2545B"
                  fillOpacity={0.18}
                  strokeWidth={1.5}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Panel>

          <div style={S.twoCol} className="qa-twocol">
            <Panel title="Allocation">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PALETTE[i % PALETTE.length]} stroke="#0B0F14" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={S.tooltip} formatter={(v: any) => `${v}%`} />
                  <Legend wrapperStyle={{ fontSize: 12, color: "#8892A0" }} />
                </PieChart>
              </ResponsiveContainer>
            </Panel>

            <Panel title="Correlation Matrix">
              <div style={{ overflowX: "auto" }}>
                <table style={S.table} className="qa-table">
                  <thead>
                    <tr>
                      <th style={S.thCorner}></th>
                      {result.symbols.map((s) => (
                        <th key={s} style={S.th}>
                          {s}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.symbols.map((s1, i) => (
                      <tr key={s1}>
                        <th style={S.th}>{s1}</th>
                        {result.symbols.map((s2, j) => {
                          const v = result.corr[i][j];
                          const intensity = Math.abs(v);
                          const bg =
                            v >= 0
                              ? `rgba(255,176,32,${0.08 + intensity * 0.45})`
                              : `rgba(242,84,91,${0.08 + intensity * 0.45})`;
                          return (
                            <td key={s2} style={{ ...S.corrCell, background: bg }}>
                              {v.toFixed(2)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>

          <Panel title="Assets Breakdown">
            <div style={{ overflowX: "auto" }}>
              <table style={S.table} className="qa-table">
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
                      <td style={S.tdLeft}>
                        <b>{a.symbol}</b>
                      </td>
                      <td style={S.td}>{(a.weight * 100).toFixed(1)}%</td>
                      <td style={{ ...S.td, color: a.totalReturn >= 0 ? "#5FBF6F" : "#F2545B" }}>
                        {a.totalReturn >= 0 ? (
                          <ArrowUpRight size={12} style={S.inlineIcon} />
                        ) : (
                          <ArrowDownRight size={12} style={S.inlineIcon} />
                        )}
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
  );
}
