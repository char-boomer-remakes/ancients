// ------------------------------------------------------------------
// Loading screen (GRAPHICS_SPEC §9.4). Masks the one-time hitch when a scene
// is built — the post-processing stack + PBR programs compile synchronously
// on the first render, and the env map / terrain build on the main thread.
// We paint the overlay, yield two frames so it's actually on screen, then run
// the heavy work behind it and fade out once the first frame is warm.
// ------------------------------------------------------------------

let el: HTMLDivElement | null = null;
let hideTimer = 0;

export interface LoadingProgress {
  label?: string;
  loaded?: number;
  total?: number;
  loadedBytes?: number;
  totalBytes?: number;
  current?: string;
}

export type LoadingProgressReporter = (progress: LoadingProgress) => void;

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function ensure(): HTMLDivElement {
  if (!el) {
    el = document.createElement('div');
    el.id = 'loading-screen';
    el.innerHTML = `
      <div class="loading-card">
        <div class="loading-rune" aria-hidden="true"></div>
        <div class="loading-label"></div>
        <div class="loading-progress" aria-live="polite"></div>
      </div>`;
    document.body.appendChild(el);
  }
  return el;
}

export function showLoading(text = 'Entering the Isle…'): void {
  const node = ensure();
  window.clearTimeout(hideTimer);
  const label = node.querySelector('.loading-label');
  if (label) label.textContent = text;
  updateLoadingProgress({});
  node.style.display = 'flex';
  // Reflow before clearing .hide so the opacity transition replays on reuse.
  void node.offsetWidth;
  node.classList.remove('hide');
}

export function hideLoading(): void {
  if (!el) return;
  el.classList.add('hide');
  const node = el;
  hideTimer = window.setTimeout(() => {
    node.style.display = 'none';
  }, 450);
}

export function updateLoadingProgress(progress: LoadingProgress): void {
  if (!el) return;
  const node = el.querySelector('.loading-progress');
  if (!node) return;
  const hasCount = progress.total !== undefined && progress.loaded !== undefined && progress.total > 0;
  const hasBytes = progress.totalBytes !== undefined && progress.loadedBytes !== undefined && progress.totalBytes > 0;
  if (!hasCount && !hasBytes && !progress.current && !progress.label) {
    node.textContent = '';
    return;
  }
  const parts: string[] = [];
  if (progress.label) parts.push(progress.label);
  if (hasCount) parts.push(`${progress.loaded}/${progress.total}`);
  if (hasBytes) parts.push(`${formatBytes(progress.loadedBytes!)} / ${formatBytes(progress.totalBytes!)}`);
  if (progress.current) parts.push(progress.current);
  node.textContent = parts.join(' · ');
}

/**
 * Show the loading screen, let it paint, run `work()` behind it, then fade out.
 * Two rAFs guarantee the overlay is composited before the synchronous work
 * blocks the main thread; `minMs` keeps it from flashing on fast machines.
 */
export function withLoading(text: string, work: (progress: LoadingProgressReporter) => void | Promise<void>, minMs = 320): void {
  showLoading(text);
  const start = performance.now();
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      void (async () => {
        let failed: unknown = null;
        try {
          await work(updateLoadingProgress);
        } catch (err) {
          failed = err;
        }
        const wait = Math.max(0, minMs - (performance.now() - start));
        window.setTimeout(hideLoading, wait);
        if (failed) window.setTimeout(() => { throw failed; }, wait);
      })();
    })
  );
}
