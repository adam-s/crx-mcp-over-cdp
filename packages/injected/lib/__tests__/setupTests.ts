// setupTests.ts
import { vi } from 'vitest';

// Mock window.requestAnimationFrame
globalThis.requestAnimationFrame = callback => {
  return setTimeout(() => {
    callback(performance.now());
  }, 16) as unknown as number; // Simulate a frame delay of ~16ms
};

// Mock window.cancelAnimationFrame
globalThis.cancelAnimationFrame = id => {
  clearTimeout(id);
};

// Ensure performance.now is available
if (!globalThis.performance) {
  globalThis.performance = {
    now: () => Date.now(),
    timeOrigin: Date.now(),
    timing: {} as PerformanceTiming,
    navigation: {} as PerformanceNavigation,
    clearMarks: () => {},
    clearMeasures: () => {},
    clearResourceTimings: () => {},
    getEntries: () => [],
    getEntriesByName: () => [],
    getEntriesByType: () => [],
    mark: (markName: string, markOptions?: PerformanceMarkOptions) => {
      return {
        name: markName,
        entryType: 'mark',
        startTime: performance.now(),
        duration: 0,
        toJSON: () => ({}),
      } as PerformanceMark;
    },
    measure: (measureName: string, startOrMeasureOptions?: string | PerformanceMeasureOptions, endMark?: string) => {
      return {
        name: measureName,
        entryType: 'measure',
        startTime: performance.now(),
        duration: 0,
        toJSON: () => ({}),
      } as PerformanceMeasure;
    },
    setResourceTimingBufferSize: () => {},
    toJSON: () => ({}),
    eventCounts: {} as any,
    onresourcetimingbufferfull: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  };
}

// Mock IntersectionObserver if needed
class MockIntersectionObserver implements IntersectionObserver {
  root: Element | null = null;
  rootMargin: string = '';
  thresholds: ReadonlyArray<number> = [];

  constructor(private callback: IntersectionObserverCallback) {}

  observe() {
    // Simulate immediate intersection
    this.callback([{ isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry], this);
  }

  unobserve() {}

  disconnect() {}

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

globalThis.IntersectionObserver = MockIntersectionObserver;

// Mock getComputedStyle if necessary
if (!globalThis.getComputedStyle) {
  globalThis.getComputedStyle = element => {
    return {
      getPropertyValue: prop => {
        return ''; // Return default styles as needed
      },
    } as CSSStyleDeclaration;
  };
}
