"""
Pure portfolio analysis math. No I/O, no framework code — takes prices in,
returns a plain dict out. This mirrors the calculations that used to live
inline inside the frontend's runAnalysis function.
"""

from typing import Any, Dict, List

import numpy as np
import pandas as pd

TRADING_DAYS_PER_YEAR = 252


def daily_returns(closes: np.ndarray) -> np.ndarray:
    return closes[1:] / closes[:-1] - 1


def compute_analysis(
    price_df: pd.DataFrame,
    symbols: List[str],
    weights: List[float],
    benchmark: str,
    risk_free_rate_pct: float,
) -> Dict[str, Any]:
    """
    price_df: DataFrame indexed by date, containing at least columns for
              every symbol in `symbols` plus `benchmark`.
    weights:  same order/length as `symbols`, should already sum to 1.0.
    """
    dates = [d.strftime("%Y-%m-%d") for d in price_df.index]

    asset_closes = [price_df[s].to_numpy(dtype=float) for s in symbols]
    bench_closes = price_df[benchmark].to_numpy(dtype=float)

    asset_returns = [daily_returns(c) for c in asset_closes]
    bench_returns = daily_returns(bench_closes)
    n = len(bench_returns)

    weights_arr = np.array(weights, dtype=float)
    portfolio_returns = np.zeros(n)
    for j, r in enumerate(asset_returns):
        portfolio_returns += weights_arr[j] * r

    growth = np.empty(n + 1)
    growth[0] = 100.0
    for i in range(n):
        growth[i + 1] = growth[i] * (1 + portfolio_returns[i])

    bench_growth = np.empty(n + 1)
    bench_growth[0] = 100.0
    for i in range(n):
        bench_growth[i + 1] = bench_growth[i] * (1 + bench_returns[i])

    chart_dates = dates[1:]
    growth_series = [
        {
            "date": d,
            "portfolio": float(growth[i + 1]),
            "benchmark": float(bench_growth[i + 1]),
        }
        for i, d in enumerate(chart_dates)
    ]

    peak = growth[0]
    drawdown_series = []
    for i, d in enumerate(chart_dates):
        peak = max(peak, growth[i + 1])
        drawdown_series.append(
            {"date": d, "drawdown": float((growth[i + 1] - peak) / peak)}
        )
    max_drawdown = min(p["drawdown"] for p in drawdown_series)

    total_return = float(growth[-1] / 100 - 1)
    years = n / TRADING_DAYS_PER_YEAR
    cagr = float((1 + total_return) ** (1 / years) - 1)
    annual_vol = float(np.std(portfolio_returns) * np.sqrt(TRADING_DAYS_PER_YEAR))
    rf = risk_free_rate_pct / 100
    sharpe = float((cagr - rf) / annual_vol) if annual_vol > 0 else 0.0

    bench_var = float(np.var(bench_returns))
    cov_pb = float(np.cov(portfolio_returns, bench_returns, bias=True)[0, 1])
    beta = cov_pb / bench_var if bench_var > 0 else 0.0

    bench_total_return = float(bench_growth[-1] / 100 - 1)
    bench_cagr = float((1 + bench_total_return) ** (1 / years) - 1)
    alpha = float(cagr - (rf + beta * (bench_cagr - rf)))

    asset_stats = []
    for j, s in enumerate(symbols):
        c = asset_closes[j]
        tot = float(c[-1] / c[0] - 1)
        cg = float((1 + tot) ** (1 / years) - 1)
        vol = float(np.std(asset_returns[j]) * np.sqrt(TRADING_DAYS_PER_YEAR))
        asset_stats.append(
            {
                "symbol": s,
                "weight": float(weights_arr[j]),
                "totalReturn": tot,
                "cagr": cg,
                "vol": vol,
                "sharpe": float((cg - rf) / vol) if vol > 0 else 0.0,
            }
        )

    corr = [
        [
            float(np.corrcoef(asset_returns[i], asset_returns[j])[0, 1])
            for j in range(len(symbols))
        ]
        for i in range(len(symbols))
    ]

    return {
        "growthSeries": growth_series,
        "drawdownSeries": drawdown_series,
        "maxDrawdown": float(max_drawdown),
        "totalReturn": total_return,
        "cagr": cagr,
        "annualVol": annual_vol,
        "sharpe": sharpe,
        "beta": float(beta),
        "alpha": alpha,
        "benchCagr": bench_cagr,
        "assetStats": asset_stats,
        "corr": corr,
        "symbols": symbols,
        "weights": [float(w) for w in weights_arr],
        "nObs": n,
        "benchmark": benchmark,
    }
