from typing import List

from pydantic import BaseModel, Field
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Base model that (de)serializes using camelCase keys, matching the
    TS interfaces already defined in the frontend (AnalysisResult, etc.),
    while still accepting snake_case internally in Python."""

    model_config = {
        "alias_generator": to_camel,
        "populate_by_name": True,
    }


class Holding(CamelModel):
    symbol: str
    weight: float


class AnalysisRequest(CamelModel):
    holdings: List[Holding]
    start_date: str  # "YYYY-MM-DD"
    end_date: str
    benchmark: str = "SPY"
    risk_free_rate: float = 4.0  # annual, percent


class GrowthPoint(CamelModel):
    date: str
    portfolio: float
    benchmark: float


class DrawdownPoint(CamelModel):
    date: str
    drawdown: float


class AssetStat(CamelModel):
    symbol: str
    weight: float
    total_return: float
    cagr: float
    vol: float
    sharpe: float


class AnalysisResponse(CamelModel):
    growth_series: List[GrowthPoint]
    drawdown_series: List[DrawdownPoint]
    max_drawdown: float
    total_return: float
    cagr: float
    annual_vol: float
    sharpe: float
    beta: float
    alpha: float
    bench_cagr: float
    asset_stats: List[AssetStat]
    corr: List[List[float]]
    symbols: List[str]
    weights: List[float]
    n_obs: int
    benchmark: str


class PriceBar(CamelModel):
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: float


class PricesResponse(CamelModel):
    symbol: str
    bars: List[PriceBar]


class SymbolValidationRequest(CamelModel):
    symbols: List[str]


class SymbolValidationResult(CamelModel):
    symbol: str
    valid: bool


class SymbolValidationResponse(CamelModel):
    results: List[SymbolValidationResult]
