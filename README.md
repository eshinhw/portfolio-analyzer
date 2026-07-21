# Portfolio Analyzer

Quantitative Analysis on Stocks &amp; ETF Portfolios

## Frontend (React)

...

## Backend API (FastAPI + yfinance)

Backend pipeline that fetches historical stock data via `yfinance` and runs
the same portfolio performance/risk analysis your React app previously did
in the browser — server-side now, so it's not subject to browser CORS and
you get real live data reliably.

### Structure

```
backend/
  app/
    main.py              FastAPI app, CORS config
    models.py             Pydantic request/response models (camelCase JSON)
    market_data.py        yfinance fetch + in-memory cache + synthetic fallback
    analysis.py            Pure math: returns, CAGR, vol, Sharpe, beta, alpha,
                            drawdown, correlation matrix (no I/O, unit-testable)
    routers/
      portfolio.py         /api/analyze and /api/prices endpoints
  requirements.txt
  frontend_client/
    portfolioApi.ts        Drop-in TS client for your Vite app
```

### Run it

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
