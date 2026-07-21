import yfinance as yf


def get_stock_price(symbol: str):
    ticker = yf.Ticker(symbol)

    data = ticker.history(period="1d")

    latest = data.iloc[-1]

    return {"symbol": symbol, "price": float(latest["Close"])}
