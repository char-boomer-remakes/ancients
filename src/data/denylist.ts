// Esports-homage denylist (Phase 6 §3.13, §5). Our gym leaders, Elite Five,
// Champion, raid bosses, and route trainers are ORIGINAL homages to Dota 2
// esports culture — a fan should catch the wink, but the shipped name must
// never be a real trademark or a real person's name verbatim. This list powers
// the §6 guard test (test 23) and documents what to steer clear of. The
// touchstone -> original mapping lives in DECISIONS.md.
//
// Entries are deliberately distinctive (multiword or unusual handles) so the
// word-boundary matcher never false-positives on ordinary English or on our
// own original copy.
export const ESPORTS_DENYLIST: string[] = [
  // Organizations / rosters
  'Team Secret',
  'Evil Geniuses',
  'Natus Vincere',
  "Na'Vi",
  'Virtus.pro',
  'Team Liquid',
  'PSG.LGD',
  'Tundra Esports',
  'Gaimin Gladiators',
  'Team Spirit',
  'OG Esports',
  'Newbee',
  'Wings Gaming',
  'Fnatic',
  'Vici Gaming',
  'Invictus Gaming',
  'Shopify Rebellion',
  'BetBoom Team',
  'Nigma Galaxy',
  // Personalities (players / casters), distinctive handles only
  'Dendi',
  'Puppey',
  'Miracle-',
  'N0tail',
  'Notail',
  'Topson',
  'SumaiL',
  'Arteezy',
  'Dyrachyo',
  'Yatoro',
  'ODPixel',
  'TobiWan',
  'Capitalist',
  'SUNSfan',
  // Trademarked events / venues / artifacts
  'The International',
  'Aegis of Champions',
  'Battle Pass',
  'The Compendium',
  'Mercedes-Benz Arena',
  'Spodek Arena'
];

function termRegex(term: string): RegExp {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Plain alphabetic terms get word boundaries; terms with punctuation
  // (Virtus.pro, Na'Vi, Miracle-) are distinctive enough to match as substrings.
  const wordish = /^[A-Za-z][A-Za-z ]*[A-Za-z]$/.test(term);
  return new RegExp(wordish ? `\\b${escaped}\\b` : escaped, 'i');
}

const COMPILED: { term: string; re: RegExp }[] = ESPORTS_DENYLIST.map((term) => ({ term, re: termRegex(term) }));

/** Returns the first denylisted term found verbatim in `text`, or null. */
export function denylistHit(text: string): string | null {
  for (const { term, re } of COMPILED) {
    if (re.test(text)) return term;
  }
  return null;
}
