// Aura design system — warm cream + pastel aura, editorial type.
export const c = {
  bg: "#FBF7F0",
  surface: "#FFFDFA",
  surfaceAlt: "#F3EBE0",
  text: "#2C2724",
  muted: "#7A726A",
  hairline: "#E5DDD2",
  lavender: "#C9B8F0",
  blush: "#F7C5C0",
  mint: "#B9E3CB",
  sky: "#BCD7F2",
  peach: "#F6CDA8",
  userBubble: "#E8E0F8",
  chipBg: "#EFE9FB",
  accent: "#6C5CB0",
  accentSoft: "#EDE8F8",
  accentMuted: "rgba(108, 92, 176, 0.12)",
  success: "#4A9468",
  successSoft: "#E8F5EE",
  danger: "#C96E68",
  dangerSoft: "#FDF0EF",
  urgentBg: "#FFF6F4",
  urgentBorder: "#F0B8B0",
  overlay: "rgba(28, 24, 20, 0.44)",
  recording: "#F3CFCF",
  recordingBorder: "#E29A9A",
  recordingIcon: "#9B2C2C",
};

export const orb = {
  idle: ["#C9B8F0", "#BCD7F2", "#B9E3CB"],
  thinking: ["#C9B8F0", "#D9B8E8", "#F7C5C0"],
  warm: ["#F7C5C0", "#F6CDA8", "#F3D9A0"],
} as const;

export const sp = { xs: 4, s: 8, m: 12, l: 16, xl: 20, xxl: 24, h: 32, xh: 40 };
export const layout = { page: 20, control: 44, controlSm: 36 };

export const r = {
  chip: 999,
  button: 12,
  bubble: 18,
  bubbleTail: 4,
  card: 16,
  sheet: 24,
  input: 14,
  tab: 12,
  tool: 14,
  toolTile: 10,
};

export const shadow = {
  card: {
    shadowColor: "#3D3228",
    shadowOpacity: 0.07,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  soft: {
    shadowColor: "#3D3228",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
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
  hero: 30,
  h1: 26,
  h2: 20,
  title: 17,
  body: 16,
  subhead: 15,
  caption: 13,
  micro: 11,
};
