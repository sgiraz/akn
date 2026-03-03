# akn

[![GitHub release](https://img.shields.io/github/release/sgiraz/akn.svg?style=flat-square)](https://github.com/sgiraz/akn/releases/latest)
![TypeScript](https://img.shields.io/npm/types/typescript?style=flat-square)
[![License: GPL-3.0](https://img.shields.io/badge/license-GPL--3.0-blue?style=flat-square)](./LICENSE)

> Your contributions deserve to be _smashed_, not just watched.

**akn** turns your GitHub contribution graph into a looping **Arkanoid** animation — a bouncing ball, a paddle, and your commits as breakable bricks, rendered entirely as a self-contained SVG with pure CSS animations. No JavaScript. No external dependencies. Just `<svg>`.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/github-contribution-arkanoid-dark.svg" />
    <img src="assets/github-contribution-arkanoid-light.svg" alt="Arkanoid contribution animation" width="880" />
  </picture>
</p>

---

## How it works

1. **Fetch** — Pulls the last 52 weeks of your contribution calendar (via GitHub GraphQL API or HTML scraping).
2. **Simulate** — Runs a full Arkanoid physics simulation: the ball bounces off walls, the paddle tracks the ball, and each contribution cell is a brick. Higher contribution levels = more HP.
3. **Render** — Encodes the entire simulation as CSS `@keyframes` inside a single SVG file. Every brick fade, ball trajectory, and paddle slide is a pure CSS animation — infinitely looping, zero runtime cost.

The result is a lightweight, embeddable SVG that plays everywhere: GitHub READMEs, browsers, even image viewers that support animated SVGs.

## Usage

### GitHub Action

Add this workflow to your profile repository (e.g. `username/username`). It regenerates the animation daily and pushes it to an output branch.

```yaml
name: Generate Arkanoid contribution graph

on:
  schedule:
    - cron: "0 0 * * *" # every day at midnight
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: sgiraz/akn@v1
        with:
          github_user_name: ${{ github.repository_owner }}
          outputs: |
            dist/github-contribution-arkanoid.svg
            dist/github-contribution-arkanoid-dark.svg?palette=github-dark

      - uses: crazy-max/ghaction-github-pages@v3
        with:
          target_branch: output
          build_dir: dist
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Then embed it in your profile README:

```md
![Arkanoid contribution graph](https://github.com/<username>/<username>/raw/output/github-contribution-arkanoid.svg)
```

### Inputs

| Input              | Required | Default                                    | Description                                           |
| ------------------ | -------- | ------------------------------------------ | ----------------------------------------------------- |
| `github_user_name` | **yes**  | —                                          | GitHub username to pull the contribution calendar from |
| `outputs`          | no       | `dist/github-contribution-arkanoid.svg`    | Output file paths, one per line. Append `?palette=github-dark` for dark mode |

### Palettes

| Name           | Preview                                                                 |
| -------------- | ----------------------------------------------------------------------- |
| `github-light` | ![#ebedf0](https://placehold.co/12/ebedf0/ebedf0) ![#9be9a8](https://placehold.co/12/9be9a8/9be9a8) ![#40c463](https://placehold.co/12/40c463/40c463) ![#30a14e](https://placehold.co/12/30a14e/30a14e) ![#216e39](https://placehold.co/12/216e39/216e39) |
| `github-dark`  | ![#161b22](https://placehold.co/12/161b22/161b22) ![#0e4429](https://placehold.co/12/0e4429/0e4429) ![#006d32](https://placehold.co/12/006d32/006d32) ![#26a641](https://placehold.co/12/26a641/26a641) ![#39d353](https://placehold.co/12/39d353/39d353) |

Generate multiple variants in a single run by listing them under `outputs`:

```yaml
outputs: |
  dist/light.svg
  dist/dark.svg?palette=github-dark
```

## Architecture

```
src/
├── index.ts          # Action entry point — orchestrates fetch → simulate → render
├── contributions.ts  # GitHub contribution graph fetcher (GraphQL + HTML fallback)
├── grid.ts           # Grid geometry constants (cell sizes, play area bounds)
├── simulation.ts     # Arkanoid physics engine (ball, paddle, brick collisions)
├── svg-renderer.ts   # Converts simulation frames into CSS-animated SVG
├── palettes.ts       # Color palette definitions
└── types.ts          # Shared TypeScript interfaces
```

### Simulation details

- **Ball** bounces at constant speed off walls, bricks, and the paddle.
- **Paddle** smoothly tracks the ball via linear interpolation.
- **Bricks** have HP equal to their contribution level (1–4). Each hit decreases HP by 1 and transitions the brick color to the next lower level before it finally disappears.
- When fewer than 30% of bricks remain, the paddle enters **targeting mode** — aiming the ball directly at the nearest surviving brick to finish the game cleanly.
- A **progress bar** at the bottom grows as bricks are destroyed.
- The entire simulation runs up to 35 seconds and loops seamlessly.

## Local development

```bash
npm install
npm run build          # outputs dist/index.js
npm run typecheck      # type-check only, no emit
```

To test locally with a username:

```bash
INPUT_GITHUB_USER_NAME=sgiraz INPUT_OUTPUTS="out.svg" node dist/index.js
```

## Acknowledgements

Inspired by [Platane/snk](https://github.com/Platane/snk) — which turns contributions into a snake game. **akn** takes a different route: instead of eating cells, we _break_ them.

## License

[GPL-3.0](./LICENSE)
