import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FrameRateMonitor } from '~/utils/frame-rate-monitor';

describe('FrameRateMonitor', () => {
  let callbacks: Map<number, FrameRequestCallback>;
  let nextId: number;

  const runFrame = (timestamp: number) => {
    const entry = callbacks.entries().next().value;

    if (!entry) {
      throw new Error('No scheduled animation frame');
    }

    const [id, callback] = entry;
    callbacks.delete(id);
    callback(timestamp);
  };

  beforeEach(() => {
    callbacks = new Map();
    nextId = 1;

    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        const id = nextId++;
        callbacks.set(id, callback);
        return id;
      }),
    );

    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((id: number) => {
        callbacks.delete(id);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a monitor with the default target', () => {
    expect(new FrameRateMonitor()).toBeInstanceOf(FrameRateMonitor);
  });

  it('accepts a custom FPS target and callback', () => {
    const callback = vi.fn();
    expect(new FrameRateMonitor(120, callback)).toBeInstanceOf(FrameRateMonitor);
  });

  it('does not count the first animation frame as a completed frame', () => {
    const monitor = new FrameRateMonitor();

    monitor.start();
    runFrame(0);

    expect(monitor.getStats().avgFrameTime).toBe(0);

    monitor.stop();
  });

  it('calculates approximately 60 FPS from known frame timestamps', () => {
    const monitor = new FrameRateMonitor(60);

    monitor.start();
    runFrame(0);

    for (let i = 1; i <= 60; i++) {
      runFrame((1000 / 60) * i);
    }

    expect(monitor.getCurrentFps()).toBe(60);
    expect(monitor.getStats().droppedFrames).toBe(0);
    expect(monitor.getFrameBudgetCompliance()).toBe(100);

    monitor.stop();
  });

  it('counts frames that exceed the target frame budget', () => {
    const monitor = new FrameRateMonitor(60);

    monitor.start();
    runFrame(0);

    for (let i = 1; i <= 50; i++) {
      runFrame(i * 20);
    }

    const stats = monitor.getStats();

    expect(stats.currentFps).toBe(50);
    expect(stats.droppedFrames).toBe(50);
    expect(stats.budgetCompliance).toBe(0);

    monitor.stop();
  });

  it('calls onUpdate with FPS and dropped frames after one second', () => {
    const callback = vi.fn();
    const monitor = new FrameRateMonitor(60, callback);

    monitor.start();
    runFrame(0);

    for (let i = 1; i <= 60; i++) {
      runFrame((1000 / 60) * i);
    }

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(60, 0);

    monitor.stop();
  });

  it('does not schedule duplicate loops when started twice', () => {
    const monitor = new FrameRateMonitor();

    monitor.start();
    const initialCount = callbacks.size;

    monitor.start();

    expect(callbacks.size).toBe(initialCount);

    monitor.stop();
  });

  it('does not schedule another frame when stopped inside onUpdate', () => {
    let monitor: FrameRateMonitor;

    const callback = vi.fn(() => {
      monitor.stop();
    });

    monitor = new FrameRateMonitor(60, callback);
    monitor.start();

    runFrame(0);

    for (let i = 1; i <= 60; i++) {
      runFrame((1000 / 60) * i);
    }

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callbacks.size).toBe(0);
  });

  it('does not schedule duplicate loops when restarted inside onUpdate', () => {
    let monitor: FrameRateMonitor;

    const callback = vi.fn(() => {
      monitor.stop();
      monitor.start();
    });

    monitor = new FrameRateMonitor(60, callback);
    monitor.start();

    runFrame(0);
    for (let i = 1; i <= 60; i++) {
      runFrame((1000 / 60) * i);
    }

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callbacks.size).toBe(1);

    monitor.stop();
    callbacks.clear();
  });

  it('ignores stale animation callbacks after stop and restart', () => {
    const monitor = new FrameRateMonitor();

    monitor.start();

    const staleCallback = callbacks.values().next().value;
    expect(staleCallback).toBeDefined();

    monitor.stop();
    monitor.start();

    expect(callbacks.size).toBe(1);

    staleCallback!(16);

    expect(callbacks.size).toBe(1);

    monitor.stop();
  });

  it('cancels the pending frame when stopped', () => {
    const monitor = new FrameRateMonitor();

    monitor.start();
    expect(callbacks.size).toBe(1);

    monitor.stop();
    expect(callbacks.size).toBe(0);
  });

  it('resets recorded statistics', () => {
    const monitor = new FrameRateMonitor();

    monitor.start();
    runFrame(0);
    runFrame(16.67);

    monitor.reset();

    expect(monitor.getCurrentFps()).toBe(0);
    expect(monitor.getStats().droppedFrames).toBe(0);

    monitor.stop();
  });

  it('returns default statistics when no frames are recorded', () => {
    const monitor = new FrameRateMonitor();

    expect(monitor.getStats()).toEqual({
      currentFps: 0,
      avgFrameTime: 0,
      minFrameTime: 0,
      maxFrameTime: 0,
      droppedFrames: 0,
      budgetCompliance: 100,
    });
  });
  it('passes the dropped frame count to onUpdate', () => {
  const callback = vi.fn();
  const monitor = new FrameRateMonitor(60, callback);

  monitor.start();
  runFrame(0);

  for (let i = 1; i <= 60; i++) {
    runFrame(i * 20);
  }

  expect(callback).toHaveBeenCalledWith(50, 50);

  monitor.stop();
});


  it('continues scheduling frames when onUpdate throws', () => {
    const callback = vi.fn(() => {
      throw new Error('callback failed');
    });
    const monitor = new FrameRateMonitor(60, callback);

    monitor.start();
    runFrame(0);

    for (let i = 1; i < 60; i++) {
      runFrame((1000 / 60) * i);
    }

    expect(() => runFrame(1000)).toThrow('callback failed');
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callbacks.size).toBe(1);

    monitor.stop();
  });


  it('accepts the exact frame-budget tolerance boundary', () => {
    const monitor = new FrameRateMonitor(1000);

    monitor.start();
    runFrame(0);
    runFrame(1.01);
    runFrame(2.03);

    const stats = monitor.getStats();

    expect(stats.droppedFrames).toBe(1);
    expect(stats.budgetCompliance).toBe(50);

    monitor.stop();
  });

  it('uses the rolling 60-sample history for dropped frames', () => {
    const callback = vi.fn();
    const monitor = new FrameRateMonitor(60, callback);

    monitor.start();
    runFrame(0);

    for (let i = 1; i <= 100; i++) {
      runFrame(i * 20);
    }

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith(50, 60);

    monitor.stop();
  });

});
