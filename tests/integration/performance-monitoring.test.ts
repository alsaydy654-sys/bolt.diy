/**
 * Performance Monitoring Integration Tests
 * 
 * Tests the complete performance monitoring workflow
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PerformanceMonitor } from '~/utils/performance-monitor';
import { FrameRateMonitor } from '~/utils/frame-rate-monitor';
import { SyntaxHighlighterClient } from '~/utils/syntax-highlighter-client';

beforeEach(() => {
  PerformanceMonitor.clearEvents();
});

describe('Performance Monitoring Integration', () => {

  describe('End-to-end performance tracking', () => {
    it('should track a complete user journey', async () => {
      // Start app
      PerformanceMonitor.startMeasurement('app-start');
      
      // Simulate some initialization
      await new Promise((resolve) => setTimeout(resolve, 10));
      
      PerformanceMonitor.endMeasurement('app-start');

      // User creates a chat
      await PerformanceMonitor.measureAsync('chat-init', async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      // User sends a message
      PerformanceMonitor.measureSync('message-send', () => {
        // Process message
        return 'processed';
      });

      // Verify all journeys were tracked
      const journeys = PerformanceMonitor.getJourneyNames();
      expect(journeys).toContain('app-start');
      expect(journeys).toContain('chat-init');
      expect(journeys).toContain('message-send');

      // Verify stats
      const appStats = PerformanceMonitor.getJourneyStats('app-start');
      expect(appStats).not.toBeNull();
      expect(appStats!.count).toBe(1);
      expect(appStats!.avg).toBeGreaterThan(0);
    });

    it('should track multiple operations of the same journey', async () => {
      // Simulate multiple file loads
      for (let i = 0; i < 5; i++) {
        await PerformanceMonitor.measureAsync('file-load', async () => {
          await new Promise((resolve) => setTimeout(resolve, 5 + i));
        }, { fileId: `file-${i}` });
      }

      const stats = PerformanceMonitor.getJourneyStats('file-load');
      expect(stats!.count).toBe(5);
      expect(stats!.min).toBeGreaterThan(0);
      expect(stats!.max).toBeGreaterThan(stats!.min);
    });
  });

  describe('Performance monitoring with syntax highlighting', () => {
  it('should track syntax highlighting performance', async () => {
    const client = new SyntaxHighlighterClient();

    try {
      const code = 'const x: number = 5;';

      await PerformanceMonitor.measureAsync('syntax-highlight', async () => {
        await client.highlight(code, 'typescript');
      });

      const stats = PerformanceMonitor.getJourneyStats('syntax-highlight');
      expect(stats).not.toBeNull();
      expect(stats!.avg).toBeGreaterThan(0);
      expect(stats!.count).toBe(1);
    } finally {
      client.dispose();
    }
  });

  it('should return consistent output for repeated highlights', async () => {
    const client = new SyntaxHighlighterClient();

    try {
      const code = 'function test() { return true; }';

      const firstResult = await PerformanceMonitor.measureAsync(
        'highlight-first',
        async () => client.highlight(code, 'javascript'),
      );

      const secondResult = await PerformanceMonitor.measureAsync(
        'highlight-repeated',
        async () => client.highlight(code, 'javascript'),
      );

      expect(secondResult).toBe(firstResult);
      expect(PerformanceMonitor.getJourneyStats('highlight-first')!.count).toBe(1);
      expect(PerformanceMonitor.getJourneyStats('highlight-repeated')!.count).toBe(1);
    } finally {
      client.dispose();
    }
  });
});

describe('Frame rate monitoring independently from measured operations', () => {
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

  it('should record frame intervals and a separate heavy-work journey', async () => {
    const onUpdate = vi.fn();
    const monitor = new FrameRateMonitor(60, onUpdate);
    monitor.start();

    try {
      runFrame(0);
      for (let i = 1; i <= 60; i++) {
        runFrame((1000 / 60) * i);
      }

      const stats = monitor.getStats();
      expect(stats.currentFps).toBe(60);
      expect(stats.avgFrameTime).toBeCloseTo(1000 / 60, 5);
      expect(stats.droppedFrames).toBe(0);
      expect(stats.budgetCompliance).toBe(100);
      expect(onUpdate).toHaveBeenCalledTimes(1);
      expect(onUpdate).toHaveBeenCalledWith(60, 0);

      await PerformanceMonitor.measureAsync('heavy-work', async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const perfStats = PerformanceMonitor.getJourneyStats('heavy-work');
      expect(perfStats).not.toBeNull();
      expect(perfStats!.count).toBe(1);
      expect(perfStats!.avg).toBeGreaterThan(0);
    } finally {
      monitor.stop();
    }
  });
});

describe('Export and clear workflow', () => {
    it('should export and clear data', () => {
      // Track some journeys
      PerformanceMonitor.trackJourney('journey-1', 100);
      PerformanceMonitor.trackJourney('journey-2', 200);

      // Export
      const exported = PerformanceMonitor.exportEvents();
      const data = JSON.parse(exported);

      expect(data).toHaveLength(2);
      expect(data[0].journey).toBe('journey-1');
      expect(data[1].journey).toBe('journey-2');

      // Clear and verify empty
      PerformanceMonitor.clearEvents();
      expect(PerformanceMonitor.getEvents()).toHaveLength(0);

      // Could re-import here if we had an import method
    });
  });

  describe('Statistics aggregation', () => {
    it('should aggregate statistics across multiple journeys', () => {
      // Simulate a real usage pattern
      const journeys = [
        { name: 'page-load', durations: [1000, 1100, 1200, 900, 1050] },
        { name: 'api-call', durations: [150, 200, 180, 220, 160] },
        { name: 'render', durations: [50, 60, 55, 65, 52] },
      ];

      journeys.forEach(({ name, durations }) => {
        durations.forEach((duration) => {
          PerformanceMonitor.trackJourney(name, duration);
        });
      });

      // Verify all journeys tracked
      const allJourneys = PerformanceMonitor.getJourneyNames();
      expect(allJourneys).toHaveLength(3);

      // Get aggregate statistics
      const stats = allJourneys.map((name) => ({
        name,
        stats: PerformanceMonitor.getJourneyStats(name),
      }));

      // Verify each journey has complete stats
      stats.forEach(({ name, stats: journeyStats }) => {
        expect(journeyStats).not.toBeNull();
        expect(journeyStats!.count).toBe(5);
        expect(journeyStats!.p50).toBeGreaterThan(0);
        expect(journeyStats!.p95).toBeGreaterThan(journeyStats!.p50);
      });
    });
  });

  describe('Error scenarios', () => {
    it('should handle errors gracefully during measurements', async () => {
      const failingOperation = async () => {
        throw new Error('Operation failed');
      };

      // Should track duration even when operation fails
      await expect(
        PerformanceMonitor.measureAsync('failing-op', failingOperation)
      ).rejects.toThrow('Operation failed');

      const stats = PerformanceMonitor.getJourneyStats('failing-op');
      expect(stats).not.toBeNull();
      expect(stats!.count).toBe(1);

      const events = PerformanceMonitor.getEvents();
      expect(events[0].error).toBe('Operation failed');
    });
  });

  describe('Performance budgets', () => {
    it('should compare journey percentiles with explicit test thresholds', () => {
      const budgets = {
        'fast-operation': 10,
        'slow-operation': 100,
      };

      // Track operations
      PerformanceMonitor.trackJourney('fast-operation', 5);
      PerformanceMonitor.trackJourney('fast-operation', 8);
      PerformanceMonitor.trackJourney('slow-operation', 120); // Exceeds budget
      PerformanceMonitor.trackJourney('slow-operation', 150); // Exceeds budget

      // Check which journeys exceed budgets
      const journeys = PerformanceMonitor.getJourneyNames();
      const violations: string[] = [];

      journeys.forEach((journey) => {
        const stats = PerformanceMonitor.getJourneyStats(journey);
        const budget = budgets[journey as keyof typeof budgets];

        if (stats && stats.p95 > budget) {
          violations.push(journey);
        }
      });

      expect(violations).toContain('slow-operation');
      expect(violations).not.toContain('fast-operation');
    });
  });
});
