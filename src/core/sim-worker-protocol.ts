import type { Order, SimEvent } from './types';
import type { SimSnapshot } from './sim-worker-host';

export type SimWorkerBootstrap =
  | { kind: 'empty'; seed?: number; bounds?: { w: number; h: number } }
  | {
      kind: 'duel';
      seed?: number;
      bounds?: { w: number; h: number };
      team0Hero?: string;
      team1Hero?: string;
      level?: number;
    };

export type SimWorkerRequest =
  | { id: number; kind: 'init'; bootstrap: SimWorkerBootstrap }
  | { id: number; kind: 'order'; uid: number; order: Order }
  | { id: number; kind: 'step'; ticks: number }
  | { id: number; kind: 'snapshot' }
  | { id: number; kind: 'drain-events' };

type SimWorkerRequestInput =
  | { kind: 'init'; bootstrap: SimWorkerBootstrap }
  | { kind: 'order'; uid: number; order: Order }
  | { kind: 'step'; ticks: number }
  | { kind: 'snapshot' }
  | { kind: 'drain-events' };

export type SimWorkerResponse =
  | { id: number; ok: true; snapshot?: SimSnapshot; events?: SimEvent[] }
  | { id: number; ok: false; error: string };

export interface SimWorkerPort {
  postMessage(message: SimWorkerRequest): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<SimWorkerResponse>) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent<SimWorkerResponse>) => void): void;
}

export class SimWorkerClient {
  private seq = 1;
  private pending = new Map<number, {
    resolve: (response: SimWorkerResponse) => void;
    reject: (error: Error) => void;
  }>();
  private readonly onMessage = (event: MessageEvent<SimWorkerResponse>): void => {
    const response = event.data;
    const slot = this.pending.get(response.id);
    if (!slot) return;
    this.pending.delete(response.id);
    if (response.ok) slot.resolve(response);
    else slot.reject(new Error(response.error));
  };

  constructor(private readonly port: SimWorkerPort) {
    this.port.addEventListener('message', this.onMessage);
  }

  init(bootstrap: SimWorkerBootstrap): Promise<SimSnapshot> {
    return this.send({ kind: 'init', bootstrap }).then((response) => requiredSnapshot(response));
  }

  dispose(): void {
    this.port.removeEventListener('message', this.onMessage);
    for (const [, slot] of this.pending) slot.reject(new Error('sim worker client disposed'));
    this.pending.clear();
  }

  order(uid: number, order: Order): Promise<void> {
    return this.send({ kind: 'order', uid, order }).then(() => undefined);
  }

  stepTicks(ticks: number): Promise<SimSnapshot> {
    return this.send({ kind: 'step', ticks }).then((response) => requiredSnapshot(response));
  }

  snapshot(): Promise<SimSnapshot> {
    return this.send({ kind: 'snapshot' }).then((response) => requiredSnapshot(response));
  }

  drainEvents(): Promise<SimEvent[]> {
    return this.send({ kind: 'drain-events' }).then((response) => {
      if (!response.ok) throw new Error(response.error);
      return response.events ?? [];
    });
  }

  private send(request: SimWorkerRequestInput): Promise<SimWorkerResponse> {
    const id = this.seq++;
    const msg = { ...request, id } as SimWorkerRequest;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.port.postMessage(msg);
    });
  }
}

function requiredSnapshot(response: SimWorkerResponse): SimSnapshot {
  if (!response.ok || !response.snapshot) throw new Error('sim worker response missing snapshot');
  return response.snapshot;
}
