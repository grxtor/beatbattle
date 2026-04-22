/**
 * Hidden SVG that defines the three hand-drawn displacement filters
 * referenced by <Sketch>. Mount once in layout.tsx.
 *
 * Higher `scale` = more border wobble.
 */
export default function SketchDefs() {
  return (
    <svg
      width="0"
      height="0"
      aria-hidden
      style={{ position: "absolute", pointerEvents: "none" }}
    >
      <defs>
        <filter id="sketch-1" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.022"
            numOctaves="2"
            seed="2"
            result="n"
          />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="5" />
        </filter>
        <filter id="sketch-2" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.028"
            numOctaves="2"
            seed="7"
            result="n"
          />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="4.2" />
        </filter>
        <filter id="sketch-3" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.036"
            numOctaves="2"
            seed="13"
            result="n"
          />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="6" />
        </filter>
      </defs>
    </svg>
  );
}
