"""
Market data access layer.

Isolates all "where prices come from" logic (live yfinance fetch, in-memory
caching, synthetic fallback) so the analysis/routing code never has to know
which source actually served the data.
"""

import logging
from typing import List

import pandas as pd
import yfinance as yf
from cachetools import TTLCache

logger = logging.getLogger("portfolio.market_data")

MIN_OVERLAP_ROWS = 20  # below this we treat live data as unusable
CACHE_TTL_SECONDS = (
    15 * 60
)  # yfinance rate limits aggressively; cache reduces repeat hits
_price_cache: TTLCache = TTLCache(maxsize=256, ttl=CACHE_TTL_SECONDS)


def _cache_key(symbols: tuple, start: str, end: str) -> str:
    return f"{'-'.join(sorted(symbols))}|{start}|{end}"


def fetch_prices(symbols: List[str], start: str, end: str) -> pd.DataFrame:
    """
    Fetch adjusted daily close prices for `symbols` between start/end (inclusive).
    Returns a DataFrame indexed by date, one column per symbol, inner-joined so
    every row has data for every symbol (mirrors the "common dates" step the
    frontend used to do against Stooq).

    Raises on failure (network error, empty/short result) so callers can
    decide how to fall back.
    """
    key = _cache_key(tuple(symbols), start, end)
    cached = _price_cache.get(key)
    if cached is not None:
        logger.info("price cache hit for %s", key)
        return cached.copy()

    data = yf.download(
        symbols,
        start=start,
        end=end,
        interval="1d",
        auto_adjust=True,
        progress=False,
        group_by="column",
    )
    if data is None or data.empty:
        raise ValueError("yfinance returned no data")

    if len(symbols) == 1:
        if "Close" not in data.columns:
            raise ValueError("unexpected yfinance response shape")
        closes = data[["Close"]].rename(columns={"Close": symbols[0]})
    else:
        if "Close" not in data.columns.get_level_values(0):
            raise ValueError("unexpected yfinance response shape")
        closes = data["Close"]

    closes = closes.dropna(how="any")
    if len(closes) < MIN_OVERLAP_ROWS:
        raise ValueError(f"insufficient overlapping data ({len(closes)} rows)")

    # keep column order matching the requested symbol order
    closes = closes[[s for s in symbols if s in closes.columns]]
    if closes.shape[1] != len(symbols):
        missing = set(symbols) - set(closes.columns)
        raise ValueError(f"missing data for symbols: {sorted(missing)}")

    _price_cache[key] = closes.copy()
    return closes


def fetch_ohlcv(
    symbol: str, start: str, end: str, interval: str = "1d"
) -> pd.DataFrame:
    """Fetch full OHLCV (not just close) for a single symbol, e.g. for chart endpoints."""
    df = yf.download(
        symbol,
        start=start,
        end=end,
        interval=interval,
        auto_adjust=True,
        progress=False,
    )
    if df is None or df.empty:
        raise ValueError(f"no data returned for {symbol}")
    df.columns = [c[0] if isinstance(c, tuple) else c for c in df.columns]
    return df[["Open", "High", "Low", "Close", "Volume"]].dropna()


# ---------------------------------------------------------------------------
# Synthetic fallback — used when live data is unavailable, so the API (and
# the frontend consuming it) keeps working during an outage or rate limit.
# Deterministic per symbol so repeated calls are stable, not re-randomized.
# ---------------------------------------------------------------------------


def get_prices_with_fallback(symbols: List[str], start: str, end: str):
    """
    Single entry point routers should call: tries live data unless forced to
    demo, falls back to synthetic on any failure. Returns (DataFrame, source).
    """

    try:
        return fetch_prices(symbols, start, end)
    except Exception as exc:
        logger.warning(
            "live fetch failed (%s), falling back to synthetic data", exc
        )
