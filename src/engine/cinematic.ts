import type { CutsceneBeat, CutsceneDef, CutsceneTier } from '../core/types';

export type CutsceneContext = Record<string, string | number | undefined>;

export interface CinematicView {
  id: string;
  title: string;
  tier: CutsceneTier;
  beatIndex: number;
  beatCount: number;
  letterbox: boolean;
  speed: number;
  seen: boolean;
  shot: CutsceneBeat['shot'];
  stageText: string;
  speaker?: string;
  text?: string;
  controls: string;
}

interface Playback {
  def: CutsceneDef;
  ctx: CutsceneContext;
  seen: boolean;
  beatIndex: number;
  elapsed: number;
  speed: number;
}

const DEFAULT_HOLD_SEC = 2.8;

function fillTemplate(text: string, ctx: CutsceneContext): string {
  return text.replace(/\{([a-zA-Z0-9_-]+)\}/g, (_, key: string) => String(ctx[key] ?? ''));
}

function stageText(beat: CutsceneBeat, ctx: CutsceneContext): string {
  const title = beat.stage?.find((s) => s.kind === 'title');
  return title?.kind === 'title' ? fillTemplate(title.text, ctx) : '';
}

export class CinematicDirector {
  private current: Playback | null = null;
  private queue: Playback[] = [];

  get active(): boolean {
    return !!this.current;
  }

  play(def: CutsceneDef, ctx: CutsceneContext = {}, seen = false): void {
    const playback: Playback = {
      def,
      ctx,
      seen,
      beatIndex: 0,
      elapsed: 0,
      speed: seen && def.tier !== 'setpiece' ? 4 : 1
    };
    if (this.current) this.queue.push(playback);
    else this.current = playback;
  }

  update(dt: number): void {
    if (!this.current) return;
    const beat = this.current.def.beats[this.current.beatIndex];
    this.current.elapsed += dt * this.current.speed;
    if (this.current.elapsed >= (beat?.hold ?? DEFAULT_HOLD_SEC)) this.advance();
  }

  advance(): void {
    if (!this.current) return;
    if (this.current.beatIndex < this.current.def.beats.length - 1) {
      this.current.beatIndex += 1;
      this.current.elapsed = 0;
      return;
    }
    this.finishCurrent();
  }

  skip(): void {
    this.finishCurrent();
  }

  setFastForward(active: boolean): void {
    if (!this.current) return;
    this.current.speed = active ? 4 : this.current.seen && this.current.def.tier !== 'setpiece' ? 4 : 1;
  }

  view(): CinematicView | null {
    if (!this.current) return null;
    const { def, ctx, beatIndex, speed, seen } = this.current;
    const beat = def.beats[beatIndex];
    if (!beat) return null;
    const line = beat.line;
    return {
      id: def.id,
      title: fillTemplate(def.title, ctx),
      tier: def.tier,
      beatIndex,
      beatCount: def.beats.length,
      letterbox: def.letterbox ?? def.tier !== 'bark',
      speed,
      seen,
      shot: beat.shot,
      stageText: stageText(beat, ctx),
      speaker: line ? fillTemplate(line.speaker, ctx) : undefined,
      text: line ? fillTemplate(line.text, ctx) : undefined,
      controls: seen ? 'Space: next · Tab: fast-forward · Esc: skip' : 'Space: advance · hold Tab: fast-forward · Esc: skip'
    };
  }

  private finishCurrent(): void {
    this.current = this.queue.shift() ?? null;
  }
}
