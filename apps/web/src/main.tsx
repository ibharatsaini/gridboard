import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/components/app";
import { Providers } from "@/components/providers";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element in index.html");

createRoot(root).render(
  <StrictMode>
    <Providers>
      <App />
    </Providers>
  </StrictMode>,
);
