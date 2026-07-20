import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// import App from "./App.tsx";
import PortfolioAnalyzer from "./PortfolioAnalyzer.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PortfolioAnalyzer />
  </StrictMode>,
);
