// Aura's character system, drawn as SVG strings so the same art renders on iOS, Android and web.
// People get soft gradient spheres with small faces: friendly and recognizable at a glance, and
// never a guess about anyone's gender or ethnicity from their name. Aura itself is a scalloped
// sun with a face that each person can dress up: color, texture, expression, accessory, backdrop.

const INK = "#0D0E12";

// ---------- palette ----------
export type Swatch = { key: string; label: string; light: string; base: string; deep: string };
export const SWATCHES: Swatch[] = [
  { key: "vermilion", label: "Vermilion", light: "#FFB08A", base: "#FF5A1F", deep: "#D43A08" },
  { key: "apricot", label: "Apricot", light: "#FFE0C7", base: "#FFB27D", deep: "#F08A4B" },
  { key: "butter", label: "Butter", light: "#FFF4C2", base: "#FFDA6B", deep: "#F0B634" },
  { key: "mint", label: "Mint", light: "#DDF7E8", base: "#8FDDB5", deep: "#4DB886" },
  { key: "sky", label: "Sky", light: "#DDEEFF", base: "#93C6FA", deep: "#4F98EC" },
  { key: "lilac", label: "Lilac", light: "#EEE6FF", base: "#C3AEFA", deep: "#8D6BEB" },
  { key: "rose", label: "Rose", light: "#FFE3EB", base: "#FFA8C0", deep: "#EE7096" },
  { key: "sage", label: "Sage", light: "#EAF2DE", base: "#BCD69A", deep: "#86AE5C" },
  { key: "aqua", label: "Aqua", light: "#DDF6F6", base: "#8EDBDD", deep: "#43B4BA" },
  { key: "ink", label: "Ink", light: "#5A5E6B", base: "#262832", deep: "#0D0E12" },
];
const PEOPLE = SWATCHES.filter((s) => s.key !== "vermilion" && s.key !== "ink");
export const swatch = (key: string) => SWATCHES.find((s) => s.key === key) || SWATCHES[0];

// ---------- deterministic seed ----------
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const pick = <T,>(arr: T[], n: number) => arr[n % arr.length];

// ---------- faces ----------
export type Eyes = "dot" | "happy" | "wink" | "sleepy";
export type Mouth = "smile" | "grin" | "o" | "smirk" | "calm";
export type Expression = "happy" | "grin" | "calm" | "wink" | "wow";
export const EXPRESSIONS: { key: Expression; label: string; eyes: Eyes; mouth: Mouth }[] = [
  { key: "happy", label: "Happy", eyes: "dot", mouth: "smile" },
  { key: "grin", label: "Grin", eyes: "happy", mouth: "grin" },
  { key: "calm", label: "Calm", eyes: "sleepy", mouth: "calm" },
  { key: "wink", label: "Wink", eyes: "wink", mouth: "smirk" },
  { key: "wow", label: "Wow", eyes: "dot", mouth: "o" },
];

// A face drawn on a 100 unit grid centered on (cx, cy); `s` scales it.
function face(cx: number, cy: number, s: number, eyes: Eyes, mouth: Mouth, cheeks: boolean, ink = INK, glint = true): string {
  const ex = 9.5 * s, ey = cy - 2 * s, my = cy + 8.5 * s, sw = 3 * s;
  const L = cx - ex, R = cx + ex;
  const dot = (x: number) => `<ellipse cx="${x}" cy="${ey}" rx="${3.3 * s}" ry="${4.4 * s}" fill="${ink}"/>` +
    (glint ? `<circle cx="${x + 1.1 * s}" cy="${ey - 1.5 * s}" r="${1.05 * s}" fill="#fff" opacity="0.9"/>` : "");
  const arc = (x: number) => `<path d="M${x - 4.2 * s} ${ey + 1.4 * s} Q${x} ${ey - 4.4 * s} ${x + 4.2 * s} ${ey + 1.4 * s}" fill="none" stroke="${ink}" stroke-width="${sw}" stroke-linecap="round"/>`;
  const lid = (x: number) => `<path d="M${x - 4.2 * s} ${ey} Q${x} ${ey + 3.6 * s} ${x + 4.2 * s} ${ey}" fill="none" stroke="${ink}" stroke-width="${sw}" stroke-linecap="round"/>`;
  let e = "";
  if (eyes === "dot") e = dot(L) + dot(R);
  else if (eyes === "happy") e = arc(L) + arc(R);
  else if (eyes === "wink") e = arc(L) + dot(R);
  else e = lid(L) + lid(R);
  let m = "";
  if (mouth === "smile") m = `<path d="M${cx - 6.5 * s} ${my - 1 * s} Q${cx} ${my + 5.5 * s} ${cx + 6.5 * s} ${my - 1 * s}" fill="none" stroke="${ink}" stroke-width="${sw}" stroke-linecap="round"/>`;
  else if (mouth === "grin") m = `<path d="M${cx - 7.5 * s} ${my - 2 * s} Q${cx} ${my - 1 * s} ${cx + 7.5 * s} ${my - 2 * s} Q${cx + 6 * s} ${my + 7.5 * s} ${cx} ${my + 7.5 * s} Q${cx - 6 * s} ${my + 7.5 * s} ${cx - 7.5 * s} ${my - 2 * s} Z" fill="${ink}"/>` +
    `<path d="M${cx - 3.6 * s} ${my + 5.4 * s} Q${cx} ${my + 2.4 * s} ${cx + 3.6 * s} ${my + 5.4 * s} Q${cx} ${my + 7.2 * s} ${cx - 3.6 * s} ${my + 5.4 * s} Z" fill="#FF7A8A"/>`;
  else if (mouth === "o") m = `<ellipse cx="${cx}" cy="${my + 1.5 * s}" rx="${3.2 * s}" ry="${3.9 * s}" fill="${ink}"/>`;
  else if (mouth === "smirk") m = `<path d="M${cx - 5 * s} ${my} Q${cx + 1 * s} ${my + 4.5 * s} ${cx + 6.5 * s} ${my - 2.5 * s}" fill="none" stroke="${ink}" stroke-width="${sw}" stroke-linecap="round"/>`;
  else m = `<path d="M${cx - 4.5 * s} ${my + 0.5 * s} Q${cx} ${my + 3 * s} ${cx + 4.5 * s} ${my + 0.5 * s}" fill="none" stroke="${ink}" stroke-width="${sw}" stroke-linecap="round"/>`;
  const ch = cheeks ? `<ellipse cx="${L - 4.5 * s}" cy="${my - 1 * s}" rx="${4.8 * s}" ry="${3 * s}" fill="#FF5A7A" opacity="0.28"/><ellipse cx="${R + 4.5 * s}" cy="${my - 1 * s}" rx="${4.8 * s}" ry="${3 * s}" fill="#FF5A7A" opacity="0.28"/>` : "";
  return ch + e + m;
}

// ---------- people ----------
export type PersonLook = { swatch: Swatch; eyes: Eyes; mouth: Mouth; cheeks: boolean; dx: number };
export function personLook(name: string): PersonLook {
  const h = hash(String(name || "?").trim().toLowerCase());
  const exp = pick(["dot", "dot", "happy", "dot", "wink", "sleepy"] as Eyes[], h >>> 4);
  const mouth = pick(["smile", "grin", "smile", "calm", "o", "smirk", "smile"] as Mouth[], h >>> 8);
  return { swatch: pick(PEOPLE, h), eyes: exp, mouth: exp === "sleepy" ? "calm" : mouth, cheeks: ((h >>> 12) & 3) !== 0, dx: pick([-3, 0, 0, 3], h >>> 15) };
}

export function personSvg(name: string, id: string, opts: { party?: boolean; mono?: boolean } = {}): string {
  const k = personLook(name);
  const sw = opts.mono ? { ...k.swatch, light: "#F4F5F7", base: "#E4E6EB", deep: "#C9CCD4" } : k.swatch;
  // viewBox leaves headroom above the sphere for the party hat, so the hat never gets clipped
  const vb = opts.party ? "0 -26 100 126" : "0 0 100 100";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">
  <defs>
    <radialGradient id="b${id}" cx="34%" cy="28%" r="78%"><stop offset="0" stop-color="${sw.light}"/><stop offset="0.55" stop-color="${sw.base}"/><stop offset="1" stop-color="${sw.deep}"/></radialGradient>
    <radialGradient id="h${id}" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity="0.85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  </defs>
  <circle cx="50" cy="50" r="50" fill="url(#b${id})"/>
  <ellipse cx="33" cy="24" rx="20" ry="12" fill="url(#h${id})" transform="rotate(-24 33 24)"/>
  ${face(50 + k.dx, 53, 1.3, k.eyes, k.mouth, k.cheeks)}
  ${opts.party ? partyHat(id, 62, 6, 1, 18) : ""}
</svg>`;
}

// ---------- Aura ----------
export type Texture = "glossy" | "matte" | "jelly" | "chrome";
export type Accessory = "none" | "party" | "cap" | "beanie" | "crown" | "cowboy" | "headphones" | "shades" | "flower";
export type Backdrop = "none" | "tint" | "sunset" | "dusk" | "meadow" | "ink";
export type AuraLook = { color: string; texture: Texture; expression: Expression; accessory: Accessory; backdrop: Backdrop };
export const DEFAULT_LOOK: AuraLook = { color: "vermilion", texture: "glossy", expression: "happy", accessory: "none", backdrop: "none" };

export const TEXTURES: { key: Texture; label: string }[] = [
  { key: "glossy", label: "Glossy" }, { key: "jelly", label: "Jelly" }, { key: "matte", label: "Matte" }, { key: "chrome", label: "Chrome" },
];
export const ACCESSORIES: { key: Accessory; label: string }[] = [
  { key: "none", label: "None" }, { key: "cowboy", label: "Cowboy hat" }, { key: "party", label: "Party hat" }, { key: "cap", label: "Cap" },
  { key: "crown", label: "Crown" }, { key: "beanie", label: "Beanie" }, { key: "headphones", label: "Headphones" }, { key: "shades", label: "Shades" }, { key: "flower", label: "Flower" },
];
export const BACKDROPS: { key: Backdrop; label: string }[] = [
  { key: "none", label: "None" }, { key: "tint", label: "Tint" }, { key: "sunset", label: "Sunset" }, { key: "dusk", label: "Dusk" }, { key: "meadow", label: "Meadow" }, { key: "ink", label: "Night" },
];

export function normalizeLook(x: any): AuraLook {
  const v = x && typeof x === "object" ? x : {};
  return {
    color: SWATCHES.some((s) => s.key === v.color) ? v.color : DEFAULT_LOOK.color,
    texture: TEXTURES.some((s) => s.key === v.texture) ? v.texture : DEFAULT_LOOK.texture,
    expression: EXPRESSIONS.some((s) => s.key === v.expression) ? v.expression : DEFAULT_LOOK.expression,
    accessory: ACCESSORIES.some((s) => s.key === v.accessory) ? v.accessory : DEFAULT_LOOK.accessory,
    backdrop: BACKDROPS.some((s) => s.key === v.backdrop) ? v.backdrop : DEFAULT_LOOK.backdrop,
  };
}

// The silhouette: a circle with seven soft lobes, like light radiating. Polar r(t) = R + a cos(7t).
function sunPath(cx: number, cy: number, R: number, a: number, lobes = 7): string {
  const pts: string[] = [];
  const n = 144;
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2 - Math.PI / 2;
    const r = R + a * Math.cos(lobes * t);
    pts.push(`${(cx + r * Math.cos(t)).toFixed(2)} ${(cy + r * Math.sin(t)).toFixed(2)}`);
  }
  return "M" + pts.join(" L") + " Z";
}

const BACKDROP_FILL: Record<Exclude<Backdrop, "none" | "tint">, [string, string, string]> = {
  sunset: ["#FFD6A8", "#FF9A62", "#F2557A"],
  dusk: ["#E9D9FF", "#B9A3F2", "#7A86E8"],
  meadow: ["#F3F7C8", "#B9E2A6", "#6CC3A4"],
  ink: ["#3A3D48", "#1B1D24", "#0D0E12"],
};

export function auraSvg(lookIn: Partial<AuraLook> | null | undefined, id: string, opts: { backdrop?: boolean } = {}): string {
  const look = normalizeLook(lookIn);
  const sw = swatch(look.color);
  const exp = EXPRESSIONS.find((e) => e.key === look.expression) || EXPRESSIONS[0];
  const cx = 60, cy = 66, R = 39;
  const body = sunPath(cx, cy, R, 2.8);
  const ink = look.color === "ink" ? "#FEFEFF" : INK;
  let defs = "", fill = "", over = "";

  if (look.texture === "glossy") {
    defs = `<radialGradient id="b${id}" cx="36%" cy="30%" r="80%"><stop offset="0" stop-color="${sw.light}"/><stop offset="0.5" stop-color="${sw.base}"/><stop offset="1" stop-color="${sw.deep}"/></radialGradient>
      <radialGradient id="h${id}" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity="0.9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`;
    fill = `url(#b${id})`;
    over = `<ellipse cx="${cx - 15}" cy="${cy - 22}" rx="17" ry="9" fill="url(#h${id})" transform="rotate(-28 ${cx - 15} ${cy - 22})"/><circle cx="${cx + 22}" cy="${cy + 14}" r="2.2" fill="#fff" opacity="0.55"/>`;
  } else if (look.texture === "matte") {
    defs = `<linearGradient id="b${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sw.base}"/><stop offset="1" stop-color="${sw.deep}"/></linearGradient>`;
    fill = `url(#b${id})`;
  } else if (look.texture === "jelly") {
    defs = `<radialGradient id="b${id}" cx="50%" cy="62%" r="70%"><stop offset="0" stop-color="${sw.light}"/><stop offset="0.7" stop-color="${sw.base}"/><stop offset="1" stop-color="${sw.deep}"/></radialGradient>
      <linearGradient id="h${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`;
    fill = `url(#b${id})`;
    over = `<path d="${sunPath(cx, cy, R - 4, 2.4)}" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="2.2"/>` +
      `<path d="M${cx - 27} ${cy - 10} Q${cx - 24} ${cy - 29} ${cx - 6} ${cy - 32}" fill="none" stroke="url(#h${id})" stroke-width="6" stroke-linecap="round"/>`;
  } else {
    defs = `<linearGradient id="b${id}" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="0.28" stop-color="${sw.light}"/><stop offset="0.5" stop-color="${sw.deep}"/><stop offset="0.62" stop-color="${sw.base}"/><stop offset="0.85" stop-color="${sw.light}"/><stop offset="1" stop-color="${sw.base}"/></linearGradient>`;
    fill = `url(#b${id})`;
    over = `<path d="${body}" fill="none" stroke="${sw.deep}" stroke-opacity="0.35" stroke-width="1.5"/>`;
  }

  let back = "";
  if (opts.backdrop && look.backdrop !== "none") {
    if (look.backdrop === "tint") {
      defs += `<radialGradient id="k${id}" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="${sw.light}"/></radialGradient>`;
    } else {
      const [a, b, c2] = BACKDROP_FILL[look.backdrop];
      defs += `<radialGradient id="k${id}" cx="30%" cy="25%" r="95%"><stop offset="0" stop-color="${a}"/><stop offset="0.55" stop-color="${b}"/><stop offset="1" stop-color="${c2}"/></radialGradient>`;
    }
    back = `<circle cx="60" cy="60" r="60" fill="url(#k${id})"/>`;
  }
  const shadow = `<ellipse cx="${cx}" cy="${cy + R + 6}" rx="${R * 0.62}" ry="3.4" fill="${INK}" opacity="${opts.backdrop && look.backdrop !== "none" ? 0.12 : 0.08}"/>`;
  const shades = look.accessory === "shades";
  const faceSvg = shades
    ? face(cx, cy + 2, 1.15, "dot", exp.mouth === "o" ? "o" : "smile", false, ink, false)
    : face(cx, cy + 2, 1.15, exp.eyes, exp.mouth, look.texture !== "chrome" && look.color !== "ink", ink);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs>${defs}</defs>${back}${shadow}
  <path d="${body}" fill="${fill}"/>${over}
  ${faceSvg}
  ${accessory(look.accessory, id, cx, cy, R)}
</svg>`;
}

// ---------- accessories (drawn for a head centered at cx, cy with radius R) ----------
function partyHat(id: string, x: number, y: number, s: number, tilt: number): string {
  return `<g transform="translate(${x} ${y}) rotate(${tilt}) scale(${s})">
    <defs><linearGradient id="p${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7C6CF0"/><stop offset="1" stop-color="#5A49D6"/></linearGradient></defs>
    <path d="M-14 22 L0 -16 L14 22 Q0 27 -14 22 Z" fill="url(#p${id})"/>
    <path d="M-9.2 9 L-4.6 -3.4 L-2 -2 L-6.6 10.4 Z M2.6 13.6 L7.2 1.2 L9.6 7.6 L5.4 18 Z" fill="#FFDA6B"/>
    <path d="M-14 22 Q0 27 14 22" fill="none" stroke="#FFDA6B" stroke-width="3" stroke-linecap="round"/>
    <circle cx="0" cy="-17" r="5" fill="#FF6FA0"/><circle cx="-1.5" cy="-18.6" r="1.6" fill="#fff" opacity="0.7"/>
  </g>`;
}

function accessory(a: Accessory, id: string, cx: number, cy: number, R: number): string {
  const top = cy - R;
  switch (a) {
    case "party":
      return partyHat(id, cx + 14, top - 6, 1.05, 16);
    case "cap":
      return `<defs><linearGradient id="c${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4F8DF5"/><stop offset="1" stop-color="#2F62D6"/></linearGradient></defs>
        <path d="M${cx - 30} ${top + 14} Q${cx - 28} ${top - 16} ${cx} ${top - 17} Q${cx + 28} ${top - 16} ${cx + 30} ${top + 14} Q${cx} ${top + 6} ${cx - 30} ${top + 14} Z" fill="url(#c${id})"/>
        <path d="M${cx + 8} ${top + 9} Q${cx + 34} ${top + 4} ${cx + 50} ${top + 14} Q${cx + 34} ${top + 18} ${cx + 12} ${top + 15} Z" fill="#2350B8"/>
        <circle cx="${cx}" cy="${top - 16}" r="3" fill="#2350B8"/>
        <path d="M${cx - 14} ${top - 10} Q${cx - 10} ${top - 14} ${cx - 2} ${top - 15}" fill="none" stroke="#fff" stroke-opacity="0.45" stroke-width="3" stroke-linecap="round"/>`;
    case "beanie":
      return `<path d="M${cx - 31} ${top + 13} Q${cx - 30} ${top - 22} ${cx} ${top - 23} Q${cx + 30} ${top - 22} ${cx + 31} ${top + 13} Z" fill="#E8574A"/>
        <path d="M${cx - 33} ${top + 4} Q${cx} ${top - 4} ${cx + 33} ${top + 4} L${cx + 33} ${top + 15} Q${cx} ${top + 7} ${cx - 33} ${top + 15} Z" fill="#C63E33"/>
        ${[-24, -16, -8, 0, 8, 16, 24].map((d) => `<path d="M${cx + d} ${top + 3 - Math.abs(d) * 0.04} L${cx + d} ${top + 12 - Math.abs(d) * 0.04}" stroke="#A9322A" stroke-width="2" stroke-linecap="round"/>`).join("")}
        <circle cx="${cx}" cy="${top - 25}" r="8" fill="#F6EFE6"/><circle cx="${cx - 2.5}" cy="${top - 27.5}" r="2.6" fill="#fff"/>`;
    case "crown":
      return `<defs><linearGradient id="g${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE48A"/><stop offset="1" stop-color="#E8A920"/></linearGradient></defs>
        <path d="M${cx - 22} ${top + 6} L${cx - 26} ${top - 18} L${cx - 12} ${top - 6} L${cx} ${top - 24} L${cx + 12} ${top - 6} L${cx + 26} ${top - 18} L${cx + 22} ${top + 6} Q${cx} ${top + 1} ${cx - 22} ${top + 6} Z" fill="url(#g${id})" stroke="#C98A10" stroke-width="1.4" stroke-linejoin="round"/>
        <circle cx="${cx}" cy="${top - 4}" r="3.6" fill="#F2557A"/><circle cx="${cx - 13}" cy="${top}" r="2.6" fill="#4F98EC"/><circle cx="${cx + 13}" cy="${top}" r="2.6" fill="#4DB886"/>
        <circle cx="${cx - 26}" cy="${top - 19}" r="2.4" fill="#FFF4C2"/><circle cx="${cx}" cy="${top - 25}" r="2.4" fill="#FFF4C2"/><circle cx="${cx + 26}" cy="${top - 19}" r="2.4" fill="#FFF4C2"/>`;
    case "cowboy":
      return `<defs><linearGradient id="w${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B9773E"/><stop offset="1" stop-color="#8A5226"/></linearGradient></defs>
        <path d="M${cx - 20} ${top + 4} Q${cx - 22} ${top - 26} ${cx - 8} ${top - 24} Q${cx} ${top - 16} ${cx + 8} ${top - 24} Q${cx + 22} ${top - 26} ${cx + 20} ${top + 4} Z" fill="url(#w${id})"/>
        <path d="M${cx - 19} ${top - 2} Q${cx} ${top - 6} ${cx + 19} ${top - 2} L${cx + 19.5} ${top + 4} Q${cx} ${top} ${cx - 19.5} ${top + 4} Z" fill="#4A2A12"/>
        <path d="M${cx - 46} ${top - 2} Q${cx - 40} ${top + 12} ${cx} ${top + 11} Q${cx + 40} ${top + 12} ${cx + 46} ${top - 2} Q${cx + 38} ${top + 4} ${cx} ${top + 3} Q${cx - 38} ${top + 4} ${cx - 46} ${top - 2} Z" fill="#9C5F2E"/>`;
    case "headphones":
      return `<path d="M${cx - 37} ${cy - 2} Q${cx - 40} ${top - 18} ${cx} ${top - 19} Q${cx + 40} ${top - 18} ${cx + 37} ${cy - 2}" fill="none" stroke="#262832" stroke-width="6" stroke-linecap="round"/>
        <rect x="${cx - 47}" y="${cy - 12}" width="15" height="26" rx="7.5" fill="#262832"/><rect x="${cx + 32}" y="${cy - 12}" width="15" height="26" rx="7.5" fill="#262832"/>
        <rect x="${cx - 44}" y="${cy - 8}" width="5" height="18" rx="2.5" fill="#FF5A1F"/><rect x="${cx + 39}" y="${cy - 8}" width="5" height="18" rx="2.5" fill="#FF5A1F"/>`;
    case "shades": {
      const ey = cy - 0.3, ex = 11;
      return `<path d="M${cx - ex - 10} ${ey - 6} H${cx - ex + 10} Q${cx - ex + 10} ${ey + 8} ${cx - ex} ${ey + 8} Q${cx - ex - 10} ${ey + 8} ${cx - ex - 10} ${ey - 6} Z" fill="#14151B"/>
        <path d="M${cx + ex - 10} ${ey - 6} H${cx + ex + 10} Q${cx + ex + 10} ${ey + 8} ${cx + ex} ${ey + 8} Q${cx + ex - 10} ${ey + 8} ${cx + ex - 10} ${ey - 6} Z" fill="#14151B"/>
        <path d="M${cx - 2} ${ey - 4} H${cx + 2}" stroke="#14151B" stroke-width="3"/>
        <path d="M${cx - ex - 6} ${ey - 3} L${cx - ex - 1} ${ey - 3}" stroke="#fff" stroke-opacity="0.6" stroke-width="2.2" stroke-linecap="round"/><path d="M${cx + ex - 6} ${ey - 3} L${cx + ex - 1} ${ey - 3}" stroke="#fff" stroke-opacity="0.6" stroke-width="2.2" stroke-linecap="round"/>`;
    }
    case "flower": {
      const fx = cx + 22, fy = top + 2;
      const petals = [0, 72, 144, 216, 288].map((d) => `<ellipse cx="${fx}" cy="${fy - 7}" rx="5.4" ry="7.6" fill="#FFB3C7" transform="rotate(${d} ${fx} ${fy})"/>`).join("");
      return `<path d="M${fx - 6} ${fy + 10} Q${fx - 2} ${fy + 4} ${fx} ${fy}" stroke="#4DB886" stroke-width="2.6" fill="none" stroke-linecap="round"/>${petals}<circle cx="${fx}" cy="${fy}" r="4.6" fill="#FFDA6B"/>`;
    }
    default:
      return "";
  }
}
