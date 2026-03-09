import { Palette } from "./types";

export const PALETTES: Record<string, Palette> = {
  "github-light": {
    empty: "#ebedf0",
    border: "#1b1f230a",
    ball: "#e34a33",
    paddle: "#5b21b6",
    hit: "#ffffff",
    levels: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"],
  },
  "github-dark": {
    empty: "#161b22",
    border: "#1b1f230a",
    ball: "#ff6b6b",
    paddle: "#a78bfa",
    hit: "#ffffff",
    levels: ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"],
  },
};
