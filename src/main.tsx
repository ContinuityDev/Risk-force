import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { cappedDevicePixelRatio } from "./util/devicePixelRatio";
import "./styles/theme.css";
import "./styles/app.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element #root not found");
}

// Cap backing-store density for any canvas / hi-DPI work on mid-range phones.
document.documentElement.style.setProperty(
  "--rf-dpr",
  String(cappedDevicePixelRatio()),
);

registerSW({ immediate: true });

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
