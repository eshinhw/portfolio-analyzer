// Frontend API client for the Portfolio Quant backend.
// Drop this in your Vite project, e.g. src/api/portfolioApi.ts
//
// This replaces the old client-side fetchLiveSeries/generateSyntheticSeries
// logic (marketData.ts) — the browser no longer talks to Stooq directly;
// it talks to your FastAPI backend, which talks to yfinance.

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
import { type AnalysisRequestBody, type AnalysisResult } from "../src/types/type";

export class PortfolioApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "PortfolioApiError";
    this.status = status;
  }
}

export async function analyzePortfolio(body: AnalysisRequestBody): Promise<AnalysisResult> {
  const res = await fetch(`${API_BASE}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const errBody = await res.json();
      detail = errBody.detail ?? detail;
    } catch {
      /* response wasn't JSON, keep statusText */
    }
    throw new PortfolioApiError(detail, res.status);
  }

  return res.json();
}

export interface PriceBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
export interface PricesResult {
  symbol: string;
  bars: PriceBar[];
}

export async function getPrices(
  symbol: string,
  start: string,
  end: string,
  interval: "1d" | "1wk" | "1mo" = "1d",
): Promise<PricesResult> {
  const params = new URLSearchParams({ symbol, start, end, interval });
  const res = await fetch(`${API_BASE}/api/prices?${params.toString()}`);

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const errBody = await res.json();
      detail = errBody.detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new PortfolioApiError(detail, res.status);
  }

  return res.json();
}
