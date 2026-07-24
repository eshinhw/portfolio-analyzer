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

## Tech Stack

- **Frontend**: React, TypeScript
- **Backend**: FastAPI, yfinance
- **Deployment**: Docker, Railway
