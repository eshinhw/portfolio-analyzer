export interface Asset {
  id: number;
  symbol: string;
  weight: number | string;
}

export interface AssetStat {
  symbol: string;
  weight: number;
  totalReturn: number;
  cagr: number;
  vol: number;
  sharpe: number;
}
export interface AnalysisResult {
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
export type Status = "idle" | "loading" | "error" | "done";
export type DataSource = "live" | "demo" | null;

export interface HoldingInput {
  symbol: string;
  weight: number;
}

export interface AnalysisRequestBody {
  holdings: HoldingInput[];
  startDate: string; // "YYYY-MM-DD"
  endDate: string;
  benchmark: string;
  riskFreeRate: number; // annual, percent (e.g. 4.0 for 4%)
}

export interface GrowthPoint {
  date: string;
  portfolio: number;
  benchmark: number;
}
export interface DrawdownPoint {
  date: string;
  drawdown: number;
}
export interface AnalysisResult {
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

export interface PieDataPoint {
  name: string;
  value: number;
}
