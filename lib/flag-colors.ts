/**
 * Flag colours for the FreeSERP mark, keyed by ISO-3166-1 alpha-2.
 *
 * The mark is twelve spokes radiating from a centre. Cutting it into three
 * horizontal bands — five spokes on top, two through the middle, five on the
 * bottom — maps a tricolour onto it without changing the shape, so it still
 * reads as the FreeSERP logo from across a room.
 *
 * Each entry is three colours, top band to bottom band. For a flag that IS
 * three horizontal bands (India, Germany, Nigeria) they are those bands in
 * order. For anything else they are the flag's three most identifying colours,
 * ordered so the result reads as that flag at 32px — which is the only size
 * that matters, since this is a favicon-scale mark and fine detail is lost.
 *
 * Colours are the commonly published values for each flag. They are decoration,
 * not an official rendering: some states specify Pantone shades that have no
 * exact sRGB equivalent, and at this size the difference is invisible.
 */

/** Top band, middle band, bottom band. */
export type FlagPalette = readonly [string, string, string]

const W = "#FFFFFF"

export const FLAG_COLORS: Readonly<Record<string, FlagPalette>> = {
  AD: ["#10069F", "#FEDD00", "#D50032"],
  AE: ["#00732F", W, "#000000"],
  AF: ["#000000", "#D32011", "#007A36"],
  AG: ["#000000", "#0072C6", "#CE1126"],
  AL: ["#E41E20", "#000000", "#E41E20"],
  AM: ["#D90012", "#0033A0", "#F2A800"],
  AO: ["#CE1126", "#F9D616", "#000000"],
  AR: ["#74ACDF", "#F6B40E", "#74ACDF"],
  AT: ["#ED2939", W, "#ED2939"],
  AU: ["#012169", W, "#E4002B"],
  AZ: ["#00B5E2", "#EF3340", "#509E2F"],
  BA: ["#002F6C", "#FECB00", W],
  BB: ["#00267F", "#FFC726", "#00267F"],
  BD: ["#006A4E", "#F42A41", "#006A4E"],
  BE: ["#000000", "#FAE042", "#ED2939"],
  BF: ["#EF2B2D", "#FCD116", "#009E49"],
  BG: [W, "#00966E", "#D62612"],
  BH: [W, "#CE1126", "#CE1126"],
  BI: [W, "#CE1126", "#1EB53A"],
  BJ: ["#008751", "#FCD116", "#E8112D"],
  BN: ["#F7E017", W, "#000000"],
  BO: ["#D52B1E", "#F9E300", "#007A33"],
  BR: ["#009C3B", "#FFDF00", "#002776"],
  BS: ["#00778B", "#FFC72C", "#000000"],
  BT: ["#FFD520", W, "#FF4E12"],
  BW: ["#75AADB", W, "#000000"],
  BY: [W, "#D22730", "#009B3A"],
  BZ: ["#003F87", "#CE1126", "#003F87"],
  CA: ["#FF0000", W, "#FF0000"],
  CD: ["#007FFF", "#F7D618", "#CE1021"],
  CF: ["#003082", W, "#289728"],
  CG: ["#009543", "#FBDE4A", "#DC241F"],
  CH: ["#FF0000", W, "#FF0000"],
  CI: ["#F77F00", W, "#009E60"],
  CL: [W, "#0039A6", "#D52B1E"],
  CM: ["#007A5E", "#CE1126", "#FCD116"],
  CN: ["#DE2910", "#FFDE00", "#DE2910"],
  CO: ["#FCD116", "#003893", "#CE1126"],
  CR: ["#002B7F", W, "#CE1126"],
  CU: ["#002A8F", W, "#CF142B"],
  CV: [W, "#003893", "#CF2027"],
  CY: [W, "#D57800", "#4E5B31"],
  CZ: [W, "#11457E", "#D7141A"],
  DE: ["#000000", "#DD0000", "#FFCE00"],
  DJ: ["#6AB2E7", W, "#12AD2B"],
  DK: ["#C8102E", W, "#C8102E"],
  DM: ["#006B3F", "#FCD116", "#000000"],
  DO: ["#002D62", W, "#CE1126"],
  DZ: ["#006233", W, "#D21034"],
  EC: ["#FFDD00", "#0033A0", "#EF3340"],
  EE: ["#0072CE", "#000000", W],
  EG: ["#CE1126", W, "#000000"],
  ER: ["#12AD2B", "#EA0437", "#4189DD"],
  ES: ["#AA151B", "#F1BF00", "#AA151B"],
  ET: ["#078930", "#FCDD09", "#DA121A"],
  FI: [W, "#002F6C", W],
  FJ: ["#68BFE5", W, "#002868"],
  FM: ["#75B2DD", W, "#75B2DD"],
  FR: ["#002395", W, "#ED2939"],
  GA: ["#009E60", "#FCD116", "#3A75C4"],
  GB: ["#012169", W, "#C8102E"],
  GD: ["#CE1126", "#FCD116", "#007A5E"],
  GE: [W, "#FF0000", W],
  GH: ["#CE1126", "#FCD116", "#006B3F"],
  GM: ["#CE1126", "#0C1C8C", "#3A7728"],
  GN: ["#CE1126", "#FCD116", "#009460"],
  GQ: ["#3E9A00", W, "#E32118"],
  GR: ["#0D5EAF", W, "#0D5EAF"],
  GT: ["#4997D0", W, "#4997D0"],
  GW: ["#CE1126", "#FCD116", "#009E49"],
  GY: ["#009E49", "#FCD116", "#CE1126"],
  HN: ["#0073CF", W, "#0073CF"],
  HR: ["#FF0000", W, "#171796"],
  HT: ["#00209F", "#D21034", "#00209F"],
  HU: ["#CE2939", W, "#477050"],
  ID: ["#FF0000", W, W],
  IE: ["#169B62", W, "#FF883E"],
  IL: [W, "#0038B8", W],
  IN: ["#FF9933", W, "#138808"],
  IQ: ["#CE1126", W, "#000000"],
  IR: ["#239F40", W, "#DA0000"],
  IS: ["#02529C", W, "#DC1E35"],
  IT: ["#008C45", "#F4F5F0", "#CD212A"],
  JM: ["#009B3A", "#FED100", "#000000"],
  JO: ["#000000", W, "#007A3D"],
  JP: [W, "#BC002D", W],
  KE: ["#000000", "#BB0000", "#006600"],
  KG: ["#E8112D", "#FFEF00", "#E8112D"],
  KH: ["#032EA1", "#E00025", "#032EA1"],
  KI: ["#CE1126", "#FCD116", "#003F87"],
  KM: ["#FFD100", W, "#3D8E33"],
  KN: ["#009E49", "#FCD116", "#CE1126"],
  KP: ["#024FA2", W, "#ED1C27"],
  KR: [W, "#CD2E3A", "#0047A0"],
  KW: ["#007A3D", W, "#CE1126"],
  KZ: ["#00AFCA", "#FEC50C", "#00AFCA"],
  LA: ["#CE1126", "#002868", W],
  LB: ["#ED1C24", W, "#00A651"],
  LC: ["#66CCFF", W, "#000000"],
  LI: ["#002B7F", "#CE1126", "#002B7F"],
  LK: ["#8D2029", "#FFB700", "#00534E"],
  LR: ["#BF0A30", W, "#002868"],
  LS: ["#00209F", W, "#009543"],
  LT: ["#FDB913", "#006A44", "#C1272D"],
  LU: ["#ED2939", W, "#00A1DE"],
  LV: ["#9E3039", W, "#9E3039"],
  LY: ["#E70013", "#000000", "#239E46"],
  MA: ["#C1272D", "#006233", "#C1272D"],
  MC: ["#CE1126", W, W],
  MD: ["#0046AE", "#FFD200", "#CC092F"],
  ME: ["#C40308", "#D4AF3A", "#C40308"],
  MG: [W, "#FC3D32", "#007E3A"],
  MH: ["#003893", "#DD7500", W],
  MK: ["#D20000", "#FFE600", "#D20000"],
  ML: ["#14B53A", "#FCD116", "#CE1126"],
  MM: ["#FECB00", "#34B233", "#EA2839"],
  MN: ["#C4272F", "#015197", "#C4272F"],
  MR: ["#006233", "#FFC400", "#D01C1F"],
  MT: [W, "#CF142B", W],
  MU: ["#EA2839", "#1A206D", "#00A551"],
  MV: ["#D21034", "#00843D", "#D21034"],
  MW: ["#000000", "#CE1126", "#339E35"],
  MX: ["#006847", W, "#CE1126"],
  MY: ["#CC0001", W, "#010066"],
  MZ: ["#009A44", W, "#FFD100"],
  NA: ["#003580", "#FFCE00", "#009543"],
  NE: ["#E05206", W, "#0DB02B"],
  NG: ["#008751", W, "#008751"],
  NI: ["#0067C6", W, "#0067C6"],
  NL: ["#AE1C28", W, "#21468B"],
  NO: ["#BA0C2F", W, "#00205B"],
  NP: ["#DC143C", "#003893", "#DC143C"],
  NZ: ["#00247D", W, "#CC142B"],
  OM: [W, "#DB161B", "#008000"],
  PA: [W, "#005293", "#D21034"],
  PE: ["#D91023", W, "#D91023"],
  PG: ["#000000", "#CE1126", "#FCD116"],
  PH: ["#0038A8", W, "#CE1126"],
  PK: ["#01411C", W, "#01411C"],
  PL: [W, W, "#DC143C"],
  PT: ["#046A38", "#FFE900", "#DA291C"],
  PY: ["#D52B1E", W, "#0038A8"],
  QA: [W, "#8A1538", "#8A1538"],
  RO: ["#002B7F", "#FCD116", "#CE1126"],
  RS: ["#C6363C", "#0C4076", W],
  RU: [W, "#0039A6", "#D52B1E"],
  RW: ["#00A1DE", "#FAD201", "#20603D"],
  SA: ["#006C35", W, "#006C35"],
  SB: ["#0051BA", "#FCD116", "#215B33"],
  SC: ["#003F87", "#FCD856", "#D62828"],
  SD: ["#D21034", W, "#000000"],
  SE: ["#006AA7", "#FECC00", "#006AA7"],
  SG: ["#ED2939", W, W],
  SI: [W, "#0000FF", "#FF0000"],
  SK: [W, "#0B4EA2", "#EE1C25"],
  SL: ["#1EB53A", W, "#0072C6"],
  SM: [W, "#5EB6E4", W],
  SN: ["#00853F", "#FDEF42", "#E31B23"],
  SO: ["#4189DD", W, "#4189DD"],
  SR: ["#377E3F", "#B40A2D", "#377E3F"],
  SS: ["#000000", "#DA121A", "#078930"],
  ST: ["#12AD2B", "#FFCE00", "#D21034"],
  SV: ["#0F47AF", W, "#0F47AF"],
  SY: ["#CE1126", W, "#000000"],
  SZ: ["#3E5EB9", "#FFD900", "#B10C0C"],
  TD: ["#002664", "#FECB00", "#C60C30"],
  TG: ["#006A4E", "#FFCE00", "#D21034"],
  TH: ["#A51931", "#2D2A4A", "#A51931"],
  TJ: ["#CC0000", W, "#006600"],
  TL: ["#DC241F", "#FFC726", "#000000"],
  TM: ["#28AE66", W, "#28AE66"],
  TN: ["#E70013", W, "#E70013"],
  TO: ["#C10000", W, "#C10000"],
  TR: ["#E30A17", W, "#E30A17"],
  TT: ["#DA1A35", W, "#000000"],
  TW: ["#000095", W, "#FE0000"],
  TZ: ["#1EB53A", "#FCD116", "#00A3DD"],
  UA: ["#0057B7", "#0057B7", "#FFDD00"],
  UG: ["#000000", "#FCDC04", "#D90000"],
  US: ["#B31942", W, "#0A3161"],
  UY: [W, "#0038A8", W],
  UZ: ["#0099B5", W, "#1EB53A"],
  VA: ["#FFE000", W, W],
  VC: ["#0058AA", "#FCD116", "#009E60"],
  VE: ["#FFCC00", "#00247D", "#CF142B"],
  VN: ["#DA251D", "#FFFF00", "#DA251D"],
  VU: ["#D21034", "#FDCE12", "#009543"],
  WS: ["#CE1126", W, "#002B7F"],
  XK: ["#244AA5", "#D0A650", "#244AA5"],
  YE: ["#CE1126", W, "#000000"],
  ZA: ["#007A4D", "#FFB612", "#002395"],
  ZM: ["#198A00", "#EF7D00", "#DE2010"],
  ZW: ["#319208", "#FFD200", "#D40000"],
}

// ── Contrast ────────────────────────────────────────────────────────────────

function toRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "")
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

const toHex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0")

/** Relative luminance, WCAG's definition. Used only to pick a lightening target. */
function luminance(hex: string): number {
  const channel = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const [r, g, b] = toRgb(hex)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/**
 * How different two colours look, by "redmean" distance.
 *
 * Deliberately NOT the WCAG contrast ratio. That measures luminance alone, and
 * luminance cannot tell saturated green from saturated blue — India's #138808
 * against this blue tile scores as low contrast and would be lightened into a
 * pale mint, inventing a colour that is not on the flag. The eye separates
 * those two instantly, because they differ in hue rather than brightness.
 *
 * Redmean is a cheap approximation of perceived difference that accounts for
 * both. It is the right question here: not "is this text readable" but "can you
 * see this shape against that background".
 */
function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = toRgb(a)
  const [r2, g2, b2] = toRgb(b)
  const rmean = (r1 + r2) / 2
  const dr = r1 - r2
  const dg = g1 - g2
  const db = b1 - b2
  return Math.sqrt(
    (2 + rmean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rmean) / 256) * db * db,
  )
}

/** Mix `hex` toward `target` by `amount` (0-1). */
function mix(hex: string, target: string, amount: number): string {
  const [r1, g1, b1] = toRgb(hex)
  const [r2, g2, b2] = toRgb(target)
  return `#${toHex(r1 + (r2 - r1) * amount)}${toHex(g1 + (g2 - g1) * amount)}${toHex(b1 + (b2 - b1) * amount)}`
}

/**
 * The mark sits on a blue tile, and plenty of flags are blue.
 *
 * Ukraine, Somalia, Micronesia and Greece would otherwise paint blue spokes
 * onto a blue square and disappear. Rather than dropping those countries or
 * repainting the tile, such a colour is nudged toward white (or black, on a
 * light tile) only as far as it takes to become visible — which preserves the
 * hue, so Ukraine still reads as blue-and-yellow rather than as some invented
 * palette.
 *
 * The threshold is low on purpose. Anything higher starts "correcting" colours
 * that were always perfectly visible, and every such correction is a flag drawn
 * in the wrong colours.
 */
const MIN_DISTANCE = 150

export function ensureContrast(color: string, against: string): string {
  if (colorDistance(color, against) >= MIN_DISTANCE) return color
  const target = luminance(against) > 0.4 ? "#000000" : "#FFFFFF"
  for (let amount = 0.15; amount <= 0.9; amount += 0.15) {
    const candidate = mix(color, target, amount)
    if (colorDistance(candidate, against) >= MIN_DISTANCE) return candidate
  }
  return target
}

/**
 * The palette for a country, or null to use the brand colours.
 *
 * Null is the honest answer for an unknown or absent country code: the visitor
 * gets the normal logo, which is what every visitor got before this existed.
 */
export function paletteFor(country: string | undefined | null, tile: string): FlagPalette | null {
  if (!country) return null
  const palette = FLAG_COLORS[country.toUpperCase()]
  if (!palette) return null
  return [
    ensureContrast(palette[0], tile),
    ensureContrast(palette[1], tile),
    ensureContrast(palette[2], tile),
  ] as const
}
