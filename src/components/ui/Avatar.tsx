const PALETTES = [
  ['#c3f550', '#6ee7b7'], ['#a63cf0', '#e879f9'], ['#4f5df7', '#7fa6ff'], ['#ffc247', '#ff8a5b'], ['#5fe08c', '#2dd4bf'], ['#ff7070', '#f472b6'],
];

/** Deterministic gradient initials, so the same vendor always looks the same. */
export function Avatar({ name, size = 38 }: { name: string; size?: number }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [a, b] = PALETTES[h % PALETTES.length];
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
  return <span className="avatar" style={{ width: size, height: size, background: `linear-gradient(135deg, ${a}, ${b})` }} aria-hidden="true">{initials}</span>;
}
