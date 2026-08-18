import { Platform, useWindowDimensions } from "react-native";

// The "narrow, centered column" treatment on web was written as a flat
// `maxWidth: "50%"`. Platform.OS === "web" is also true in a PHONE browser,
// so on a 375pt viewport that produced a 188pt column with 156pt text inputs —
// 41% of the screen, with every button label wrapping onto two or three lines.
//
// 50% of a 1440pt desktop window is a comfortable reading measure. 50% of a
// phone is unusable. The constraint therefore has to be conditional on how much
// width there actually is, not on the platform.

// Below this, a viewport is treated as a phone or small tablet and content uses
// the full width (minus padding). 768 is the conventional tablet-portrait line
// and sits above every current phone in landscape.
export const WIDE_SCREEN_MIN_WIDTH = 768;

// Above the breakpoint, 50% keeps the original desktop intent, but an upper
// bound in points stops the column growing absurdly wide on a large monitor,
// where a 50% measure would be ~1200pt of line length.
export const MAX_CONTENT_WIDTH = 720;

// ...and a lower bound, so the column is never cramped just because the window
// is smallish. At 768pt (tablet portrait) a flat 50% gives 384pt, which fits the
// content but wastes half the screen on margins. Content is comfortable from
// ~343pt up, measured, so 480 is a safe floor. It only ever widens the column,
// and is still clamped to the window width below.
export const MIN_CONTENT_WIDTH = 480;

/** True only on web, and only when the window is wide enough to narrow. */
export function useIsWideScreen() {
  const { width } = useWindowDimensions();
  return Platform.OS === "web" && width >= WIDE_SCREEN_MIN_WIDTH;
}

/**
 * Style fragment for a centered content column.
 *
 * Returns null on native and on narrow web viewports, so content keeps the full
 * available width there. useWindowDimensions re-renders on resize and on device
 * rotation, so this responds live rather than being fixed at first paint.
 */
export function useContentWidth() {
  const { width } = useWindowDimensions();
  if (Platform.OS !== "web" || width < WIDE_SCREEN_MIN_WIDTH) return null;

  // Half the window, clamped between the readable floor and the upper bound,
  // then never wider than the window itself.
  const half = width * 0.5;
  const clamped = Math.min(Math.max(half, MIN_CONTENT_WIDTH), MAX_CONTENT_WIDTH);

  return {
    width: "100%",
    maxWidth: Math.min(clamped, width),
    alignSelf: "center",
  };
}
