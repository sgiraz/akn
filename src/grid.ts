export const COLS = 52;
export const ROWS = 7;
export const CELL_SIZE = 12;
export const CELL_SPACING = 16;
export const CELL_OFFSET = 2;
export const CELL_RX = 2;

export const VIEWBOX_X = -16;
export const VIEWBOX_Y = -32;
export const VIEWBOX_W = 880;
export const VIEWBOX_H = 200;

// Play area bounds
export const AREA_LEFT = CELL_OFFSET;
export const AREA_RIGHT = CELL_OFFSET + (COLS - 1) * CELL_SPACING + CELL_SIZE;
export const AREA_TOP = CELL_OFFSET;
export const AREA_BOTTOM = CELL_OFFSET + (ROWS - 1) * CELL_SPACING + CELL_SIZE;

// Paddle and ball
export const PADDLE_Y = 140;
export const PADDLE_WIDTH = 60;
export const PADDLE_HEIGHT = 8;
export const BALL_RADIUS = 5;

export function cellX(col: number): number {
  return CELL_OFFSET + col * CELL_SPACING;
}

export function cellY(row: number): number {
  return CELL_OFFSET + row * CELL_SPACING;
}
