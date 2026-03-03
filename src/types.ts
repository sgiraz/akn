export interface Cell {
  col: number; // 0-51
  row: number; // 0-6
  level: number; // 0-4
}

export type ContributionGrid = Cell[][];

export interface BallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface BrickHit {
  col: number;
  row: number;
  fromLevel: number; // level before this hit
  toLevel: number;   // level after this hit (0 = destroyed)
}

export interface SimFrame {
  time: number;
  ballX: number;
  ballY: number;
  paddleX: number;
  brickHit?: BrickHit;
}

export interface SimResult {
  frames: SimFrame[];
  duration: number;
}

export interface Palette {
  empty: string;
  border: string;
  accent: string;
  levels: [string, string, string, string, string];
}

export interface OutputSpec {
  path: string;
  palette: string;
}
