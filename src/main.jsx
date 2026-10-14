import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

// Light mode unless the person picked dark (or "match my device") from their menu.
try { document.documentElement.dataset.theme = localStorage.getItem("pf-theme") || "light"; }
catch { document.documentElement.dataset.theme = "light"; }

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
