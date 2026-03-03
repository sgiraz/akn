import * as core from "@actions/core";
import * as fs from "fs";
import * as path from "path";
import { fetchContributions } from "./contributions";
import { simulateArkanoid } from "./simulation";
import { renderSvg } from "./svg-renderer";
import { PALETTES } from "./palettes";
import { OutputSpec } from "./types";

function parseOutputSpecs(raw: string): OutputSpec[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [filePath, query] = line.split("?");
      let palette = "github-light";
      if (query) {
        const params = new URLSearchParams(query);
        palette = params.get("palette") || "github-light";
      }
      return { path: filePath, palette };
    });
}

async function run() {
  try {
    const username = core.getInput("github_user_name", { required: true });
    const outputsRaw = core.getInput("outputs", { required: true });

    const specs = parseOutputSpecs(outputsRaw);
    core.info(`Generating Arkanoid animation for user: ${username}`);
    core.info(`Output files: ${specs.map((s) => s.path).join(", ")}`);

    const token = process.env.GITHUB_TOKEN;
    const grid = await fetchContributions(username, token);

    // Count bricks
    let brickCount = 0;
    for (const col of grid) {
      for (const cell of col) {
        if (cell.level > 0) brickCount++;
      }
    }
    core.info(`Found ${brickCount} contribution cells (bricks)`);

    const sim = simulateArkanoid(grid);
    core.info(`Simulation complete: ${sim.frames.length} frames, ${sim.duration}ms duration`);

    for (const spec of specs) {
      const palette = PALETTES[spec.palette] || PALETTES["github-light"];
      const svg = renderSvg(grid, sim, palette);

      fs.mkdirSync(path.dirname(path.resolve(spec.path)), { recursive: true });
      fs.writeFileSync(spec.path, svg, "utf-8");
      core.info(`Wrote ${spec.path} (${(svg.length / 1024).toFixed(1)} KB)`);
    }
  } catch (err: any) {
    core.setFailed(err.message || String(err));
  }
}

run();
