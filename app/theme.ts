// Aura design system — warm cream + pastel aura, editorial type.
// Grounded in references (Outseta type, Liven/Tolan orb, mymind/Perplexity restraint).
export const c = {
  bg: "#FBF7F0",        // warm cream
  surface: "#FFFDFA",   // near-white card
  surfaceAlt: "#F5EEE4",
  text: "#2C2724",      // warm charcoal
  muted: "#8A817A",     // taupe
  hairline: "#ECE4D8",
  // pastel accents
  lavender: "#C9B8F0",
  blush: "#F7C5C0",
  mint: "#B9E3CB",
  sky: "#BCD7F2",
  peach: "#F6CDA8",
  // derived / actionable
  userBubble: "#EDE6FB",   // lavender tint
  chipBg: "#EFE9FB",
  mintBtn: "#B9E3CB",
  text2: "#FBF7F0",
  accent: "#6C5CB0",       // deep lavender, primary CTA
  accentPressed: "#5F4FA0",
};

// orb gradient stops per mood (3-stop ~135deg)
export const orb = {
  idle: ["#C9B8F0", "#BCD7F2", "#B9E3CB"],
  thinking: ["#C9B8F0", "#D9B8E8", "#F7C5C0"],
  warm: ["#F7C5C0", "#F6CDA8", "#F3D9A0"],
} as const;

export const sp = { xs: 4, s: 8, m: 12, l: 16, xl: 20, xxl: 24, h: 32, xh: 48 };
export const r = { chip: 999, button: 14, bubble: 20, card: 22, sheet: 26, input: 22, tile: 14 };

export const shadow = {
  card: { shadowColor: "#5B4A37", shadowOpacity: 0.1, shadowRadius: 24, shadowOffset: { width: 0, height: 14 }, elevation: 5 },
  soft: { shadowColor: "#5B4A37", shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
};

export const font = {
  display: "Fraunces_600SemiBold",
  displayMed: "Fraunces_500Medium",
  italic: "Fraunces_400Regular_Italic",
  body: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
};

export const type = {
  hero: 34,
  h1: 28,
  h2: 22,
  title: 18,
  body: 16,
  subhead: 15,
  caption: 13,
  micro: 11.5,
};
