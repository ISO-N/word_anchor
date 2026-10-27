export type Point = { x: number; y: number };

/**
 * 练习板的墨线：从起点到终点的横向三次贝塞尔。
 * 首页的板面预览也用它，保证静态预览与真实连线是同一条曲线族。
 */
export function curvePath(
  start: Point,
  end: Point,
  bendRatio = 0.38,
  minBend = 36,
): string {
  const bend = Math.max(minBend, Math.abs(end.x - start.x) * bendRatio);
  return `M ${start.x} ${start.y} C ${start.x + bend} ${start.y}, ${
    end.x - bend
  } ${end.y}, ${end.x} ${end.y}`;
}
