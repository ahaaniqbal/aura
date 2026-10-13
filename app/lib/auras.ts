// Gradient avatars: Nova, Void, Jade, Bloom, Silk and Flare, recreated as SVG from Oreo UI's
// Agentic UI Library (free community file), which credits them as modified from Nikita Chistio's
// work under CC BY 4.0. People get one picked from their name, so the same person always looks the
// same; Aura wears the one the person picks. Drawn as SVG strings so they render on iOS, Android
// and web alike.

export type AvatarKey = "flare" | "nova" | "void" | "jade" | "bloom" | "silk";
export const AVATARS: { key: AvatarKey; label: string; line: string }[] = [
  { key: "flare", label: "Flare", line: "Warm orange. Aura's own." },
  { key: "nova", label: "Nova", line: "Hot pink into lavender." },
  { key: "void", label: "Void", line: "Deep blue with a band of light." },
  { key: "jade", label: "Jade", line: "Soft mint, easy on the eyes." },
  { key: "bloom", label: "Bloom", line: "A pink swirl." },
  { key: "silk", label: "Silk", line: "Cream and pearl." },
];

type Stop = [number, string, number?];
const stops = (s: Stop[]) => s.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join("");
const rg = (id: string, cx: number, cy: number, r: number, s: Stop[]) => `<radialGradient id="${id}" cx="${cx}%" cy="${cy}%" r="${r}%">${stops(s)}</radialGradient>`;
const lg = (id: string, s: Stop[], x2 = 0, y2 = 1) => `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops(s)}</linearGradient>`;
const rim = (id: string, color: string, a: number, from = 0.78) => rg(id, 50, 50, 50, [[0, color, 0], [from, color, 0], [1, color, a]]);

const ART: Record<AvatarKey, (i: string) => string> = {
  nova: (i) => `<defs>${lg("n" + i, [[0, "#FF5FAE"], [0.42, "#FFC2DC"], [0.6, "#FFF3F6"], [0.8, "#E4DCF8"], [1, "#7E83EE"]])}${rg("nm" + i, 50, 50, 50, [[0, "#F2007C"], [0.5, "#F5168A", 0.85], [1, "#F5168A", 0]])}${rg("nr" + i, 50, 36, 66, [[0, "#8D90F2", 0], [0.72, "#8D90F2", 0], [1, "#7F84EE", 0.9]])}</defs>
    <rect width="100" height="100" fill="url(#n${i})"/><ellipse cx="50" cy="22" rx="58" ry="40" fill="url(#nm${i})"/><circle cx="50" cy="50" r="50" fill="url(#nr${i})"/>`,
  void: (i) => `<defs>${rg("v" + i, 50, 50, 56, [[0, "#3448E2"], [0.5, "#1E2AA8"], [0.82, "#0E1466"], [1, "#050838"]])}${rg("vh" + i, 50, 50, 50, [[0, "#5E8CFF", 0.75], [1, "#4C6CFF", 0]])}${rg("vg" + i, 50, 50, 50, [[0, "#8FD0FF"], [0.55, "#77BDFF"], [0.8, "#5A95FF", 0.6], [1, "#4F7DFF", 0]])}</defs>
    <rect width="100" height="100" fill="url(#v${i})"/><ellipse cx="50" cy="50" rx="46" ry="30" fill="url(#vh${i})"/><ellipse cx="50" cy="50" rx="36" ry="15" fill="url(#vg${i})"/>`,
  jade: (i) => `<defs>${lg("j" + i, [[0, "#6CD6B3"], [0.45, "#8EE2C5"], [0.75, "#D3F3D6"], [1, "#BDEBD3"]])}${rg("jg" + i, 50, 50, 50, [[0, "#F6FCE6"], [0.6, "#EAF8DD", 0.7], [1, "#EAF8DD", 0]])}${rim("jr" + i, "#A8E8CF", 0.85, 0.8)}</defs>
    <rect width="100" height="100" fill="url(#j${i})"/><ellipse cx="50" cy="74" rx="40" ry="22" fill="url(#jg${i})"/><circle cx="50" cy="50" r="50" fill="url(#jr${i})"/>`,
  bloom: (i) => `<defs>${rg("b" + i, 50, 50, 55, [[0, "#F98BC1"], [0.75, "#F7A2CA"], [1, "#FFD9EA"]])}${rg("bh" + i, 50, 50, 50, [[0, "#EF3F97"], [0.55, "#F155A3", 0.8], [1, "#F155A3", 0]])}${rg("bw" + i, 50, 50, 50, [[0, "#FFE9F2"], [0.55, "#FFD3E5", 0.75], [1, "#FFD3E5", 0]])}${rim("br" + i, "#FFE0EE", 0.9, 0.72)}</defs>
    <rect width="100" height="100" fill="url(#b${i})"/><circle cx="26" cy="38" r="36" fill="url(#bh${i})"/><circle cx="74" cy="66" r="36" fill="url(#bh${i})"/>
    <ellipse cx="52" cy="50" rx="66" ry="17" transform="rotate(-60 52 50)" fill="url(#bw${i})"/><circle cx="50" cy="50" r="50" fill="url(#br${i})"/>`,
  silk: (i) => `<defs>${rg("s" + i, 46, 34, 70, [[0, "#FFFBE1"], [0.35, "#FCF0D2"], [0.65, "#F1DCC8"], [0.9, "#DCD0D3"], [1, "#CFCBD3"]])}${rim("sr" + i, "#D2D3D6", 0.9, 0.86)}</defs>
    <rect width="100" height="100" fill="url(#s${i})"/><circle cx="50" cy="50" r="50" fill="url(#sr${i})"/>`,
  flare: (i) => `<defs>${lg("f" + i, [[0, "#FFDDB8"], [0.4, "#FFBE80"], [1, "#FF9A50"]], 0.3, 1)}${rg("fh" + i, 50, 50, 50, [[0, "#FF6A1C"], [0.45, "#FF7C2C", 0.85], [1, "#FF8A3A", 0]])}${rg("ft" + i, 50, 50, 50, [[0, "#FFE6C8", 0.9], [1, "#FFE6C8", 0]])}${rim("fr" + i, "#FFD3AA", 0.7, 0.8)}</defs>
    <rect width="100" height="100" fill="url(#f${i})"/><ellipse cx="30" cy="26" rx="34" ry="28" fill="url(#ft${i})"/><ellipse cx="60" cy="70" rx="44" ry="36" fill="url(#fh${i})"/><circle cx="50" cy="50" r="50" fill="url(#fr${i})"/>`,
};

export function avatarSvg(key: AvatarKey, id: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${(ART[key] || ART.flare)(id)}</svg>`;
}

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export const personKey = (name: string): AvatarKey => AVATARS[hash(String(name || "?").trim().toLowerCase()) % AVATARS.length].key;
export const personSvg = (name: string, id: string) => avatarSvg(personKey(name), id);

export type AuraLook = { avatar: AvatarKey };
export const DEFAULT_LOOK: AuraLook = { avatar: "flare" };
export const avatarLabel = (key: string) => AVATARS.find((a) => a.key === key)?.label || "Flare";
// Looks saved before these avatars map onto the closest one.
const LEGACY: Record<string, AvatarKey> = {
  ember: "flare", clay: "flare", sun: "silk", dune: "silk", moss: "jade", sea: "jade", tide: "void", plum: "nova", bloom: "bloom",
  vermilion: "flare", apricot: "flare", butter: "silk", sage: "jade", mint: "jade", aqua: "jade", sky: "void", lilac: "nova", rose: "bloom", ink: "void",
};
export function normalizeLook(x: any): AuraLook {
  const v = x && typeof x === "object" ? x : {};
  if (AVATARS.some((a) => a.key === v.avatar)) return { avatar: v.avatar };
  return { avatar: LEGACY[v.palette] || LEGACY[v.color] || DEFAULT_LOOK.avatar };
}
