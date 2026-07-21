import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import PortfolioAnalyzer from "./PortfolioAnalyzer.tsx";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* <PortfolioAnalyzer /> */}
    <App />
  </StrictMode>,
);
