# Portfolio Analyzer

<div align="center">

  ![GitHub code size in bytes](https://img.shields.io/github/languages/code-size/eshinhw/portfolio-analyzer)
  ![GitHub issues](https://img.shields.io/github/issues/eshinhw/portfolio-analyzer)
  ![GitHub pull requests](https://img.shields.io/github/issues-pr/eshinhw/portfolio-analyzer)
  
</div>

Quantitative Risk and Return Analysis for Stock & ETF Portfolios

<img width="1426" alt="Portfolio Analyzer Demo Page" src="https://github.com/user-attachments/assets/57dfa0d7-d12f-4695-b4c5-3d64200ddbbf">

## Return & Risk Measures

### Total Return

The overall % gain/loss from start to end date. Simple and intuitive, but tells you nothing about the path taken to get there — two portfolios can have identical total returns while one endured a 40% drawdown and the other barely dipped.

### CAGR (Compound Annual Growth Rate)

Total return annualized, i.e. "what constant yearly rate would get you the same result." Important because it makes returns comparable across different time periods — a 3-year backtest and a 7-year backtest can't be compared on total return alone, but their CAGRs can.

### Annualized Volatility

The standard deviation of returns, scaled to a yearly figure. This is the standard proxy for risk/uncertainty: how much the portfolio's value swings around its average path. Two portfolios with the same CAGR but very different volatility are not equally desirable — lower volatility for the same return is strictly better from a risk-adjusted standpoint.

### Sharpe Ratio

Return earned per unit of risk taken - (CAGR − risk-free rate) ÷ volatility. This is the metric that actually lets you compare "was this return worth the ride" — a portfolio returning 15% with wild swings can have a worse Sharpe than one returning 9% smoothly. It's the closest thing to a single-number risk-adjusted performance score.

### Max Drawdown

The largest peak-to-trough decline the portfolio experienced. This matters because volatility (an average measure) can hide the worst single episode — max drawdown answers "what's the deepest hole this portfolio dug itself into," which is often what actually determines whether a real investor panic-sells. It's a tail-risk measure, not a central-tendency one.

### Beta (vs. benchmark)

How much the portfolio moves for each 1% move in the benchmark. Beta > 1 means amplified market moves (more aggressive/leveraged-feeling); beta < 1 means dampened moves (more defensive). This tells you how much of your portfolio's risk is just "the market," versus something else.

### Alpha (annualized)

Return earned above what beta and the risk-free rate alone would predict (Jensen's alpha). This is the metric that answers "did the specific stock-picking/weighting actually add value, or did this portfolio just ride the market at some leverage level." **Alpha near zero means you got exactly what your market exposure implied — no more, no less.**

### Correlation Matrix

Pairwise co-movement between holdings' daily returns. Critical for diversification: a portfolio can look diversified by name (different sectors, different companies) while still being highly correlated in behavior (e.g., two high-beta tech names that both crash together). Low/negative correlations are what actually reduce portfolio-level volatility below the average of the individual holdings' volatilities — that's the entire mathematical basis for diversification.

## Frontend (React)

...

## Backend API (FastAPI + yfinance)

Backend pipeline that fetches historical stock data via `yfinance` and runs
the same portfolio performance/risk analysis your React app previously did
in the browser — server-side now, so it's not subject to browser CORS and
you get real live data reliably.

### Run it (local dev)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Visit `http://localhost:8000/docs` for interactive Swagger docs (FastAPI
generates this automatically from the Pydantic models).

### Endpoints

#### `POST /api/analyze`

Request body:

```json
{
  "holdings": [
    { "symbol": "AAPL", "weight": 30 },
    { "symbol": "MSFT", "weight": 30 },
    { "symbol": "SPY", "weight": 40 }
  ],
  "startDate": "2022-01-01",
  "endDate": "2024-01-01",
  "benchmark": "SPY",
  "riskFreeRate": 4.0,
  "forceDemo": false
}
```

Returns the full `AnalysisResult` shape your frontend already has types for
(growth series, drawdown series, CAGR, Sharpe, beta, alpha, correlation
matrix, per-asset stats) — see `frontend_client/portfolioApi.ts` for the
exact TS interface.

Weights don't need to already sum to 100 — the backend normalizes them.

#### `GET /api/prices?symbol=AAPL&start=2022-01-01&end=2024-01-01&interval=1d`

Raw OHLCV for one symbol. Useful for other features beyond the portfolio
view — e.g. the weekly consolidation screener, which needs full OHLC, not
just closes.

#### `GET /health`

Basic liveness check.

### How live-data failures are handled

`yfinance` is an unofficial wrapper around Yahoo's internal endpoints — it
can rate-limit or throw transient errors. `market_data.get_prices_with_fallback`
tries a live fetch first, and on **any** failure (network error, rate limit,
insufficient overlapping trading days) falls back to a deterministic
synthetic price series per symbol, and the response's `dataSource` field
tells the frontend which one it got (`"live"` or `"demo"`) so you can show
the same "simulated data" banner your UI already has.

There's also a 15-minute in-memory cache (`cachetools.TTLCache`) on live
price fetches, keyed by the exact symbol set + date range, to cut down on
repeat calls hitting yfinance's rate limits during development.

### Wiring up the frontend

1. Copy `frontend_client/portfolioApi.ts` into your Vite project, e.g. `src/api/portfolioApi.ts`.
2. Add an env var so the API base URL isn't hardcoded:
   ```
   # .env.local
   VITE_API_BASE_URL=http://localhost:8000
   ```
3. Replace the body of your `runAnalysis` (or the `usePortfolioAnalysis` hook,
   if you did that refactor) with a call to `analyzePortfolio(...)` instead
   of the old client-side `fetchLiveSeries`/`generateSyntheticSeries` logic:

   ```ts
   import { analyzePortfolio, PortfolioApiError } from "../api/portfolioApi";

   const result = await analyzePortfolio({
     holdings: cleanRows.map((r) => ({ symbol: r.symbol, weight: r.weight })),
     startDate,
     endDate,
     benchmark,
     riskFreeRate: Number(riskFree),
     forceDemo,
   });
   setResult(result);
   setDataSource(result.dataSource);
   ```

   Since the response field names already match your `AnalysisResult` TS
   interface (camelCase, same field names), you can delete the client-side
   `computePortfolioAnalysis`/`marketData.ts` logic entirely — the backend
   now owns that.

### CORS

`main.py` currently allows `http://localhost:5173` (Vite's default dev
port). Add your deployed frontend's origin to `allow_origins` in
`app/main.py` once you deploy this anywhere beyond localhost.

### Notes on scaling this later

- The analyze route is a plain `def`, not `async def`, on purpose — yfinance
  does blocking network calls, and FastAPI runs sync path operations in a
  thread pool automatically, so this avoids stalling the event loop.
- If you start hitting yfinance rate limits in practice, the cache TTL in
  `market_data.py` is the first knob to turn, followed by switching to a
  proper paid data provider (Alpha Vantage, Twelve Data, Polygon) behind
  the same `get_prices_with_fallback` function signature — that's the one
  seam designed to be swapped out without touching `analysis.py` or the
  router at all.
