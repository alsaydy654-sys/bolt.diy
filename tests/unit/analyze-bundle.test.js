import { afterEach, describe, expect, it, vi } from 'vitest';

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { analyzeManifest, checkAgainstBudgets, generateReport } from '../../scripts/analyze-bundle.js';

const REQUIRED_BUDGETS = {
  'main-bundle': { budget: 500, unit: 'kb' },
  'vendor-bundle': { budget: 300, unit: 'kb' },
  'webcontainer-api': { budget: 200, unit: 'kb' },
};

describe('Manifest-Based Bundle Analyzer', () => {
  let tempDirs = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }

    tempDirs = [];
    vi.restoreAllMocks();
  });

  function createTempDir() {
    const dir = mkdtempSync(join(tmpdir(), 'manifest-analyzer-'));
    tempDirs.push(dir);
    return dir;
  }

  function writeBundle(buildDir, file, content = 'test bundle') {
    const path = join(buildDir, file);

    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, content);

    return path;
  }

  function createBudgets() {
    return {
      budgets: {
        'bundle-size': structuredClone(REQUIRED_BUDGETS),
      },
    };
  }

  function createCompleteManifest(buildDir) {
    writeBundle(buildDir, 'assets/entry.js', 'main entry');
    writeBundle(buildDir, 'assets/vendor-react.js', 'vendor chunk');
    writeBundle(buildDir, 'assets/webcontainer-api.js', 'webcontainer chunk');

    return {
      'app/entry.client.tsx': {
        file: 'assets/entry.js',
        name: 'entry',
        isEntry: true,
        imports: ['_vendor.js'],
      },
      '_vendor.js': {
        file: 'assets/vendor-react.js',
        name: 'vendor',
        isEntry: false,
      },
      'node_modules/@webcontainer/api/index.js': {
        file: 'assets/webcontainer-api.js',
        name: 'webcontainer-api',
        isEntry: false,
      },
    };
  }

  it('measures only the entry point when other categories are unverified', () => {
    const dir = createTempDir();
    const manifest = createCompleteManifest(dir);

    const result = analyzeManifest(manifest, dir);

    expect(result.measurements['main-bundle']).not.toBeNull();
    expect(result.measurements['vendor-bundle']).toBeNull();
    expect(result.measurements['webcontainer-api']).toBeNull();
    expect(result.unmatchedBundles).toEqual(['assets/vendor-react.js', 'assets/webcontainer-api.js']);
  });

  it('does not infer vendor or WebContainer from unrelated dependencies', () => {
    const dir = createTempDir();

    writeBundle(dir, 'assets/entry.js');
    writeBundle(dir, 'assets/chunk-a.js');

    const result = analyzeManifest(
      {
        'app/entry.client.tsx': {
          file: 'assets/entry.js',
          isEntry: true,
        },
        'app/lib/webcontainer/index.ts': {
          file: 'assets/chunk-a.js',
          isEntry: false,
        },
      },
      dir,
    );

    expect(result.measurements['main-bundle']).not.toBeNull();
    expect(result.measurements['vendor-bundle']).toBeNull();
    expect(result.measurements['webcontainer-api']).toBeNull();
  });

  it('does not classify arbitrary chunks as vendor bundles', () => {
    const dir = createTempDir();

    writeBundle(dir, 'assets/entry.js');
    writeBundle(dir, 'assets/chunk-a.js');

    const result = analyzeManifest(
      {
        'app/entry.client.tsx': {
          file: 'assets/entry.js',
          isEntry: true,
        },
        'app/shared.ts': {
          file: 'assets/chunk-a.js',
        },
      },
      dir,
    );

    expect(result.measurements['vendor-bundle']).toBeNull();
    expect(result.unmatchedBundles).toContain('assets/chunk-a.js');
  });

  it('does not claim a main bundle when multiple entry points exist', () => {
    const dir = createTempDir();

    writeBundle(dir, 'assets/entry-a.js');
    writeBundle(dir, 'assets/entry-b.js');

    const result = analyzeManifest(
      {
        'entry-a.tsx': {
          file: 'assets/entry-a.js',
          isEntry: true,
        },
        'entry-b.tsx': {
          file: 'assets/entry-b.js',
          isEntry: true,
        },
      },
      dir,
    );

    expect(result.measurements['main-bundle']).toBeNull();
    expect(result.unmatchedBundles).toHaveLength(2);
  });

  it('rejects manifest paths outside the build directory', () => {
    const dir = createTempDir();

    expect(() =>
      analyzeManifest(
        {
          'entry.tsx': {
            file: '../outside.js',
            isEntry: true,
          },
        },
        dir,
      ),
    ).toThrow('escapes build directory');
  });

  it('rejects missing files referenced by the manifest', () => {
    const dir = createTempDir();

    expect(() =>
      analyzeManifest(
        {
          'entry.tsx': {
            file: 'assets/missing.js',
            isEntry: true,
          },
        },
        dir,
      ),
    ).toThrow('references missing bundle');
  });

  it('reports required categories as NOT MEASURED', () => {
    const result = checkAgainstBudgets(
      {
        measurements: {
          'main-bundle': null,
          'vendor-bundle': null,
          'webcontainer-api': null,
        },
        unmatchedBundles: [],
      },
      createBudgets(),
    );

    expect(result.success).toBe(false);
    expect(result.results).toHaveLength(3);
    expect(result.results.every((item) => item.status === 'NOT MEASURED')).toBe(true);
  });

  it('fails when a measured category exceeds its unchanged budget', () => {
    const result = checkAgainstBudgets(
      {
        measurements: {
          'main-bundle': {
            bundle: 'assets/entry.js',
            raw: 1000,
            gzipped: 600 * 1024,
          },
          'vendor-bundle': null,
          'webcontainer-api': null,
        },
        unmatchedBundles: [],
      },
      createBudgets(),
    );

    expect(result.success).toBe(false);
    expect(result.results[0].status).toBe('FAIL');
    expect(result.failures.map((item) => item.budgetName)).toContain('main-bundle');
  });

  it('fails when any JavaScript bundle remains unclassified', () => {
    const result = checkAgainstBudgets(
      {
        measurements: {
          'main-bundle': {
            bundle: 'assets/entry.js',
            raw: 100,
            gzipped: 100,
          },
          'vendor-bundle': {
            bundle: 'assets/vendor.js',
            raw: 100,
            gzipped: 100,
          },
          'webcontainer-api': {
            bundle: 'assets/webcontainer.js',
            raw: 100,
            gzipped: 100,
          },
        },
        unmatchedBundles: ['assets/unknown.js'],
      },
      createBudgets(),
    );

    expect(result.success).toBe(false);
  });

  it('fails when the Vite manifest is missing', () => {
    const dir = createTempDir();
    const logger = { log: vi.fn(), error: vi.fn() };

    const report = generateReport({
      buildDir: dir,
      manifestFile: join(dir, '.vite', 'manifest.json'),
      budgetsFile: join(dir, 'budgets.json'),
      logger,
    });

    expect(report.success).toBe(false);
    expect(report.error).toContain('manifest not found');
  });

  it('fails when the manifest has no JavaScript entries', () => {
    const dir = createTempDir();

    expect(() => analyzeManifest({ 'style.css': { file: 'style.css' } }, dir)).toThrow('no JavaScript bundle entries');
  });
  it('passes when all required measurements are complete and within budget', () => {
    const result = checkAgainstBudgets(
      {
        measurements: {
          'main-bundle': {
            bundle: 'assets/entry.js',
            raw: 1000,
            gzipped: 100 * 1024,
          },
          'vendor-bundle': {
            bundle: 'assets/vendor.js',
            raw: 800,
            gzipped: 100 * 1024,
          },
          'webcontainer-api': {
            bundle: 'assets/webcontainer.js',
            raw: 500,
            gzipped: 100 * 1024,
          },
        },
        unmatchedBundles: [],
      },
      createBudgets(),
    );

    expect(result.success).toBe(true);
    expect(result.failures).toHaveLength(0);
    expect(result.results.every((item) => item.measured)).toBe(true);
    expect(result.results.every((item) => item.withinBudget)).toBe(true);
  });
});
