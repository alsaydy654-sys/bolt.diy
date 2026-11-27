import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkBudget,
  generateReport,
} from '../../scripts/check-performance-budgets.js';

describe('Performance Budget Checker', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkBudget', () => {
    it('passes when actual is below budget', () => {
      const result = checkBudget(
        'core-journeys',
        'composer-typeable',
        89,
        100,
        'ms',
      );

      expect(result.passed).toBe(true);
      expect(result.actual).toBe(89);
      expect(result.budget).toBe(100);
      expect(result.improvement).toBe(11);
    });

    it('passes when actual equals budget', () => {
      const result = checkBudget(
        'core-journeys',
        'composer-typeable',
        100,
        100,
        'ms',
      );

      expect(result.passed).toBe(true);
      expect(result.improvement).toBeUndefined();
    });

    it('allows the configured 2% tolerance', () => {
      const result = checkBudget(
        'core-journeys',
        'composer-typeable',
        102,
        100,
        'ms',
      );

      expect(result.passed).toBe(true);
    });

    it('fails when actual exceeds budget by more than 2%', () => {
      const result = checkBudget(
        'core-journeys',
        'composer-typeable',
        103,
        100,
        'ms',
      );

      expect(result.passed).toBe(false);
      expect(result.exceeded).toBe(3);
      expect(result.message).toContain('exceeds budget');
    });
  });

  describe('generateReport', () => {
    it('returns true when all checks pass', () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = generateReport([
        {
          passed: true,
          category: 'core-journeys',
          name: 'composer-typeable',
          actual: 90,
          budget: 100,
          unit: 'ms',
          message: 'Passed',
        },
      ]);

      expect(result).toBe(true);
    });

    it('returns false when at least one check fails', () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = generateReport([
        {
          passed: true,
          category: 'core-journeys',
          name: 'composer-typeable',
          actual: 90,
          budget: 100,
          unit: 'ms',
          message: 'Passed',
        },
        {
          passed: false,
          category: 'component-performance',
          name: 'message-render',
          actual: 60,
          budget: 50,
          unit: 'ms',
          message: 'Failed',
        },
      ]);

      expect(result).toBe(false);
    });
  });
});

  describe('loadBudgets', () => {
    it('loads the real performance budget configuration', async () => {
      const { loadBudgets } = await import(
        '../../scripts/check-performance-budgets.js'
      );

      const config = loadBudgets();

      expect(config.version).toBe('1.0.0');
      expect(config.budgets['core-journeys']['composer-typeable'].budget).toBe(100);
      expect(config.budgets['component-performance']['message-render'].budget).toBe(50);
    });
  });

  describe('runBudgetCheck', () => {
    it('must not silently accept metrics without matching budgets', async () => {
      const { runBudgetCheck } = await import(
        '../../scripts/check-performance-budgets.js'
      );

      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((() => undefined) as never);

      vi.spyOn(console, 'log').mockImplementation(() => {});

      runBudgetCheck({
        'unknown-category': {
          'unknown-metric': 100,
        },
      });

      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });
