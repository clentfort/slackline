/**
 * Shared utility functions for browser-side execution in Playwright's evaluate/evaluateAll.
 * These are exported as strings to be easily injected into the browser context.
 */

export const BROWSER_HELPERS = {
  normalize: `(value) => (value ?? '').replace(/\\s+/g, ' ').trim()`,
  parseUnixSeconds: `(value) => {
    const numeric = Number.parseFloat((value ?? '').trim());
    return Number.isFinite(numeric) ? numeric : undefined;
  }`,
};
