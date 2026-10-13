// Everyone has an aura. People get a soft, grainy gradient picked from their name, so the same
// person always looks the same and nothing is guessed about who they are. Aura is the vermilion
// dot inside its own glow; the person picks which palette it glows in. Drawn as SVG strings so
// the same art renders on iOS, Android and web; the grain is a tiled image laid over the top.

export type Palette = { key: string; label: string; line: string; colors: [string, string, string, string] }; // base, deep, mid, light
export const PALETTES: Palette[] = [
  { key: "ember", label: "Ember", line: "Aura's own. Warm and quick.", colors: ["#FFE9DC", "#FF4F12", "#FF9A5C", "#FFD1A8"] },
  { key: "clay", label: "Clay", line: "Earthy and grounded.", colors: ["#F6E4D8", "#C2553A", "#E89A72", "#F3C9AE"] },
  { key: "bloom", label: "Bloom", line: "Soft pink, a little sweet.", colors: ["#FFE8EA", "#E5527A", "#F59AA8", "#FFD3C4"] },
  { key: "sun", label: "Sun", line: "Bright, like early light.", colors: ["#FFF4D9", "#F0A02F", "#FFCF5C", "#FFE9A8"] },
  { key: "moss", label: "Moss", line: "Green and unhurried.", colors: ["#EEF2DC", "#5E8A4A", "#B6D07E", "#E9E5B0"] },
  { key: "sea", label: "Sea", line: "Cool, clear, easy.", colors: ["#E2F2EE", "#2F8C7C", "#8CD1BE", "#D8EBD3"] },
  { key: "tide", label: "Tide", line: "Blue water over warm sand.", colors: ["#E3EEF6", "#2F6FA8", "#86C1DF", "#F2DCC6"] },
  { key: "plum", label: "Plum", line: "Deep and a little moody.", colors: ["#F4E4EE", "#8A3E70", "#D58AB4", "#F6D6CF"] },
  { key: "dune", label: "Dune", line: "Quiet neutrals.", colors: ["#F3ECE2", "#9C7A55", "#D8BE98", "#EFE0C8"] },
];
const PEOPLE = PALETTES.filter((p) => p.key !== "ember"); // vermilion stays Aura's
export const palette = (key: string) => PALETTES.find((p) => p.key === key) || PALETTES[0];

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Three soft color fields over a light base, placed by the name's hash.
const SPOTS: [number, number][] = [[18, 22], [82, 20], [80, 82], [20, 80], [50, 50], [50, 12], [12, 50], [88, 52], [50, 90]];
export function personSvg(name: string, id: string): string {
  const h = hash(String(name || "?").trim().toLowerCase());
  const [base, deep, mid, light] = PEOPLE[h % PEOPLE.length].colors;
  const g = h >>> 3;
  const a = SPOTS[g % SPOTS.length], b = SPOTS[((g >>> 4) + 3) % SPOTS.length], c = SPOTS[((g >>> 9) + 6) % SPOTS.length];
  const field = (key: string, at: [number, number], r: number, color: string) =>
    `<radialGradient id="${key}${id}" cx="${at[0]}%" cy="${at[1]}%" r="${r}%"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs>${field("a", a, 70, deep)}${field("b", b, 62, mid)}${field("c", c, 55, light)}</defs>
  <rect width="100" height="100" fill="${base}"/><rect width="100" height="100" fill="url(#c${id})"/><rect width="100" height="100" fill="url(#b${id})"/><rect width="100" height="100" fill="url(#a${id})"/></svg>`;
}

// Aura's glow alone; the dot is drawn on top by the component so it stays crisp while the glow breathes.
export function glowSvg(key: string, id: string): string {
  const [base, deep, mid, light] = palette(key).colors;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs>
    <radialGradient id="g${id}" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${deep}" stop-opacity="0.95"/><stop offset="0.38" stop-color="${mid}" stop-opacity="0.85"/><stop offset="0.72" stop-color="${light}" stop-opacity="0.6"/><stop offset="1" stop-color="${base}" stop-opacity="0"/></radialGradient>
    <radialGradient id="o${id}" cx="64%" cy="30%" r="45%"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${light}" stop-opacity="0"/></radialGradient></defs>
    <circle cx="50" cy="50" r="50" fill="url(#g${id})"/><circle cx="50" cy="50" r="50" fill="url(#o${id})" opacity="0.5"/></svg>`;
}

export type AuraLook = { palette: string };
export const DEFAULT_LOOK: AuraLook = { palette: "ember" };
// Older saved looks used color names; map them onto the nearest palette.
const LEGACY: Record<string, string> = { vermilion: "ember", apricot: "clay", rose: "bloom", butter: "sun", sage: "moss", mint: "sea", aqua: "sea", sky: "tide", lilac: "plum", ink: "dune" };
export function normalizeLook(x: any): AuraLook {
  const v = x && typeof x === "object" ? x : {};
  const key = PALETTES.some((p) => p.key === v.palette) ? v.palette : LEGACY[v.color] || DEFAULT_LOOK.palette;
  return { palette: key };
}
