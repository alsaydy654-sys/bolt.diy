import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BatchedDOMUpdater, streamingOptimizer } from '~/lib/performance/streaming-optimizer';

describe('StreamingOptimizer metrics', () => {
  beforeEach(() => {
    streamingOptimizer.reset();
  });

  it('returns zeroed work metrics when no operations were tracked', () => {
    const stats = streamingOptimizer.getStats();

    expect(stats.overBudgetOperations).toBe(0);
    expect(stats.averageWorkDurationMs).toBe(0);
    expect(stats.percentOverBudget).toBe(0);
  });

  it('reports work durations and budget exceedances accurately', () => {
    streamingOptimizer.trackFrame(10);
    streamingOptimizer.trackFrame(20);

    const stats = streamingOptimizer.getStats();

    expect(stats.overBudgetOperations).toBe(1);
    expect(stats.averageWorkDurationMs).toBe(15);
    expect(stats.percentOverBudget).toBe(50);
  });

  it('keeps legacy metric names compatible with the corrected metrics', () => {
    streamingOptimizer.trackFrame(10);
    streamingOptimizer.trackFrame(20);

    const stats = streamingOptimizer.getStats();

    expect(stats.droppedFrames).toBe(stats.overBudgetOperations);
    expect(stats.averageFrameTime).toBe(stats.averageWorkDurationMs);
    expect(stats.percentDropped).toBe(stats.percentOverBudget);
  });

  it('clears all work metrics after reset', () => {
    streamingOptimizer.trackFrame(30);
    streamingOptimizer.reset();

    const stats = streamingOptimizer.getStats();

    expect(stats.overBudgetOperations).toBe(0);
    expect(stats.averageWorkDurationMs).toBe(0);
    expect(stats.percentOverBudget).toBe(0);
  });
});


describe('BatchedDOMUpdater error recovery', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not schedule an unnecessary frame for updates queued during a flush', () => {
    const scheduledCallbacks: FrameRequestCallback[] = [];
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      scheduledCallbacks.push(callback);
      return scheduledCallbacks.length;
    });

    vi.stubGlobal('requestAnimationFrame', requestFrame);

    const updater = new BatchedDOMUpdater();
    const nestedUpdate = vi.fn();

    updater.schedule(() => {
      updater.schedule(nestedUpdate);
    });

    expect(requestFrame).toHaveBeenCalledTimes(1);

    const firstFrame = scheduledCallbacks.shift();
    expect(firstFrame).toBeDefined();
    firstFrame!(0);

    expect(nestedUpdate).toHaveBeenCalledOnce();
    expect(requestFrame).toHaveBeenCalledTimes(1);
    expect(scheduledCallbacks).toHaveLength(0);
  });

  it('reschedules pending updates when an update throws', () => {
    let frameCallback: FrameRequestCallback = () => {};

    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      frameCallback = callback;
      return 1;
    });

    vi.stubGlobal('requestAnimationFrame', requestFrame);

    const updater = new BatchedDOMUpdater();
    const secondUpdate = vi.fn();

    updater.schedule(() => {
      throw new Error('update failed');
    });
    updater.schedule(secondUpdate);

    expect(requestFrame).toHaveBeenCalledTimes(1);

    const firstFrame = frameCallback;
    expect(() => firstFrame(0)).toThrow('update failed');

    expect(requestFrame).toHaveBeenCalledTimes(2);
    expect(secondUpdate).not.toHaveBeenCalled();

    const secondFrame = frameCallback;
    secondFrame(16);

    expect(secondUpdate).toHaveBeenCalledOnce();
  });
});
