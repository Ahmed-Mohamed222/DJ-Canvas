import React from "react";
import { createRoot } from "react-dom/client";
import "../src/styles.css";
import { Mixer } from "../src/Mixer";

const root = document.getElementById("root")!;
createRoot(root).render(
  <React.StrictMode>
    <Mixer />
  </React.StrictMode>,
);
