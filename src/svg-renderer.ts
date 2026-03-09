import { ContributionGrid, Palette, SimResult, SimFrame } from "./types";
import {
  COLS, ROWS, CELL_SIZE, CELL_RX,
  VIEWBOX_X, VIEWBOX_Y, VIEWBOX_W, VIEWBOX_H,
  PADDLE_Y, PADDLE_WIDTH, PADDLE_HEIGHT, BALL_RADIUS,
  AREA_LEFT, AREA_RIGHT,
  cellX, cellY,
} from "./grid";

export function renderSvg(
  grid: ContributionGrid,
  sim: SimResult,
  palette: Palette
): string {
  const dur = sim.duration;
  const parts: string[] = [];

  parts.push(
    `<svg viewBox="${VIEWBOX_X} ${VIEWBOX_Y} ${VIEWBOX_W} ${VIEWBOX_H}" ` +
    `width="${VIEWBOX_W}" height="${VIEWBOX_H}" xmlns="http://www.w3.org/2000/svg">` +
    `<desc>Generated with https://github.com/sgiraz/akn</desc>`
  );

  // Build brick hit sequences: each brick can be hit multiple times
  // before being destroyed, changing color progressively
  interface BrickHitEvent { pct: number; fromLevel: number; toLevel: number }
  const brickHitSequences = new Map<string, BrickHitEvent[]>();
  const brickOriginalLevels = new Map<string, number>();

  // Collect original levels
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      if (grid[col][row].level > 0) {
        brickOriginalLevels.set(`${col},${row}`, grid[col][row].level);
      }
    }
  }

  // Collect all hit events per brick
  for (const frame of sim.frames) {
    if (frame.brickHit) {
      const key = `${frame.brickHit.col},${frame.brickHit.row}`;
      if (!brickHitSequences.has(key)) {
        brickHitSequences.set(key, []);
      }
      brickHitSequences.get(key)!.push({
        pct: (frame.time / dur) * 100,
        fromLevel: frame.brickHit.fromLevel,
        toLevel: frame.brickHit.toLevel,
      });
    }
  }

  // Generate CSS
  parts.push("<style>");

  // Root CSS variables
  parts.push(
    `:root{--cb:${palette.border};--cbl:${palette.ball};--cp:${palette.paddle};--ce:${palette.empty};--ch:${palette.hit};` +
    `--c0:${palette.levels[0]};--c1:${palette.levels[1]};--c2:${palette.levels[2]};` +
    `--c3:${palette.levels[3]};--c4:${palette.levels[4]}}`
  );

  // Base cell style
  parts.push(
    `.c{shape-rendering:geometricPrecision;fill:var(--ce);stroke-width:1px;` +
    `stroke:var(--cb);animation:none ${dur}ms linear infinite;` +
    `width:${CELL_SIZE}px;height:${CELL_SIZE}px}`
  );

  // Per-brick keyframes with multi-hit support
  let brickIdx = 0;
  const brickClasses = new Map<string, string>();

  for (const [key, origLevel] of brickOriginalLevels) {
    const cls = toShortClass(brickIdx);
    brickClasses.set(key, cls);
    const hits = brickHitSequences.get(key);

    if (hits && hits.length > 0) {
      // Build keyframes: brick starts at original level, flashes white on hit,
      // then transitions to new color (or disappears)
      let kf = `@keyframes ${cls}{`;

      for (let i = 0; i < hits.length; i++) {
        const hit = hits[i];
        const p1 = hit.pct.toFixed(2);
        // Flash: brief white burst at moment of impact
        const pFlash = (hit.pct + 0.01).toFixed(2);
        const p2 = (hit.pct + 0.15).toFixed(2);

        // Just before the hit, brick is still at fromLevel
        kf += `${p1}%{fill:var(--c${hit.fromLevel})}`;
        // White flash on impact
        kf += `${pFlash}%{fill:var(--ch)}`;

        if (hit.toLevel <= 0) {
          // Destroyed: fade from flash to empty
          kf += `${p2}%,100%{fill:var(--ce)}`;
        } else {
          // Damaged: flash resolves to new level color
          kf += `${p2}%{fill:var(--c${hit.toLevel})}`;
        }
      }

      kf += `}`;
      parts.push(kf + `.c.${cls}{fill:var(--c${origLevel});animation-name:${cls}}`);
    } else {
      // Never hit - show as permanent
      parts.push(`.c.${cls}{fill:var(--c${origLevel})}`);
    }

    brickIdx++;
  }

  // Count total bricks for progress bar (only fully destroyed ones)
  const totalBricks = brickOriginalLevels.size;

  // Ball keyframes
  const ballFrames = sim.frames.filter((f, i) => {
    // Keep first, last, and bounce/hit frames, plus periodic samples
    if (i === 0 || i === sim.frames.length - 1) return true;
    if (f.brickHit) return true;
    return true; // keep all recorded frames (already filtered in simulation)
  });

  parts.push(`.ball{fill:var(--cbl);animation:ball-move ${dur}ms linear infinite}`);
  parts.push(`@keyframes ball-move{`);
  for (const frame of ballFrames) {
    const pct = ((frame.time / dur) * 100).toFixed(2);
    parts.push(`${pct}%{transform:translate(${frame.ballX.toFixed(1)}px,${frame.ballY.toFixed(1)}px)}`);
  }
  parts.push(`}`);

  // Paddle keyframes
  parts.push(
    `.paddle{fill:var(--cp);animation:paddle-move ${dur}ms linear infinite}`
  );
  parts.push(`@keyframes paddle-move{`);
  for (const frame of ballFrames) {
    const pct = ((frame.time / dur) * 100).toFixed(2);
    const px = (frame.paddleX - PADDLE_WIDTH / 2).toFixed(1);
    parts.push(`${pct}%{transform:translate(${px}px,0)}`);
  }
  parts.push(`}`);

  // Progress bar (only counts fully destroyed bricks)
  const destroyEvents = sim.frames.filter((f) => f.brickHit && f.brickHit.toLevel <= 0);
  if (totalBricks > 0) {
    parts.push(
      `.u{transform-origin:0 0;transform:scale(0,1);animation:progress ${dur}ms linear infinite}`
    );
    parts.push(`@keyframes progress{`);
    let destroyed = 0;
    for (const frame of destroyEvents) {
      destroyed++;
      const pct = ((frame.time / dur) * 100).toFixed(2);
      const scale = (destroyed / totalBricks).toFixed(3);
      parts.push(`${pct}%{transform:scale(${scale},1)}`);
    }
    parts.push(`100%{transform:scale(1,1)}`);
    parts.push(`}`);
  }

  parts.push("</style>");

  // Grid cells (rects)
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      const x = cellX(col);
      const y = cellY(row);
      const key = `${col},${row}`;
      const brickCls = brickClasses.get(key);
      if (brickCls) {
        parts.push(
          `<rect class="c ${brickCls}" x="${x}" y="${y}" rx="${CELL_RX}" ry="${CELL_RX}"/>`
        );
      } else {
        parts.push(
          `<rect class="c" x="${x}" y="${y}" rx="${CELL_RX}" ry="${CELL_RX}"/>`
        );
      }
    }
  }

  // Ball (circle rendered at origin, animated via translate)
  parts.push(
    `<circle class="ball" cx="0" cy="0" r="${BALL_RADIUS}"/>`
  );

  // Paddle (rendered at x=0, animated via translate)
  parts.push(
    `<rect class="paddle" x="0" y="${PADDLE_Y}" ` +
    `width="${PADDLE_WIDTH}" height="${PADDLE_HEIGHT}" rx="3"/>`
  );

  // Progress bar
  if (totalBricks > 0) {
    const barWidth = (COLS - 1) * 16 + CELL_SIZE; // same width as grid
    parts.push(
      `<rect class="u" height="8" width="${barWidth}" x="${AREA_LEFT}" y="160" rx="2" fill="var(--c1)"/>`
    );
  }

  parts.push("</svg>");
  return parts.join("");
}

function toShortClass(idx: number): string {
  // Generate short class names: b0, b1, ..., b9, ba, bb, ..., bz, b10, ...
  if (idx < 10) return `b${idx}`;
  if (idx < 36) return `b${String.fromCharCode(97 + idx - 10)}`;
  return `b${idx}`;
}
