// DOM-free port of the site's search (trace-logos js/search.js + js/utils.js):
// RU<->EN keyboard layout switch, stop words, scoreQuery ranking, Levenshtein fuzzy tokens.
// Additions: ё/е folding; nameEn, tags and slug are part of the haystack.
import type { Logo, SearchOptions } from './types.js';

export const STOP_WORDS: ReadonlySet<string> = new Set(['логотип', 'лого', 'logo', 'logotype', 'логотипы']);

const RU = 'йцукенгшщзхъфывапролджэячсмитьбю'.split('');
const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.".split('');
const RU_TO_EN = new Map(RU.map((c, i) => [c, EN[i]!]));
const EN_TO_RU = new Map(EN.map((c, i) => [c, RU[i]!]));

/** Same keys typed in the other layout: "ntktuhfv" <-> "телеграм". */
export function switchLayout(s: string): string {
  const map = /[а-яё]/i.test(s) ? RU_TO_EN : EN_TO_RU;
  return [...s].map((c) => map.get(c.toLowerCase()) ?? c).join('');
}

/** Lowercase, ё->е, drop "-" and "/" (т-банк == тбанк). */
export function normalizeText(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е').replace(/[-/]/g, '');
}

export function tokenizeQuery(q: string): string[] {
  return normalizeText(q.trim()).split(/\s+/).filter((w) => w && !STOP_WORDS.has(w));
}

function dedupeChars(s: string): string {
  return s.replace(/(.)\1+/g, '$1');
}

function searchCandidates(word: string): string[] {
  const set = new Set([word, normalizeText(switchLayout(word))]);
  for (const w of [...set]) {
    const d = dedupeChars(w);
    if (d.length >= 3) set.add(d);
  }
  return [...set];
}

export function levenshtein(a: string, b: string, threshold: number): number {
  if (Math.abs(a.length - b.length) > threshold) return threshold + 1;
  if (a.length > b.length) [a, b] = [b, a];
  const prev: number[] = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 1; j <= b.length; j++) {
    let corner = prev[0]!;
    prev[0] = j;
    let rowMin = j;
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const val = Math.min(prev[i]! + 1, prev[i - 1]! + 1, corner + cost);
      corner = prev[i]!;
      prev[i] = val;
      if (val < rowMin) rowMin = val;
    }
    if (rowMin > threshold) return threshold + 1;
  }
  return prev[a.length]!;
}

function hasNonTextChars(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c > 0x4ff && !(c >= 0x80 && c <= 0x24f)) return true;
  }
  return false;
}

/** Edit distance (0..2) if word and token are a fuzzy match, else -1. Both need 3+ chars. */
export function fuzzyMatchToken(word: string, token: string): number {
  if (word.length < 3 || token.length < 3 || hasNonTextChars(token)) return -1;
  const threshold = word.length <= 4 ? 1 : 2;
  const dist = levenshtein(word, token, threshold);
  return dist <= threshold ? dist : -1;
}

function scoreCandidates(candidates: string[], haystack: string, tokens: string[]): number {
  for (const c of candidates) if (haystack.includes(c)) return 100;
  let best = 0;
  for (const t of tokens) {
    if (candidates.includes(t)) best = Math.max(best, 90);
    else if (candidates.some((c) => t.startsWith(c))) best = Math.max(best, 70);
    else if (t.length >= 3) {
      // Query word extends a token ("сбербанка" vs tag "сбербанк"). The site scores this a flat 30;
      // here it scales with coverage so the longest matching token wins ("сбербанк" over "сбер").
      for (const c of candidates) if (c.startsWith(t)) best = Math.max(best, Math.round((30 * t.length) / c.length));
    }
  }
  if (best === 0) {
    for (const t of tokens) {
      for (const c of candidates) {
        const dist = fuzzyMatchToken(c, t);
        if (dist > 0) best = Math.max(best, dist === 1 ? 20 : 10);
      }
    }
  }
  return best;
}

export function scoreWord(word: string, haystack: string): number {
  return scoreCandidates(searchCandidates(word), haystack, haystack.split(/\s+/).filter(Boolean));
}

/** A name-like string of a logo and how much its match is worth relative to the official name. */
interface WeightedName { text: string; weight: number }

const W_NAME = 1; // name, nameEn
const W_ALT = 0.95; // altNames from the catalog (alt_name, …): "almost like the name"
const W_ALIAS = 0.9; // spelling derived from the leading tags (see tagAliases)
/** Logo whose slug equals one of its ecosystem keys is that ecosystem's main brand (vk, sber, ozon). */
const FLAGSHIP_BONUS = 15;

function nameBonus(candidates: string[], names: readonly WeightedName[]): number {
  let best = 0;
  for (const { text: n, weight } of names) {
    let b = 0;
    for (const w of candidates) {
      if (n === w) b = Math.max(b, 200);
      else if (n.startsWith(w + ' ')) b = Math.max(b, 150);
      else if (n.startsWith(w)) b = Math.max(b, 130);
      else if (n.includes(w)) b = Math.max(b, 50);
      // Query word extends the brand name: "сбербанк" -> Сбер (not СберТех, which only has the tag).
      else if (n.length >= 3 && w.startsWith(n)) b = Math.max(b, 40);
    }
    best = Math.max(best, b * weight);
  }
  return best;
}

/**
 * Relevance of one logo for already tokenized words; 0 = no match.
 * Any matching word qualifies; logos matching every word rank above partial matches.
 */
export function scoreQuery(words: string[], haystack: string, names: readonly WeightedName[], flagship = false): number {
  const tokens = haystack.split(/\s+/).filter(Boolean);
  let total = 0;
  let matched = 0;
  for (const w of words) {
    const candidates = searchCandidates(w);
    const s = scoreCandidates(candidates, haystack, tokens);
    if (s === 0) continue;
    matched++;
    total += s + nameBonus(candidates, names);
  }
  if (matched === 0) return 0;
  if (flagship) total += FLAGSHIP_BONUS;
  return matched === words.length ? total : (total * matched) / words.length;
}

const isCyr = (s: string) => /[а-яе]/.test(s);
const isLat = (s: string) => /^[a-z0-9.+&']+$/.test(s);

/**
 * Catalog convention: tags start with the brand's Russian spelling as a phrase of as many words as
 * the name ("вк дом vk home …" for ВК Дом, "вк vk вконтакте …" for ВКонтакте, "телеграм …" for
 * Telegram), often followed by the Latin phrase of the same length. Those phrases are the brand's
 * colloquial names — "вк" for ВКонтакте — so they rank like a name, not like an ordinary tag.
 */
function tagAliases(nameWords: number, tags: readonly string[]): string[] {
  const t = tags.map(normalizeText).filter(Boolean);
  const n = Math.max(1, nameWords);
  if (t.length < n) return [];
  const ru = t.slice(0, n);
  const out = [ru.join(' ')];
  const en = t.slice(n, 2 * n);
  if (en.length === n && ru.some(isCyr) && en.every(isLat)) out.push(en.join(' '));
  return out;
}

interface IndexEntry { haystack: string; names: WeightedName[]; flagship: boolean }
const haystackCache = new WeakMap<Logo, IndexEntry>();

function indexOf(logo: Logo): IndexEntry {
  let entry = haystackCache.get(logo);
  if (!entry) {
    const names: WeightedName[] = [];
    const seen = new Set<string>();
    const add = (text: string, weight: number) => {
      const t = normalizeText(text).trim();
      if (t && !seen.has(t)) {
        seen.add(t);
        names.push({ text: t, weight });
      }
    };
    add(logo.name, W_NAME);
    if (logo.nameEn) add(logo.nameEn, W_NAME);
    for (const a of logo.altNames ?? []) add(a, W_ALT);
    // Count hyphenated parts as words: Альфа-Бизнес is tagged "альфа бизнес …".
    const nameWords = logo.name.toLowerCase().split(/[\s\-/]+/).filter(Boolean).length;
    for (const a of tagAliases(nameWords, logo.tags)) add(a, W_ALIAS);
    const raw = [logo.name, logo.nameEn ?? '', ...(logo.altNames ?? []), ...logo.tags, logo.slug]
      .join(' ').toLowerCase().replace(/ё/g, 'е');
    // Both spellings of hyphenated words: "т-банк" and "тбанк".
    entry = {
      haystack: `${raw} ${normalizeText(raw)}`,
      names,
      flagship: !!logo.ecosystem?.includes(logo.slug),
    };
    haystackCache.set(logo, entry);
  }
  return entry;
}

/** Pure search over a logo list. Empty query returns the filtered list in catalog order. */
export function searchLogos(logos: readonly Logo[], query: string, opts: SearchOptions = {}): Logo[] {
  const filtered = logos.filter(
    (l) =>
      (opts.category === undefined || l.category.slug === opts.category) &&
      (opts.hasSvg === undefined || l.hasSvg === opts.hasSvg) &&
      (opts.hasPng === undefined || l.hasPng === opts.hasPng),
  );
  const limit = opts.limit !== undefined && opts.limit >= 0 ? opts.limit : Infinity;
  const words = tokenizeQuery(query);
  if (words.length === 0) return filtered.slice(0, limit);
  const scored: { logo: Logo; score: number; i: number }[] = [];
  filtered.forEach((logo, i) => {
    const { haystack, names, flagship } = indexOf(logo);
    const score = scoreQuery(words, haystack, names, flagship);
    if (score > 0) scored.push({ logo, score, i });
  });
  // Ties: the shorter name is the more generic brand (Ozon before Ozon Profit), then catalog order.
  scored.sort((a, b) => b.score - a.score || a.logo.name.length - b.logo.name.length || a.i - b.i);
  return scored.slice(0, limit).map((s) => s.logo);
}
