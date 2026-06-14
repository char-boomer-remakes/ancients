import type { AnimGesture, CutsceneBeat, CutsceneDef, CutsceneTier, CutsceneTrigger, ShotAngle, ShotMove } from '../core/types';

const ANGLE_ALIASES: Record<string, ShotAngle> = {
  wide: 'wide',
  dramatic: 'wide',
  'through objects': 'wide',
  'bird s eye': 'high',
  'bird eye': 'high',
  high: 'high',
  'high angle': 'high',
  low: 'low',
  'low angle': 'low',
  close: 'close',
  'close up': 'close',
  'close-up': 'close',
  reflection: 'close',
  'over the shoulder': 'over-shoulder',
  'over-the-shoulder': 'over-shoulder',
  'title card': 'title-card',
  'title-card': 'title-card'
};

const MOVE_ALIASES: Record<string, ShotMove> = {
  hold: 'hold',
  'push in': 'push-in',
  'push-in': 'push-in',
  'pull back': 'pull-back',
  'pull-back': 'pull-back',
  crane: 'crane',
  snap: 'snap'
};

function clean(s: string): string {
  return s.trim().replace(/^["']|["']$/g, '');
}

function key(s: string): string {
  return clean(s).toLowerCase().replace(/[^a-z0-9-]+/g, ' ').trim();
}

function parseShot(line: string): CutsceneBeat['shot'] {
  const slash = line.match(/SHOT:\s*([a-z-]+)\s*\/\s*([a-z-]+)\s*\/\s*([^/]+)\s*\/\s*(.+)$/i);
  if (slash) {
    return {
      angle: ANGLE_ALIASES[key(slash[1])] ?? 'wide',
      move: MOVE_ALIASES[key(slash[2])] ?? 'hold',
      palette: clean(slash[3]),
      mood: clean(slash[4])
    };
  }
  const tuple = line.match(/SHOT:\s*\(([^)]+)\)/i)?.[1];
  if (!tuple) throw new Error(`Cutscene DSL: missing SHOT tuple in "${line.trim()}"`);
  const parts = tuple.split(',').map(clean);
  return {
    angle: ANGLE_ALIASES[key(parts[3] ?? '')] ?? 'wide',
    move: 'hold',
    palette: parts[2] || 'neutral',
    mood: parts[4] || 'held'
  };
}

function applyLine(beat: CutsceneBeat, line: string): void {
  const body = line.replace(/^LINE:\s*/i, '');
  const m = body.match(/^([^:]+):\s*"([^"]+)"\s*$/);
  if (!m) throw new Error(`Cutscene DSL: bad LINE "${line.trim()}"`);
  beat.line = { speaker: clean(m[1]), text: m[2] };
}

function applyStage(beat: CutsceneBeat, line: string): void {
  const body = line.replace(/^STAGE:\s*/i, '').trim();
  beat.stage ??= [];
  const title = body.match(/(?:title|text|location|mood)=["']([^"']+)["']/i)?.[1];
  if (/Describe|SetTone|Establish|Explore/i.test(body) && title) {
    beat.stage.push({ kind: 'title', text: title });
  }
  const target = body.match(/target=["']?(player|ally|boss|region|item|tower)["']?/i)?.[1];
  if (target) beat.stage.push({ kind: 'focus', target: target as 'player' | 'ally' | 'boss' | 'region' | 'item' | 'tower' });
  const gesture = body.match(/gesture=["']?([a-z-]+)["']?/i)?.[1];
  if (gesture && (target === 'player' || target === 'ally' || target === 'boss')) {
    beat.stage.push({ kind: 'gesture', target, gesture: gesture as AnimGesture });
  }
}

function beatBlocks(src: string): string[] {
  const blocks: string[] = [];
  const re = /BEAT\s*\{/gi;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    let depth = 1;
    let i = re.lastIndex;
    const start = i;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
    }
    if (depth === 0) blocks.push(src.slice(start, i - 1));
    re.lastIndex = i;
  }
  return blocks;
}

/** Compile the STORY §5 cut-scene authoring format into playable data. */
export function compileCutsceneDsl(
  source: string,
  meta: { id: string; title: string; tier: CutsceneTier; trigger: CutsceneTrigger; category?: CutsceneDef['category']; replayable?: boolean }
): CutsceneDef {
  const beats = beatBlocks(source).map((block): CutsceneBeat => {
    const lines = block.split(/\n|;/).map((l) => l.trim()).filter(Boolean);
    const shotLine = lines.find((l) => /^SHOT:/i.test(l));
    if (!shotLine) throw new Error('Cutscene DSL: every BEAT needs SHOT');
    const beat: CutsceneBeat = { shot: parseShot(shotLine) };
    const moveLine = lines.find((l) => /^MOVE:/i.test(l));
    if (moveLine) beat.shot.move = MOVE_ALIASES[key(moveLine.replace(/^MOVE:\s*/i, ''))] ?? beat.shot.move;
    for (const line of lines) {
      if (/^STAGE:/i.test(line)) applyStage(beat, line);
      else if (/^LINE:/i.test(line)) applyLine(beat, line);
      else if (/^HOLD:/i.test(line)) beat.hold = Number(line.replace(/^HOLD:\s*/i, ''));
      else if (/^SOUND:/i.test(line)) beat.sound = clean(line.replace(/^SOUND:\s*/i, '')) as CutsceneBeat['sound'];
    }
    return beat;
  });
  if (beats.length === 0) throw new Error('Cutscene DSL: no BEAT blocks found');
  return {
    id: meta.id,
    title: meta.title,
    tier: meta.tier,
    trigger: meta.trigger,
    skippable: true,
    letterbox: meta.tier !== 'bark',
    category: meta.category,
    replayable: meta.replayable,
    beats
  };
}
