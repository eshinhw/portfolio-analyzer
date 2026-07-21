from fastapi import FastAPI
from services.yahoo import get_stock_price

app = FastAPI()


@app.get("/api/stocks/{symbol}")
def stock_price(symbol: str):
    return get_stock_price(symbol.upper())
