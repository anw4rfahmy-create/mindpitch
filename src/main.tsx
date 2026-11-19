import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./fonts";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Service worker: aplikasi bisa dipasang dan berjalan offline
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
