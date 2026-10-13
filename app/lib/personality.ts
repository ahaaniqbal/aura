import type { Personality } from "./api";

// The four ways Aura can talk to you. Each sample is the same morning, said differently, so the
// choice is about voice and nothing else.
export const PERSONALITIES: { key: Personality; label: string; line: string; sample: string }[] = [
  { key: "witty", label: "Witty", line: "Quick, playful, a little roasty.", sample: "three meetings and the dentist. ambitious. i moved the 2pm so you can eat lunch like a person." },
  { key: "warm", label: "Warm", line: "Kind, encouraging, in your corner.", sample: "big day, three meetings and the dentist. you've got this. i kept lunch clear so you can breathe." },
  { key: "blunt", label: "Blunt", line: "No fluff. The true thing first.", sample: "three meetings, dentist at 4. the 2pm has no agenda. decline it." },
  { key: "chill", label: "Chill", line: "Low-key and unbothered.", sample: "pretty easy day. three meetings, dentist at 4. nothing's on fire." },
];

export const personalityLabel = (k: Personality) => PERSONALITIES.find((p) => p.key === k)?.label || "Witty";
