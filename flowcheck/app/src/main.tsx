import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { createUsgsClient } from "./usgs/client";
import "./styles.css";

const usgs = createUsgsClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App usgs={usgs} />
  </StrictMode>,
);
