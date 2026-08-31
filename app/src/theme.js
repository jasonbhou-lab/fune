// The Final Choice — an heirloom palette: warm parchment ground, deep navy
// ink, a forest-green primary action, and a soft gold accent for the moments
// that matter (verified badges, the recommended option, the brand ring).
//
// Every screen in the app reads its colors from this one file, so changing
// the values here re-themes the whole product — nothing downstream should
// hold a literal hex code that isn't one of these.
export const colors = {
  bg: "#F6F1E4",
  bgCard: "#FFFFFF",
  bgSunk: "#EEE6D2",
  ink: "#1C2B3B",
  muted: "#54606C",
  faint: "#8B94A0",
  line: "#E3DAC3",

  // Deep navy, used for section labels and the header rail — never for large
  // fills, which is what "primary" is for.
  navy: "#1E3A5C",

  primary: "#33503F",
  primaryInk: "#FFFFFF",
  accent: "#AD8A4E",
  accentSoft: "#F3E7C9",

  // Muted sage, for icon roundels and secondary accents that shouldn't
  // compete with the gold.
  sage: "#7C9885",
  sageSoft: "#E7EFE1",

  ok: "#3F6B4A",
  okSoft: "#E7EFE1",
  warn: "#93672B",
  warnSoft: "#F3E9D8",
  danger: "#954434",
  dangerSoft: "#F3E1DC",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

// Playfair Display carries the wordmark and headings; the body stays on the
// system sans so paragraphs of pricing detail stay easy to scan. Both are
// loaded in App.js via useFonts — anything styled with these families must
// stay behind that gate, which Wordmark and the h1/h2/display roles already
// account for.
export const fonts = {
  serif: "PlayfairDisplay_600SemiBold",
  serifBold: "PlayfairDisplay_700Bold",
};

export const type = {
  display: { fontFamily: fonts.serifBold, fontSize: 26, color: colors.ink },
  h2: { fontFamily: fonts.serif, fontSize: 19, color: colors.ink },
  h3: { fontSize: 15, fontWeight: "700", color: colors.ink },
  body: { fontSize: 14, color: colors.ink },
  caption: { fontSize: 12, color: colors.faint },
  label: { fontSize: 11, color: colors.faint, textTransform: "uppercase", letterSpacing: 0.5 },
};
