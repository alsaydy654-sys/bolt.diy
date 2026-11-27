/**
 * Bundle Size Analyzer
 * Uses Vite's production manifest.
 * Never reports an unverified category as measured.
 */

import {
  existsSync,
  readFileSync,
} from 'node:fs';
import {
  join,
  resolve,
  sep,
} from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const BUILD_DIR = join(process.cwd(), 'build', 'client');
const MANIFEST_FILE = join(BUILD_DIR, '.vite', 'manifest.json');
const BUDGETS_FILE = join(process.cwd(), '.performance-budgets.json');

const REQUIRED_BUDGETS = [
  'main-bundle',
  'vendor-bundle',
  'webcontainer-api',
];

const JS_PATTERN = /\.m?js$/i;

export function getFileSize(filePath) {
  const content = readFileSync(filePath);
  return {
    raw: content.length,
    gzipped: gzipSync(content).length,
  };
}

export function formatSize(bytes) {
  return `${(bytes / 1024).toFixed(2)} KB`;
}

function isJavaScriptFile(file) {
  return typeof file === 'string' && JS_PATTERN.test(file);
}

function getManifestFilePath(buildDir, file) {
  const root = resolve(buildDir);
  const target = resolve(root, file);

  if (!target.startsWith(`${root}${sep}`)) {
    throw new Error(`Manifest file escapes build directory: ${file}`);
  }

  return target;
}

function getEntryIdentity(key, entry) {
  return [
    key,
    entry.src,
    entry.name,
    entry.file,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function classifyManifestEntry(key, entry) {
  // Only the manifest entry point is measured.
  // Vendor and WebContainer require verified chunk-level evidence.
  if (entry.isEntry === true) {
    return 'main-bundle';
  }

  return null;
}

export function analyzeManifest(manifest, buildDir) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Invalid Vite manifest: expected an object');
  }

  const entries = Object.entries(manifest).filter(
    ([, entry]) =>
      entry &&
      typeof entry === 'object' &&
      isJavaScriptFile(entry.file),
  );

  if (entries.length === 0) {
    throw new Error('Manifest contains no JavaScript bundle entries');
  }

  const mainEntries = entries.filter(([, entry]) => entry.isEntry === true);

  const measurements = Object.fromEntries(
    REQUIRED_BUDGETS.map((name) => [name, null]),
  );

  const unmatchedBundles = [];
  const assignedFiles = new Map();

  for (const [key, entry] of entries) {
    const category = classifyManifestEntry(key, entry);

    if (!category) {
      unmatchedBundles.push(entry.file);
      continue;
    }

    if (category === 'main-bundle' && mainEntries.length !== 1) {
      unmatchedBundles.push(entry.file);
      continue;
    }

    const previousCategory = assignedFiles.get(entry.file);

    if (previousCategory) {
      throw new Error(
        `Bundle assigned more than once: ${entry.file} (${previousCategory}, ${category})`,
      );
    }

    const filePath = getManifestFilePath(buildDir, entry.file);

    if (!existsSync(filePath)) {
      throw new Error(`Manifest references missing bundle: ${entry.file}`);
    }

    const size = getFileSize(filePath);

    assignedFiles.set(entry.file, category);

    if (!measurements[category]) {
      measurements[category] = {
        bundle: entry.file,
        ...size,
      };
    } else {
      // Multiple chunks in one category are aggregated without duplication.
      measurements[category].raw += size.raw;
      measurements[category].gzipped += size.gzipped;
      measurements[category].bundle += `, ${entry.file}`;
    }
  }

  return {
    measurements,
    unmatchedBundles: [...new Set(unmatchedBundles)],
    manifestJavaScriptFiles: entries.map(([, entry]) => entry.file),
  };
}

export function checkAgainstBudgets(analysis, budgets) {
  const bundleBudgets = budgets?.budgets?.['bundle-size'];

  if (!bundleBudgets || typeof bundleBudgets !== 'object') {
    throw new Error('Missing bundle-size budget configuration');
  }

  const results = REQUIRED_BUDGETS.map((name) => {
    const budgetEntry = bundleBudgets[name];
    const measurement = analysis.measurements[name];

    if (
      !budgetEntry ||
      typeof budgetEntry.budget !== 'number' ||
      !Number.isFinite(budgetEntry.budget) ||
      budgetEntry.budget <= 0
    ) {
      throw new Error(`Invalid or missing budget: ${name}`);
    }

    if (!measurement) {
      return {
        budgetName: name,
        status: 'NOT MEASURED',
        measured: false,
        withinBudget: false,
        size: null,
        budget: budgetEntry.budget,
        unit: budgetEntry.unit,
      };
    }

    const sizeKB = measurement.gzipped / 1024;

    return {
      budgetName: name,
      status: sizeKB <= budgetEntry.budget ? 'PASS' : 'FAIL',
      measured: true,
      withinBudget: sizeKB <= budgetEntry.budget,
      bundle: measurement.bundle,
      size: sizeKB,
      budget: budgetEntry.budget,
      unit: budgetEntry.unit,
      difference: sizeKB - budgetEntry.budget,
    };
  });

  const failures = results.filter(
    (result) => !result.measured || !result.withinBudget,
  );

  return {
    results,
    failures,
    success:
      failures.length === 0 &&
      analysis.unmatchedBundles.length === 0,
  };
}

export function generateReport({
  buildDir = BUILD_DIR,
  manifestFile = join(buildDir, '.vite', 'manifest.json'),
  budgetsFile = BUDGETS_FILE,
  logger = console,
} = {}) {
  logger.log('\n=== Manifest-Based Bundle Analysis ===\n');

  try {
    if (!existsSync(manifestFile)) {
      throw new Error(`Vite manifest not found: ${manifestFile}`);
    }

    if (!existsSync(budgetsFile)) {
      throw new Error(`Performance budgets file not found: ${budgetsFile}`);
    }

    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
    const budgets = JSON.parse(readFileSync(budgetsFile, 'utf8'));

    const analysis = analyzeManifest(manifest, buildDir);
    const compliance = checkAgainstBudgets(analysis, budgets);

    logger.log('=== Required Budget Measurements ===');

    for (const result of compliance.results) {
      if (!result.measured) {
        logger.error(`NOT MEASURED: ${result.budgetName}`);
        continue;
      }

      const status = result.withinBudget ? 'PASS' : 'FAIL';

      logger.log(
        `${status}: ${result.budgetName}: ${formatSize(result.size * 1024)} / ${result.budget} KB`,
      );

      if (!result.withinBudget) {
        logger.error(
          `Exceeded by ${formatSize(result.difference * 1024)}`,
        );
      }
    }

    if (analysis.unmatchedBundles.length > 0) {
      logger.error('\n=== Unclassified JavaScript Bundles ===');

      for (const file of analysis.unmatchedBundles) {
        logger.error(`NOT CLASSIFIED: ${file}`);
      }
    }

    logger.log(
      `\nManifest JavaScript files: ${analysis.manifestJavaScriptFiles.length}`,
    );

    logger.log(
      `Unclassified files: ${analysis.unmatchedBundles.length}`,
    );

    if (compliance.success) {
      logger.log('\nAll required bundle budgets were measured and passed.');
    } else {
      logger.error(
        '\nBundle analysis failed: measurements are incomplete or exceeded budgets.',
      );
    }

    return {
      ...compliance,
      unmatchedBundles: analysis.unmatchedBundles,
      manifestJavaScriptFiles: analysis.manifestJavaScriptFiles,
    };
  } catch (error) {
    logger.error('Error analyzing bundles:', error.message);

    return {
      success: false,
      error: error.message,
      results: [],
      failures: [],
      unmatchedBundles: [],
      manifestJavaScriptFiles: [],
    };
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const report = generateReport();

  if (!report.success) {
    process.exitCode = 1;
  }
}
