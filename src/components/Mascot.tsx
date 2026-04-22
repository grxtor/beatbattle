/**
 * Pixel cassette mascot — orange palette, sized via `scale` prop.
 * Fully self-contained SVG, no external CSS.
 */

type Props = {
  scale?: number;
  shadow?: boolean;
  className?: string;
};

export default function Mascot({
  scale = 1.4,
  shadow = true,
  className,
}: Props) {
  const O = "#ff8a2a";
  const H = "#ffb06a";
  const D = "#b05010";
  const X = "#1a0a00";
  const rows: (string | null)[][] = [
    [null, null, D, D, D, D, D, D, D, D, D, D, null, null],
    [null, D, O, O, O, O, O, O, O, O, O, O, D, null],
    [D, O, O, X, O, O, O, O, O, O, X, O, O, D],
    [D, O, O, X, O, O, H, H, O, O, X, O, O, D],
    [D, O, O, O, O, H, H, H, H, O, O, O, O, D],
    [D, O, O, X, O, O, H, H, O, O, X, O, O, D],
    [D, O, O, X, O, O, O, O, O, O, X, O, O, D],
    [null, D, O, O, O, O, O, O, O, O, O, O, D, null],
    [null, null, D, D, D, D, D, D, D, D, D, D, null, null],
  ];
  const c = 8;
  const w = rows[0].length * c;
  const h = rows.length * c;
  return (
    <svg
      className={className}
      width={w * scale}
      height={h * scale}
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      aria-hidden
      style={
        shadow
          ? { filter: "drop-shadow(0 4px 0 rgba(176, 80, 16, 0.25))" }
          : undefined
      }
    >
      {rows.map((row, y) =>
        row.map((col, x) =>
          col ? (
            <rect
              key={`${x}-${y}`}
              x={x * c}
              y={y * c}
              width={c}
              height={c}
              fill={col}
            />
          ) : null,
        ),
      )}
    </svg>
  );
}
