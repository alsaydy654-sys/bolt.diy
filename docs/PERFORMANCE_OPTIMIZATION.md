# Performance Optimization Guide

This document describes the performance optimization work inspired by Claude.dev's 3x performance sprint.

## Overview

We've implemented a systematic approach to performance optimization focusing on:
- **Measurement** - Track all critical user journeys
- **Lab Benchmarks** - Fast iteration without waiting for deploys
- **Guardrails** - Prevent regressions automatically
- **Hill Climbing** - Continuously improve measurable metrics

## Architecture Changes

### 1. Performance Monitoring Infrastructure

**Location**: `app/utils/performance-monitor.ts`

Tracks key user journeys and metrics:
- Page load time
- Chat initialization
- Message send latency
- File operations
- Core Web Vitals (FCP, LCP, FID, CLS, INP, TTFB)
- Layout shifts
- Long tasks (>50ms)

**Usage**:
```typescript
import { PerformanceMonitor } from '~/utils/performance-monitor';

// Track a journey
await PerformanceMonitor.measureAsync('chat-init', async () => {
  await initializeChat();
});

// Manual measurements
PerformanceMonitor.startMeasurement('file-load');
// ... do work
PerformanceMonitor.endMeasurement('file-load', { fileSize: 1024 });

// Get statistics
const stats = PerformanceMonitor.getJourneyStats('chat-init');
console.log(`P75: ${stats.p75}ms`);
```

### 2. Frame Rate Monitoring

**Location**: `app/utils/frame-rate-monitor.ts`

Monitors requestAnimationFrame intervals during animations and streaming.

Important metric semantics:
- `currentFps` is calculated from observed frame intervals.
- `droppedFrames` counts intervals that exceeded the configured frame budget in the retained sample window; it does not count physically lost display frames.
- The dashboard labels this metric `Over-budget intervals (last 60)` to make its meaning explicit.
- A 60 FPS target corresponds to an approximately 16.67ms frame budget.

```typescript
import { FrameRateMonitor } from '~/utils/frame-rate-monitor';

const monitor = new FrameRateMonitor(60, (fps, droppedFrames) => {
  console.log(`Current FPS: ${fps}, Over-budget intervals: ${droppedFrames}`);
});

monitor.start();
// ... run animations
monitor.stop();

const stats = monitor.getStats();
```

**React Hook** (the `droppedFrames` property is retained for API compatibility and represents over-budget intervals):
```typescript
import { useFrameRateMonitor } from '~/utils/frame-rate-monitor';

function StreamingMessage() {
  const { fps, droppedFrames, stats } = useFrameRateMonitor(60, true);
  
  return <div>FPS: {fps}</div>;
}
```

### 3. Streaming Work Budget Metrics

**Location**: `app/lib/performance/streaming-optimizer.ts`

Streaming work is measured by operation duration, not by actual display-frame timing.

`getStats()` reports:
- `targetFPS` - configured target used to derive the budget.
- `frameBudget` - allowed work duration per operation.
- `overBudgetOperations` - operations exceeding that budget.
- `averageWorkDurationMs` - average measured operation duration.
- `percentOverBudget` - percentage of operations exceeding the budget.

Legacy fields (`droppedFrames`, `averageFrameTime`, and `percentDropped`) remain available for compatibility. They map to work-operation metrics and should not be interpreted as actual dropped display frames.

### 4. Worker-Based Syntax Highlighting

**Location**: 
- `app/workers/syntax-highlighter.worker.ts` - Web worker
- `app/utils/syntax-highlighter-client.ts` - Client interface

Moves expensive syntax highlighting off the main thread to prevent UI blocking during streaming.

**Potential Impact (Unverified)**: A 40-60% reduction in main-thread blocking time is an unvalidated target, not a measured result. Verify it with representative benchmarks.

**Usage**:
```typescript
import { highlightCode } from '~/utils/syntax-highlighter-client';

const html = await highlightCode(
  'console.log("Hello, world!");',
  'javascript'
);
```

**Features**:
- Automatic caching (500 most recent highlights)
- Graceful fallback for unsupported browsers
- Preloaded common languages (JS, TS, Python, HTML, CSS, etc.)
- Request timeout protection (5s)

### 5. Static Composer (Time-to-Typeable)

**Location**: `app/components/chat/StaticComposer.tsx`

Provides an instant-loading input field that captures user input while React loads.

**Potential Impact (Unverified)**: A 200-500ms improvement in time-to-typeable is an unvalidated target, not a measured result. Verify it with representative benchmarks.

**Implementation**:
```typescript
import { useStaticComposerHandoff, generateStaticComposerHTML } from '~/components/chat/StaticComposer';

// In your chat component
function ChatInput() {
  const [value, setValue] = useStaticComposerHandoff('');
  
  return (
    <textarea
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  );
}

// In your HTML template (server-side or build-time)
const staticHTML = generateStaticComposerHTML('How can Bolt help you today?');
```

### 6. Performance Dashboard

**Location**: `app/components/debug/PerformanceDashboard.tsx`

Visual dashboard for viewing performance metrics:
- Journey statistics (P50, P75, P95, P99)
- Live FPS monitoring
- Export/clear data
- Performance ratings

**Usage**:
```typescript
import { PerformanceDashboard } from '~/components/debug/PerformanceDashboard';

// Add to your debug menu or keyboard shortcut
<PerformanceDashboard onClose={() => setShowDashboard(false)} />
```

## Performance Benchmarks

**Location**: `tests/performance/`

Automated performance tests that run in CI:

### Chat Input Benchmarks
- Typing latency (target: <16ms per keystroke)
- Re-render performance
- Message submission processing

### Syntax Highlighting Benchmarks
- Small code blocks (target: <50ms)
- Large code blocks (target: <200ms)
- Streaming/incremental highlighting
- Cache effectiveness

**Run Benchmarks**:
```bash
# Run all benchmarks
pnpm vitest bench

# Run specific benchmark
pnpm vitest bench tests/performance/chat-input.bench.ts

# Run with detailed output
pnpm vitest bench --reporter=verbose
```

## Key User Journeys to Track

These are priority user journeys identified from the application architecture. Their share of total user activity has not been measured.

### 1. App Launch
- Cold start time (web & desktop)
- Time to typeable chat input
- Initial React hydration
- WebContainer initialization (lazy loaded)

**Instrumentation Points**:
```typescript
// In app entry point
PerformanceMonitor.startMeasurement('app-launch');

// When chat input is ready
PerformanceMonitor.endMeasurement('app-launch', {
  isElectron: process.env.IS_ELECTRON,
});
```

### 2. Starting a New Chat
- New conversation initialization
- Editor mount time
- Terminal setup

```typescript
PerformanceMonitor.measureAsync('chat-init', async () => {
  await initializeNewChat();
});
```

### 3. Loading Existing Project
- Conversation state restoration
- File tree rendering
- Editor content loading

```typescript
PerformanceMonitor.measureAsync('project-load', async () => {
  await loadProject(projectId);
}, { fileCount, projectSize });
```

### 4. Sending Messages & Streaming
- Message submission latency
- Streaming token render speed
- Code syntax highlighting during stream
- Terminal output rendering

```typescript
// Track message submission
PerformanceMonitor.startMeasurement('message-send');
await sendMessage(message);
PerformanceMonitor.endMeasurement('message-send');

// Monitor frame rate during streaming
const monitor = new FrameRateMonitor(60);
monitor.start();
// ... streaming happens
monitor.stop();
```

### 5. Code Editing & Preview
- CodeMirror typing latency
- Live preview refresh time
- File switching speed

```typescript
PerformanceMonitor.measureSync('file-switch', () => {
  switchToFile(fileId);
}, { fileSize, language });
```

## Performance Budgets

Target metrics for core journeys (P75):

| Journey | Target | Good | Needs Improvement | Poor |
|---------|--------|------|-------------------|------|
| App Launch → Typeable | <1s | <750ms | <1s | >1s |
| New Chat Init | <300ms | <200ms | <300ms | >300ms |
| Load Existing Project | <1s | <750ms | <1s | >1s |
| Message Send → First Token | <200ms | <150ms | <200ms | >200ms |
| Typing Latency (P95) | <16ms | <10ms | <16ms | >16ms |
| Frame Rate During Stream | 60fps | 60fps | 55-59fps | <55fps |
| Code Highlighting (small) | <50ms | <30ms | <50ms | >50ms |
| File Switching | <100ms | <50ms | <100ms | >100ms |

## Optimization Checklist

### Quick Wins (Week 1)
- [x] Add performance monitoring infrastructure
- [x] Create frame rate monitor
- [x] Move syntax highlighting to web worker
- [x] Create static composer for instant input
- [x] Add performance dashboard
- [x] Set up benchmark suite
- [ ] Integrate static composer into main app
- [ ] Add instrumentation to key journeys
- [ ] Audit and reduce re-renders in hot paths

### Medium-Term (Week 2-3)
- [ ] Lazy load WebContainer (on-demand initialization)
- [ ] Implement prefetch on hover (conversations, files)
- [ ] Optimize CodeMirror extensions (load on-demand)
- [ ] Add terminal output throttling
- [ ] Bundle size optimization (code splitting)
- [ ] Reduce dependency weight (evaluate alternatives)

### Long-Term (Week 4+)
- [ ] Create CI performance gates
- [ ] Set up nightly performance reports
- [ ] Add RUM (Real User Monitoring) aggregation
- [ ] Electron-specific optimizations (V8 cache, preload)
- [ ] 120fps target for high-refresh displays
- [ ] Advanced caching strategies

## CI Integration

Add performance checks to your CI pipeline:

```yaml
# .github/workflows/performance.yml
name: Performance Tests

on: [pull_request]

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - name: Install dependencies
        run: pnpm install
      - name: Run benchmarks
        run: pnpm vitest bench --reporter=json > bench-results.json
      - name: Compare with baseline
        run: node scripts/compare-benchmarks.js
      - name: Comment on PR
        # Post results as PR comment
```

## Debugging Performance Issues

### Using the Performance Dashboard

1. Enable dev mode
2. Press `Ctrl/Cmd + Shift + P` to open command palette
3. Search for "Performance Dashboard"
4. View live metrics and statistics

### Browser DevTools Integration

The performance monitoring is compatible with Chrome DevTools:

1. Open DevTools → Performance tab
2. Record while using the app
3. Look for custom user timings (your journey names)
4. Correlate with React profiler

### Exporting Data

```typescript
// Export performance data
const data = PerformanceMonitor.exportEvents();
console.log(data); // JSON format

// Get specific journey stats
const chatStats = PerformanceMonitor.getJourneyStats('chat-init');
console.table(chatStats);
```

## Best Practices

### 1. Measure Before Optimizing
Always establish a baseline before making changes:
```typescript
const before = PerformanceMonitor.getJourneyStats('operation');
// ... make optimization
const after = PerformanceMonitor.getJourneyStats('operation');
console.log(`Improvement: ${before.p75 - after.p75}ms`);
```

### 2. Use Web Workers for Heavy Computation
Move expensive operations off the main thread:
- Syntax highlighting ✅
- Large file parsing
- Complex calculations
- Image processing

### 3. Implement Caching Strategically
Cache expensive operations:
```typescript
const cache = new Map();
function expensiveOperation(input) {
  if (cache.has(input)) return cache.get(input);
  const result = /* expensive work */;
  cache.set(input, result);
  return result;
}
```

### 4. Lazy Load Non-Critical Code
```typescript
// Instead of eager import
import { HeavyComponent } from './Heavy';

// Use lazy loading
const HeavyComponent = lazy(() => import('./Heavy'));
```

### 5. Monitor in Production
Keep lightweight monitoring in production:
```typescript
if (Math.random() < 0.01) { // 1% sampling
  PerformanceMonitor.trackJourney(name, duration);
}
```

## Resources

- [Claude.dev Performance Blog Post](https://claude.dev/blog/how-we-made-claude-ai-faster/)
- [Web Vitals Documentation](https://web.dev/vitals/)
- [Shiki Documentation](https://shiki.style/)
- [Vitest Benchmarking](https://vitest.dev/guide/features.html#benchmarking)

## Contributing

When adding new features:

1. **Instrument**: Add performance tracking
2. **Benchmark**: Create lab tests
3. **Budget**: Define acceptable thresholds
4. **Guard**: Add CI checks to prevent regression

## Questions?

Check existing journey statistics:
```typescript
PerformanceMonitor.getJourneyNames().forEach(name => {
  const stats = PerformanceMonitor.getJourneyStats(name);
  console.log(`${name}: ${stats.p75}ms (P75)`);
});
```


## Local Performance Review Record — 2026-11-26

This record documents the local validation performed in the Android Termux environment. It is not a claim of successful Linux CI execution or production-device performance.

### Changes reviewed

- Clarified frame-rate metric terminology in the Performance Dashboard.
- Updated `StreamingOptimizer` metrics to distinguish work-operation duration from display-frame timing.
- Added focused unit and integration coverage for streaming and frame-rate monitoring.
- Updated performance tests to use the explicit work-budget metric names.

### Recorded local test results

The following targeted tests passed in individual or sequential local runs:

| Test area | Result |
|---|---:|
| Full sequential Vitest suite | 709/709 |
| Performance monitoring integration | 9/9 |
| Streaming optimizer unit tests | 4/4 |
| Frame-rate monitor unit tests | 12/12 |
| Streaming performance tests | 9/9 |
| Core journey performance tests | 10/10 |
| Syntax highlighting performance tests | 4/4 |

Type checking also passed in a previous local run.

### Environment and interpretation limits

- Environment: Android / Termux.
- Dependency installation required `pnpm install --frozen-lockfile --ignore-scripts` because the `workerd` postinstall package does not support Android.
- Some performance tests showed timing variability when run concurrently; sequential execution avoided the observed contention-related failures.
- The simulated streaming test results are lab/test measurements, not proof of sustained real-device 60 FPS.
- The deterministic frame-rate integration test validates the monitor's calculations against simulated 60 FPS timestamps; it is not a physical display benchmark.
- Linux CI, production workloads, and real-device performance remain unverified by this review.

## Local Performance Review Record — 2026-11-27

This is a follow-up record to the 2026-11-26 review. Previous records remain unchanged.

### Updated validation results

| Test area | Result |
|---|---:|
| Full sequential Vitest suite (latest recorded full run) | 741/741 |
| Performance monitoring integration | 9/9 |
| Streaming optimizer unit tests | 6/6 |
| Frame-rate monitor unit tests | 17/17 |
| Streaming performance tests | 9/9 |
| Core journey performance tests | 10/10 |
| Syntax highlighting performance tests | 4/4 |

The targeted test results above were obtained in separate local runs. They should not be interpreted as one combined test execution.

Type checking and `git diff --check` passed in previous local validation runs.

### Validation limitations

- Environment: Android / Termux.
- The full local build remains unverified because the `workerd` dependency does not support Android ARM64.
- Linux CI execution has not yet been verified.
- Production deployment and real-device performance have not been verified.
- Performance test timings are local observations, not universal performance guarantees.
- The 741/741 result is the latest recorded full-suite result, not a claim that the full suite was rerun after every subsequent targeted test.
