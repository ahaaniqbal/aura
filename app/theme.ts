// Aura design system v4: Swiss precision.
// A cool, flat canvas where typography carries the design and hairlines do the separating.
// Two accents with strict jobs: cobalt is Aura itself (its mark, its voice, links, focus,
// brand surfaces); signal orange means "needs you now" and nothing else. Everything else is ink.
import { Platform, StyleSheet } from "react-native";

export const c = {
  canvas: "#FBFBFC",        // app canvas
  surface: "#FEFEFF",       // fields, sheets, interactive containers
  sunken: "#F1F2F5",        // user bubbles, pressed rows, empty bars
  ink: "#0D0E12",           // text and primary buttons
  ink2: "#4A4D57",          // secondary text
  muted: "#6B6E79",         // tertiary text (4.9:1 on canvas)
  faint: "#A3A6AF",         // placeholders, inactive icons
  line: "#E3E5EA",          // hairlines
  lineStrong: "#CDD0D7",    // rules, outlines

  accent: "#1A3CF0",        // cobalt: Aura, links, focus, selection, brand surfaces
  accentTint: "#E8ECFE",
  onAccent: "#FEFEFF",
  onAccentMuted: "#C9D2FF", // secondary text on cobalt (4.8:1)

  signal: "#FF4F12",        // attention fill: badges, dots, recording
  signalText: "#C93A06",    // attention text (5:1 on canvas)
  signalTint: "#FFEDE6",

  scrim: "rgba(13,14,18,0.4)",
  onInk: "#FEFEFF",
};

export type Tone = "neutral" | "muted" | "accent" | "signal";
export const toneColor: Record<Tone, string> = {
  neutral: c.ink2,
  muted: c.muted,
  accent: c.accent,
  signal: c.signalText,
};

export const f = {
  regular: "Diatype-Regular",
  medium: "Diatype-Medium",
  bold: "Diatype-Bold",
  black: "Diatype-Black",
};

export const fontAssets = {
  [f.regular]: require("./assets/fonts/ABCDiatype-Regular.otf"),
  [f.medium]: require("./assets/fonts/ABCDiatype-Medium.otf"),
  [f.bold]: require("./assets/fonts/ABCDiatype-Bold.otf"),
  [f.black]: require("./assets/fonts/ABCDiatype-Black.otf"),
};

// Type scale. Diatype runs tight at display sizes and neutral at reading sizes. Display is the
// one place the type gets loud; everything below it steps down by at least 1.2x.
export const t = StyleSheet.create({
  display: { fontFamily: f.medium, fontSize: 38, lineHeight: 41, letterSpacing: -1.6, color: c.ink },
  title1: { fontFamily: f.medium, fontSize: 28, lineHeight: 32, letterSpacing: -0.9, color: c.ink },
  title2: { fontFamily: f.medium, fontSize: 21, lineHeight: 26, letterSpacing: -0.5, color: c.ink },
  headline: { fontFamily: f.medium, fontSize: 16, lineHeight: 21, letterSpacing: -0.2, color: c.ink },
  body: { fontFamily: f.regular, fontSize: 16, lineHeight: 23, letterSpacing: -0.1, color: c.ink },
  callout: { fontFamily: f.regular, fontSize: 15, lineHeight: 21, letterSpacing: -0.1, color: c.ink2 },
  subhead: { fontFamily: f.regular, fontSize: 14, lineHeight: 19, color: c.ink2 },
  footnote: { fontFamily: f.regular, fontSize: 13, lineHeight: 17, color: c.muted },
  label: { fontFamily: f.medium, fontSize: 15, lineHeight: 19, letterSpacing: -0.15, color: c.ink },
  caption: { fontFamily: f.medium, fontSize: 12.5, lineHeight: 16, color: c.muted },
});

export const sp = { xs: 4, s: 8, m: 12, l: 16, xl: 20, xxl: 24, h: 32, xh: 40 };
export const layout = { page: 20 };
export const r = { xs: 4, sm: 8, md: 12, lg: 16, pill: 999 };

// Only things that genuinely float (sheets) get a shadow. Everything else is flat.
export const shadow = {
  float: { shadowColor: "#0D0E12", shadowOpacity: 0.16, shadowRadius: 30, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
};

// Text inputs draw their own focus state; drop the browser focus box on the web build.
export const inputReset: any = Platform.OS === "web" ? { outlineStyle: "none" } : null;
