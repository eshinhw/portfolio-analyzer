import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import portfolio

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Portfolio Analyzer API", version="1.0.0")

# Vite's default dev server ports — add your deployed frontend origin too
# once this goes anywhere beyond localhost.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://portfolio-analyzer.up.railway.app",  # Your Railway frontend
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(portfolio.router)


@app.get("/health")
def health():
    return {"status": "ok"}
