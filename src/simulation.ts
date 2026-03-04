import { ContributionGrid, SimFrame, SimResult, BallState } from "./types";
import {
  COLS, ROWS, CELL_SIZE, CELL_SPACING, CELL_OFFSET,
  AREA_LEFT, AREA_RIGHT, AREA_TOP,
  PADDLE_Y, PADDLE_WIDTH, BALL_RADIUS,
  cellX, cellY,
} from "./grid";

const DT = 6; // ms per simulation step
const BALL_SPEED = 5; // px per step
const MAX_DURATION = 60000;
const PADDLE_LERP = 0.12;
const TARGET_PHASE_THRESHOLD = 0.3; // switch to targeting when <30% bricks remain

interface ActiveBrick {
  col: number;
  row: number;
  level: number;  // original level (for reference)
  hp: number;     // current HP, starts at level, destroyed at 0
  x: number;
  y: number;
}

export function simulateArkanoid(grid: ContributionGrid): SimResult {
  // Collect active bricks (level > 0)
  const activeBricks = new Map<string, ActiveBrick>();
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      const cell = grid[col][row];
      if (cell.level > 0) {
        const key = `${col},${row}`;
        activeBricks.set(key, {
          col, row, level: cell.level, hp: cell.level,
          x: cellX(col), y: cellY(row),
        });
      }
    }
  }

  const totalBricks = activeBricks.size;
  if (totalBricks === 0) {
    return { frames: [], duration: 1000 };
  }

  // Initial ball state: center-bottom, moving up-right
  const angle = -Math.PI / 3; // 60 degrees upward
  const ball: BallState = {
    x: (AREA_LEFT + AREA_RIGHT) / 2,
    y: PADDLE_Y - BALL_RADIUS - 1,
    vx: Math.cos(angle) * BALL_SPEED,
    vy: Math.sin(angle) * BALL_SPEED,
  };

  let paddleX = ball.x;
  const frames: SimFrame[] = [];
  let t = 0;
  let lastRecordedBallX = ball.x;
  let lastRecordedBallY = ball.y;

  // Record initial frame
  frames.push({
    time: 0,
    ballX: ball.x,
    ballY: ball.y,
    paddleX,
  });

  while (activeBricks.size > 0 && t < MAX_DURATION) {
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

    // Paddle collision
    if (ball.vy > 0 && ball.y + BALL_RADIUS >= PADDLE_Y && ball.y + BALL_RADIUS < PADDLE_Y + 16) {
      const paddleLeft = paddleX - PADDLE_WIDTH / 2;
      const paddleRight = paddleX + PADDLE_WIDTH / 2;
      if (ball.x >= paddleLeft && ball.x <= paddleRight) {
        ball.y = PADDLE_Y - BALL_RADIUS;
        const hitOffset = (ball.x - paddleX) / (PADDLE_WIDTH / 2);

        // In targeting phase, aim at remaining bricks
        if (activeBricks.size < totalBricks * TARGET_PHASE_THRESHOLD && activeBricks.size > 0) {
          const target = findNearestBrick(ball.x, ball.y, activeBricks);
          if (target) {
            const targetCX = target.x + CELL_SIZE / 2;
            const targetCY = target.y + CELL_SIZE / 2;
            const tdx = targetCX - ball.x;
            const tdy = targetCY - ball.y;
            const tdist = Math.sqrt(tdx * tdx + tdy * tdy);
            ball.vx = (tdx / tdist) * BALL_SPEED;
            ball.vy = (tdy / tdist) * BALL_SPEED;
          }
        } else {
          // Normal bounce with angle variation from paddle hit position
          const baseAngle = -Math.PI / 2;
          const angleRange = Math.PI / 3;
          const launchAngle = baseAngle + hitOffset * angleRange;
          ball.vx = Math.cos(launchAngle) * BALL_SPEED;
          ball.vy = Math.sin(launchAngle) * BALL_SPEED;
        }

        bounced = true;
      }
    }

    // Ball falls below paddle - reset
    if (ball.y > PADDLE_Y + 30) {
      ball.y = PADDLE_Y - BALL_RADIUS;
      ball.vy = -Math.abs(ball.vy);

      // Aim at nearest brick on reset
      if (activeBricks.size > 0) {
        const target = findNearestBrick(ball.x, ball.y, activeBricks);
        if (target) {
          const targetCX = target.x + CELL_SIZE / 2;
          const targetCY = target.y + CELL_SIZE / 2;
          const tdx = targetCX - ball.x;
          const tdy = targetCY - ball.y;
          const tdist = Math.sqrt(tdx * tdx + tdy * tdy);
          ball.vx = (tdx / tdist) * BALL_SPEED;
          ball.vy = (tdy / tdist) * BALL_SPEED;
        }
      }
      bounced = true;
    }

    // Normalize speed after any bounce
    if (bounced) {
      const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
      if (speed > 0) {
        ball.vx = (ball.vx / speed) * BALL_SPEED;
        ball.vy = (ball.vy / speed) * BALL_SPEED;
      }
    }

    // Paddle tracking
    paddleX += (ball.x - paddleX) * PADDLE_LERP;
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
      // Record periodically for smooth paddle motion (every ~200ms)
      const dist = Math.sqrt(
        (ball.x - lastRecordedBallX) ** 2 +
        (ball.y - lastRecordedBallY) ** 2
      );
      if (dist > 80) {
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
