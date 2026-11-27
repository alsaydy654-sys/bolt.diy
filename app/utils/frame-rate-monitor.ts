/* eslint-disable @typescript-eslint/naming-convention, consistent-return */
/**
 * Frame Rate Monitor
 * Tracks frame rate during animations and streaming to ensure smooth 60fps performance
 * Can also target 120fps on high-refresh-rate displays
 */

export class FrameRateMonitor {
  private lifecycleVersion = 0;
  private isRunning = false;
  private rafId: number | null = null;
  private targetFps: number;
  private onUpdate?: (fps: number, droppedFrames: number) => void;
  private frameHistory: number[] = [];
  private readonly HISTORY_SIZE = 60;

  private lastFrameTime: number | null = null;
  private windowStart: number | null = null;
  private windowFrames = 0;

  constructor(targetFps: number = 60, onUpdate?: (fps: number, droppedFrames: number) => void) {
    this.targetFps = targetFps;
    this.onUpdate = onUpdate;
  }

  start(): void {
    if (this.isRunning) {
      return;
    }

    this.lifecycleVersion++;

    this.isRunning = true;
    this.reset();
    this.scheduleFrame(this.lifecycleVersion);
  }

  stop(): void {
    this.lifecycleVersion++;
    this.isRunning = false;

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  getCurrentFps(): number {
    if (this.frameHistory.length === 0) {
      return 0;
    }

    const average = this.frameHistory.reduce((a, b) => a + b, 0) / this.frameHistory.length;

    return average > 0 ? Math.round(1000 / average) : 0;
  }

  getFrameBudgetCompliance(): number {
    if (this.frameHistory.length === 0) {
      return 100;
    }

    const budget = 1000 / this.targetFps;
    const inBudget = this.frameHistory.filter((time) => time <= budget + 0.01).length;

    return (inBudget / this.frameHistory.length) * 100;
  }

  getStats(): {
    currentFps: number;
    avgFrameTime: number;
    minFrameTime: number;
    maxFrameTime: number;
    droppedFrames: number;
    budgetCompliance: number;
  } {
    if (this.frameHistory.length === 0) {
      return {
        currentFps: 0,
        avgFrameTime: 0,
        minFrameTime: 0,
        maxFrameTime: 0,
        droppedFrames: 0,
        budgetCompliance: 100,
      };
    }

    const average = this.frameHistory.reduce((a, b) => a + b, 0) / this.frameHistory.length;

    const budget = 1000 / this.targetFps;

    return {
      currentFps: average > 0 ? Math.round(1000 / average) : 0,
      avgFrameTime: average,
      minFrameTime: Math.min(...this.frameHistory),
      maxFrameTime: Math.max(...this.frameHistory),
      droppedFrames: this.frameHistory.filter((time) => time > budget + 0.01).length,
      budgetCompliance: this.getFrameBudgetCompliance(),
    };
  }

  reset(): void {
    this.frameHistory = [];
    this.lastFrameTime = null;
    this.windowStart = null;
    this.windowFrames = 0;
  }

  private measure = (timestamp?: number): void => {
    if (!this.isRunning) {
      return;
    }

    const lifecycleVersion = this.lifecycleVersion;
    this.rafId = null;

    const now = typeof timestamp === 'number' && Number.isFinite(timestamp) ? timestamp : performance.now();

    if (this.lastFrameTime === null) {
      this.lastFrameTime = now;
      this.windowStart = now;
    } else {
      const frameTime = now - this.lastFrameTime;

      if (frameTime > 0 && Number.isFinite(frameTime)) {
        this.frameHistory.push(frameTime);

        if (this.frameHistory.length > this.HISTORY_SIZE) {
          this.frameHistory.shift();
        }

        this.windowFrames++;
      }

      this.lastFrameTime = now;
    }

    if (this.windowStart !== null && now - this.windowStart >= 1000) {
      const elapsed = now - this.windowStart;
      const fps = Math.round((this.windowFrames * 1000) / elapsed);

      const budget = 1000 / this.targetFps;

      const droppedFrames = this.frameHistory.filter((time) => time > budget + 0.01).length;

      try {
        this.onUpdate?.(fps, droppedFrames);
      } finally {
        if (this.isRunning && lifecycleVersion === this.lifecycleVersion) {
          this.windowStart = now;
          this.windowFrames = 0;
          this.scheduleFrame(lifecycleVersion);
        }
      }

      return;
    }

    this.scheduleFrame(lifecycleVersion);
  };

  private scheduleFrame(lifecycleVersion: number): void {
    this.rafId = requestAnimationFrame((timestamp) => {
      if (!this.isRunning || lifecycleVersion !== this.lifecycleVersion) {
        return;
      }

      this.measure(timestamp);
    });
  }
}

/**
 * React hook for monitoring frame rate
 */
export function useFrameRateMonitor(
  targetFps: number = 60,
  enabled: boolean = true,
): {
  fps: number;
  droppedFrames: number;
  stats: ReturnType<FrameRateMonitor['getStats']>;
} {
  const [fps, setFps] = React.useState(0);
  const [droppedFrames, setDroppedFrames] = React.useState(0);

  const [stats, setStats] = React.useState<ReturnType<FrameRateMonitor['getStats']>>({
    currentFps: 0,
    avgFrameTime: 0,
    minFrameTime: 0,
    maxFrameTime: 0,
    droppedFrames: 0,
    budgetCompliance: 100,
  });

  React.useEffect(() => {
    if (!enabled) {
      return;
    }

    const monitor = new FrameRateMonitor(targetFps, (newFps, newDroppedFrames) => {
      setFps(newFps);
      setDroppedFrames(newDroppedFrames);
      setStats(monitor.getStats());
    });

    monitor.start();

    return () => {
      monitor.stop();
    };
  }, [targetFps, enabled]);

  return { fps, droppedFrames, stats };
}

/**
 * Measure main thread blocking time during a function execution
 */
export async function measureMainThreadBlocking<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; blockingTime: number; totalTime: number }> {
  const start = performance.now();

  let blockingTime = 0;
  let lastCheck = start;

  // Check blocking time periodically
  const checkInterval = setInterval(() => {
    const now = performance.now();
    const gap = now - lastCheck;

    // If gap > 16ms, we likely blocked the main thread
    if (gap > 16) {
      blockingTime += gap - 16;
    }

    lastCheck = now;
  }, 1);

  try {
    const result = await fn();
    const totalTime = performance.now() - start;
    clearInterval(checkInterval);

    return { result, blockingTime, totalTime };
  } catch (error) {
    clearInterval(checkInterval);
    throw error;
  }
}

// Re-export React for the hook
import React from 'react';
