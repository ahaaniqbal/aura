// Aura design system v2 — "your people, alive."
// Bold, glossy, gamified, spatial. Dream-gradient canvases, puffy stickers,
// rounded Nunito display (the SF Pro Rounded twin), accents that mean something.
export const c = {
  bg: "#F4F2FC",            // soft lavender-white base
  surface: "#FFFFFF",
  surfaceAlt: "#ECE8F8",
  text: "#171334",          // ink
  ink: "#171334",
  muted: "#645E8C",         // ink-soft
  hairline: "#E8E3F5",

  // brand + role accents
  accent: "#7B5CFF",        // violet — primary/brand
  accentSoft: "#EDE8FF",
  accentMuted: "rgba(123,92,255,0.12)",
  violet: "#7B5CFF",
  blue: "#2FA9FF",
  pink: "#FF5CA8",          // people / love
  coral: "#FF5A5F",         // overdue / urgent
  mint: "#1FD0A0",          // in touch / done
  sunny: "#FFC93F",         // streaks / highlight
  grape: "#3A2E7A",

  // semantic
  success: "#12C88E",
  successSoft: "#DCF7EE",
  danger: "#FF5A5F",
  dangerSoft: "#FFE9EA",
  urgentBg: "#FFF0F1",
  urgentBorder: "#FFC9CC",

  // legacy keys, remapped so existing screens stay cohesive
  lavender: "#7B5CFF",
  blush: "#FFE1F0",
  sky: "#CFEBFF",
  peach: "#FF7DBE",
  userBubble: "#EAE4FF",
  chipBg: "#EFEBFB",
  overlay: "rgba(23,19,52,0.52)",
  recording: "#FFDFEC",
  recordingBorder: "#FF9CC6",
  recordingIcon: "#D63384",
};

// gradient stacks (use with expo-linear-gradient)
export const grad = {
  today: ["#6B54E8", "#7C5BF0", "#F1EEFF"] as const,   // top violet -> light
  cons: ["#5A3EC8", "#6E4FE6", "#7C63F0"] as const,     // constellation canvas
  violet: ["#8E6BFF", "#5B3EE8"] as const,
  pink: ["#FF8DC5", "#FF4FA0"] as const,
  mint: ["#5BF0C6", "#12CE96"] as const,
  blue: ["#6FC6FF", "#2FA0FF"] as const,
  sky: ["#EAF0FF", "#FDE7F3"] as const,
};

export const orb = {
  idle: ["#8E6BFF", "#5FA8FF", "#22D3A0"],
  thinking: ["#8E6BFF", "#C46BFF", "#FF7DBE"],
  warm: ["#FF7DBE", "#FFB65C", "#FFC93F"],
} as const;

export const sp = { xs: 4, s: 8, m: 12, l: 16, xl: 20, xxl: 24, h: 32, xh: 40 };
export const layout = { page: 20, control: 46, controlSm: 38 };

export const r = {
  chip: 999,
  button: 16,
  bubble: 22,
  bubbleTail: 7,
  card: 24,
  sheet: 30,
  input: 16,
  tab: 16,
  tool: 20,
  toolTile: 15,
};

export const shadow = {
  card: {
    shadowColor: "#2A1B5A",
    shadowOpacity: 0.13,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 13 },
    elevation: 6,
  },
  soft: {
    shadowColor: "#2A1B5A",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  // puffy sticker: a punchy colored drop (pair with a white border for the AMO look)
  puff: {
    shadowColor: "#2A1B5A",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 7,
  },
};

// rounded, heavy, tracked tight (-2%) — the SF Pro Rounded feel via Nunito
export const font = {
  display: "Nunito_800ExtraBold",
  displayMed: "Nunito_700Bold",
  italic: "Nunito_600SemiBold",
  body: "Nunito_500Medium",
  medium: "Nunito_600SemiBold",
  semibold: "Nunito_700Bold",
  bold: "Nunito_800ExtraBold",
};

// global tracking to apply on display/label text
export const tracking = -0.02;

export const type = {
  hero: 32,
  h1: 27,
  h2: 21,
  title: 17,
  body: 16,
  subhead: 15,
  caption: 13,
  micro: 11,
};
