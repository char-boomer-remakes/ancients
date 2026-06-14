/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  server: {
    open: true,
    // the embedded preview browser caches modules too aggressively
    headers: { 'Cache-Control': 'no-store' }
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/three/examples/jsm/')) return 'three-addons';
          if (id.includes('/node_modules/three/')) return 'three';
        }
      }
    }
  },
  test: {
    include: ['src/test/**/*.test.ts'],
    environment: 'node',
    // Many tests run full headless sims (gyms, raids, gauntlets) or large deterministic
    // compute sweeps (loot pacing, gambit mirrors) to completion. Under concurrent workers
    // these are compute-bound, not latency tests — a saturated box can stretch a ~3s test
    // well past a tight limit. Keep the ceiling high so CPU contention can never time out a
    // deterministic correctness check (which also tears down the worker and cascades
    // spurious failures into sibling files); real hangs still fail, just later.
    testTimeout: 60000,
    hookTimeout: 60000
  }
});
