import { createApp } from "vue";
import { createPinia } from "pinia";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Chart as ChartJS } from "chart.js";
import App from "./components/App.vue";
import "./style.css";
import "./legacy.css";
import "tippy.js/dist/tippy.css";

createApp(App).use(createPinia()).mount("#app");

// disable the right click menu
document.addEventListener("contextmenu", (e) => e.preventDefault());

// The default window (1600 × 950, tauri.conf.json) does not fit a smaller screen: fill it.
if (window.screen.availWidth < 1600 || window.screen.availHeight < 950) {
  void getCurrentWindow().maximize();
}

// Charts (Equity and Turn / River reports) on the dark Graphite background.
ChartJS.defaults.color = "#9a9aa3";
ChartJS.defaults.borderColor = "#323238";
