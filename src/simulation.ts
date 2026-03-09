import { ContributionGrid, SimFrame, SimResult, BallState } from "./types";
import {
  COLS, ROWS, CELL_SIZE, CELL_SPACING, CELL_OFFSET,
  AREA_LEFT, AREA_RIGHT, AREA_TOP,
  PADDLE_Y, PADDLE_WIDTH, PADDLE_HEIGHT, BALL_RADIUS,
  cellX, cellY,
} from "./grid";

const DT = 6; // ms per simulation step
const BALL_SPEED = 3.5; // px per step
const FLOOR_Y = PADDLE_Y + 20; // invisible floor below paddle for missed balls

// Paddle bounce: angle varies based on hit position
// Center hit → 90° (straight up), edge hit → ~30° from horizontal
const PADDLE_MIN_ANGLE = Math.PI * 0.15; // ~27° from horizontal (extreme edge)
const PADDLE_MAX_ANGLE = Math.PI * 0.85; // ~153° from horizontal (other extreme edge)

interface ActiveBrick {
  col: number;
  row: number;
  level: number;  // original level (for reference)
  hp: number;     // current HP, starts at level, destroyed at 0
  x: number;
  y: number;
}

// Simple seeded PRNG for deterministic "randomness"
function createRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function computeMaxDuration(totalBricks: number, totalHP: number): number {
  // Account for both brick count (travel time) and HP (hits needed)
  const estimate = totalBricks * 800 + totalHP * 200;
  return Math.max(30000, Math.min(120000, estimate));
}

// Predict where the ball will intersect a given Y level (simple linear projection)
function predictBallX(ball: BallState, targetY: number): number {
  if (ball.vy <= 0) return ball.x; // ball moving up, no prediction
  const dt = (targetY - ball.y) / ball.vy;
  let px = ball.x + ball.vx * dt;
  // Simulate wall bounces for the prediction
  const width = AREA_RIGHT - AREA_LEFT - BALL_RADIUS * 2;
  const left = AREA_LEFT + BALL_RADIUS;
  px -= left;
  // Fold the position back into bounds (mirror reflections)
  const cycle = width * 2;
  px = ((px % cycle) + cycle) % cycle;
  if (px > width) px = cycle - px;
  return px + left;
}

export function simulateArkanoid(grid: ContributionGrid): SimResult {
  // Collect active bricks (level > 0)
  const activeBricks = new Map<string, ActiveBrick>();
  let totalHP = 0;
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      const cell = grid[col][row];
      if (cell.level > 0) {
        const key = `${col},${row}`;
        activeBricks.set(key, {
          col, row, level: cell.level, hp: cell.level,
          x: cellX(col), y: cellY(row),
        });
        totalHP += cell.level;
      }
    }
  }

  const totalBricks = activeBricks.size;
  if (totalBricks === 0) {
    return { frames: [], duration: 1000 };
  }

  const maxDuration = computeMaxDuration(totalBricks, totalHP);
  const rng = createRng(totalHP * 7 + totalBricks * 13);

  // Initial ball state: center-bottom, moving up at a slight angle
  const startAngle = -Math.PI / 2 + (rng() - 0.5) * 0.4; // ~90° ± 12°
  const ball: BallState = {
    x: (AREA_LEFT + AREA_RIGHT) / 2,
    y: PADDLE_Y - BALL_RADIUS - 1,
    vx: Math.cos(startAngle) * BALL_SPEED,
    vy: Math.sin(startAngle) * BALL_SPEED,
  };

  let paddleX = ball.x;
  let paddleTargetX = ball.x;
  const frames: SimFrame[] = [];
  let t = 0;
  let lastRecordedBallX = ball.x;
  let lastRecordedBallY = ball.y;
  let consecutiveMisses = 0;

  // Record initial frame
  frames.push({
    time: 0,
    ballX: ball.x,
    ballY: ball.y,
    paddleX,
  });

  while (activeBricks.size > 0 && t < maxDuration) {
    t += DT;

    // Move ball
    ball.x += ball.vx;
    ball.y += ball.vy;

    let bounced = false;

    // Wall collisions (left, right)
    if (ball.x - BALL_RADIUS <= AREA_LEFT) {
      ball.x = AREA_LEFT + BALL_RADIUS;
      ball.vx = Math.abs(ball.vx);
      bounced = true;
    } else if (ball.x + BALL_RADIUS >= AREA_RIGHT) {
      ball.x = AREA_RIGHT - BALL_RADIUS;
      ball.vx = -Math.abs(ball.vx);
      bounced = true;
    }

    // Top wall
    if (ball.y - BALL_RADIUS <= AREA_TOP) {
      ball.y = AREA_TOP + BALL_RADIUS;
      ball.vy = Math.abs(ball.vy);
      bounced = true;
    }

    // Brick collisions
    let hitBrick: { brick: ActiveBrick; fromLevel: number; toLevel: number } | null = null;
    for (const [key, brick] of activeBricks) {
      if (circleRectOverlap(ball.x, ball.y, BALL_RADIUS, brick.x, brick.y, CELL_SIZE, CELL_SIZE)) {
        const fromLevel = brick.hp;
        brick.hp--;
        const toLevel = brick.hp;

        hitBrick = { brick, fromLevel, toLevel };

        if (brick.hp <= 0) {
          activeBricks.delete(key);
        }

        // Determine bounce direction
        const brickCenterX = brick.x + CELL_SIZE / 2;
        const brickCenterY = brick.y + CELL_SIZE / 2;
        const dx = ball.x - brickCenterX;
        const dy = ball.y - brickCenterY;

        if (Math.abs(dx) / CELL_SIZE > Math.abs(dy) / CELL_SIZE) {
          ball.vx = dx > 0 ? Math.abs(ball.vx) : -Math.abs(ball.vx);
        } else {
          ball.vy = dy > 0 ? Math.abs(ball.vy) : -Math.abs(ball.vy);
        }

        bounced = true;
        break;
      }
    }

    // Paddle zone
    if (ball.vy > 0 && ball.y + BALL_RADIUS >= PADDLE_Y) {
      const paddleLeft = paddleX - PADDLE_WIDTH / 2;
      const paddleRight = paddleX + PADDLE_WIDTH / 2;

      if (ball.x >= paddleLeft - 2 && ball.x <= paddleRight + 2) {
        // Ball hit the paddle — angle depends on where it hit
        ball.y = PADDLE_Y - BALL_RADIUS;
        consecutiveMisses = 0;

        // Normalize hit position to [-1, 1] (left edge to right edge)
        const hitPos = (ball.x - paddleX) / (PADDLE_WIDTH / 2);
        const clampedHit = Math.max(-1, Math.min(1, hitPos));

        // Map to angle: center → straight up (PI/2), edges → sharper angles
        const bounceAngle = PADDLE_MIN_ANGLE + (1 - clampedHit) / 2 * (PADDLE_MAX_ANGLE - PADDLE_MIN_ANGLE);
        let newVx = Math.cos(bounceAngle) * BALL_SPEED;
        let newVy = -Math.sin(bounceAngle) * BALL_SPEED;

        // Subtle aiming: bias bounce direction toward nearest brick
        // Simulates a skilled player angling their paddle intentionally
        const timeProgress = t / maxDuration;
        const target = findNearestBrick(ball.x, ball.y, activeBricks);
        if (target) {
          const tdx = (target.x + CELL_SIZE / 2) - ball.x;
          const tdy = (target.y + CELL_SIZE / 2) - ball.y;
          const tdist = Math.sqrt(tdx * tdx + tdy * tdy);
          const aimVx = (tdx / tdist) * BALL_SPEED;
          const aimVy = (tdy / tdist) * BALL_SPEED;
          // Aiming strength: subtle early on, stronger as game progresses
          const aimBlend = 0.15 + timeProgress * 0.25;
          newVx = newVx * (1 - aimBlend) + aimVx * aimBlend;
          newVy = newVy * (1 - aimBlend) + aimVy * aimBlend;
        }

        ball.vx = newVx;
        ball.vy = newVy;

        bounced = true;
      } else if (ball.y + BALL_RADIUS >= FLOOR_Y) {
        // Ball missed paddle and hit the invisible floor — bounce back up
        ball.y = FLOOR_Y - BALL_RADIUS;
        ball.vy = -Math.abs(ball.vy);
        consecutiveMisses++;

        // After misses or late in the game, gently steer toward bricks
        if (consecutiveMisses >= 2 || t > maxDuration * 0.7) {
          const target = findNearestBrick(ball.x, ball.y, activeBricks);
          if (target) {
            const targetCX = target.x + CELL_SIZE / 2;
            const targetCY = target.y + CELL_SIZE / 2;
            const tdx = targetCX - ball.x;
            const tdy = targetCY - ball.y;
            const tdist = Math.sqrt(tdx * tdx + tdy * tdy);
            // Blend current direction with target direction
            const blend = consecutiveMisses >= 5 ? 0.8 : 0.5;
            ball.vx = ball.vx * (1 - blend) + (tdx / tdist) * BALL_SPEED * blend;
            ball.vy = ball.vy * (1 - blend) + (tdy / tdist) * BALL_SPEED * blend;
          }
        }

        bounced = true;
      }
      // else: ball is between paddle and floor, let it keep falling
    }

    // Normalize speed after any bounce
    if (bounced) {
      const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
      if (speed > 0) {
        ball.vx = (ball.vx / speed) * BALL_SPEED;
        ball.vy = (ball.vy / speed) * BALL_SPEED;
      }
    }

    // Paddle AI: predict where the ball will land and move toward that point
    const timeProgress = t / maxDuration;
    if (ball.vy > 0) {
      // Ball coming down — predict landing position
      const predicted = predictBallX(ball, PADDLE_Y - BALL_RADIUS);
      // Slight imprecision early on, precise later or after misses
      const imprecision = consecutiveMisses >= 1 || timeProgress > 0.7 ? 0 : (rng() - 0.5) * 10;
      paddleTargetX = predicted + imprecision;
    }
    // else: ball going up — keep moving toward last predicted target (anticipation)

    // Paddle movement speed: variable lerp for more natural feel
    // Faster when ball is close to paddle, slower when far away
    const ballDistToPaddle = Math.abs(ball.y - PADDLE_Y);
    const urgency = 1 - Math.min(1, ballDistToPaddle / 120);
    const baseLerp = 0.08;
    const urgentLerp = 0.22;
    const lerpFactor = baseLerp + urgency * (urgentLerp - baseLerp);
    paddleX += (paddleTargetX - paddleX) * lerpFactor;
    paddleX = Math.max(AREA_LEFT + PADDLE_WIDTH / 2, Math.min(AREA_RIGHT - PADDLE_WIDTH / 2, paddleX));

    // Record frame at bounces or brick hits
    if (hitBrick) {
      frames.push({
        time: t,
        ballX: ball.x,
        ballY: ball.y,
        paddleX,
        brickHit: {
          col: hitBrick.brick.col,
          row: hitBrick.brick.row,
          fromLevel: hitBrick.fromLevel,
          toLevel: hitBrick.toLevel,
        },
      });
      lastRecordedBallX = ball.x;
      lastRecordedBallY = ball.y;
    } else if (bounced) {
      frames.push({
        time: t,
        ballX: ball.x,
        ballY: ball.y,
        paddleX,
      });
      lastRecordedBallX = ball.x;
      lastRecordedBallY = ball.y;
    } else {
      // Record periodically for smooth motion (every ~40px of ball travel)
      const dist = Math.sqrt(
        (ball.x - lastRecordedBallX) ** 2 +
        (ball.y - lastRecordedBallY) ** 2
      );
      if (dist > 40) {
        frames.push({
          time: t,
          ballX: ball.x,
          ballY: ball.y,
          paddleX,
        });
        lastRecordedBallX = ball.x;
        lastRecordedBallY = ball.y;
      }
    }
  }

  // Force-destroy any remaining bricks at the end
  const finalTime = t;
  for (const [, brick] of activeBricks) {
    frames.push({
      time: finalTime,
      ballX: ball.x,
      ballY: ball.y,
      paddleX,
      brickHit: { col: brick.col, row: brick.row, fromLevel: brick.hp, toLevel: 0 },
    });
  }

  // Add final frame
  frames.push({
    time: finalTime + 100,
    ballX: ball.x,
    ballY: ball.y,
    paddleX,
  });

  return {
    frames,
    duration: finalTime + 500,
  };
}

function circleRectOverlap(
  cx: number, cy: number, r: number,
  rx: number, ry: number, rw: number, rh: number
): boolean {
  const closestX = Math.max(rx, Math.min(cx, rx + rw));
  const closestY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy <= r * r;
}

function findNearestBrick(
  x: number, y: number,
  bricks: Map<string, ActiveBrick>
): ActiveBrick | null {
  let nearest: ActiveBrick | null = null;
  let minDist = Infinity;
  for (const [, brick] of bricks) {
    const bcx = brick.x + CELL_SIZE / 2;
    const bcy = brick.y + CELL_SIZE / 2;
    const dist = Math.sqrt((x - bcx) ** 2 + (y - bcy) ** 2);
    if (dist < minDist) {
      minDist = dist;
      nearest = brick;
    }
  }
  return nearest;
}
