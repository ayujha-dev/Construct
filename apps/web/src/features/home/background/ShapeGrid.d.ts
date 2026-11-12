import type { CSSProperties, FC } from 'react';

export interface ShapeGridProps {
  shape?: 'square' | 'tile' | 'hexagon' | 'triangle' | 'diamond' | 'circle' | 'cross' | 'dot';
  cellSize?: number;
  lineWidth?: number;
  direction?: 'right' | 'left' | 'up' | 'down' | 'diagonal' | 'none';
  speed?: number;
  lineColor?: string;
  hoverColor?: string;
  hoverFillColor?: string;
  fillOpacity?: number;
  rainbow?: boolean;
  tiltX?: number;
  tiltY?: number;
  radius?: number;
  trail?: number;
  glow?: number;
  twinkle?: number;
  fade?: number;
  clickCascade?: boolean;
  intro?: boolean;
  opacity?: number;
  backgroundColor?: string;
  paused?: boolean;
  dpr?: number;
  className?: string;
  style?: CSSProperties;
}

declare const ShapeGrid: FC<ShapeGridProps>;
export default ShapeGrid;
