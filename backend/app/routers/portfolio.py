from fastapi import APIRouter, HTTPException, Query

from ..compute import compute_analysis
from ..market_data import fetch_ohlcv, get_prices_with_fallback
from ..models import (
    AnalysisRequest,
    AnalysisResponse,
    PriceBar,
    PricesResponse,
)

router = APIRouter(prefix="/api", tags=["portfolio"])


@router.post("/analyze", response_model=AnalysisResponse)
def analyze_portfolio(req: AnalysisRequest) -> AnalysisResponse:
    """
    Fetch historical prices for the requested holdings + benchmark and run
    the full performance/risk analysis server-side.

    NOTE: this is a synchronous `def`, not `async def`, intentionally —
    yfinance does blocking network I/O, and FastAPI runs sync path
    operations in a worker thread pool automatically. Making this
    `async def` while calling a blocking library would stall the event
    loop for every other request.
    """
    positive = [h for h in req.holdings if h.weight > 0]
    if not positive:
        raise HTTPException(
            400, "Add at least one holding with a positive weight."
        )
    if req.start_date >= req.end_date:
        raise HTTPException(400, "Start date must be before end date.")

    weight_sum = sum(h.weight for h in positive)
    symbols = [h.symbol.strip().upper() for h in positive]
    weights = [h.weight / weight_sum for h in positive]
    benchmark = req.benchmark.strip().upper()

    # de-duplicate while preserving order (benchmark may equal a holding)
    all_symbols = list(dict.fromkeys(symbols + [benchmark]))

    try:
        price_df = get_prices_with_fallback(
            all_symbols,
            req.start_date,
            req.end_date,
        )
    except Exception as exc:
        raise HTTPException(
            502, f"Could not obtain price data: {exc}"
        ) from exc

    result = compute_analysis(
        price_df, symbols, weights, benchmark, req.risk_free_rate
    )
    return result


@router.get("/prices", response_model=PricesResponse)
def get_prices(
    symbol: str = Query(..., min_length=1),
    start: str = Query(..., description="YYYY-MM-DD"),
    end: str = Query(..., description="YYYY-MM-DD"),
    interval: str = Query("1d", pattern="^(1d|1wk|1mo)$"),
) -> PricesResponse:
    """Raw OHLCV for a single symbol — useful for chart/screener features
    (e.g. the weekly consolidation detector) beyond just portfolio analysis."""
    symbol = symbol.strip().upper()
    try:
        df = fetch_ohlcv(symbol, start, end, interval=interval)
        source = "live"
    except Exception as exc:
        raise HTTPException(
            502, f"Could not fetch prices for {symbol}: {exc}"
        ) from exc

    bars = [
        PriceBar(
            date=idx.strftime("%Y-%m-%d"),
            open=float(row["Open"]),
            high=float(row["High"]),
            low=float(row["Low"]),
            close=float(row["Close"]),
            volume=float(row["Volume"]),
        )
        for idx, row in df.iterrows()
    ]
    return PricesResponse(symbol=symbol, bars=bars, data_source=source)
