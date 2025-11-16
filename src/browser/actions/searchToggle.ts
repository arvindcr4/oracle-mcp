import type { ChromeClient, BrowserLogger } from '../types.js';

type SearchToggleResult =
  | { status: 'already-on'; label?: string | null }
  | { status: 'toggled-on'; label?: string | null }
  | { status: 'not-found' }
  | { status: 'error'; message?: string };

export async function ensureSearchEnabled(
  Runtime: ChromeClient['Runtime'],
  logger: BrowserLogger,
): Promise<void> {
  const outcome = await Runtime.evaluate({
    expression: buildSearchToggleExpression(),
    awaitPromise: false,
    returnByValue: true,
  });

  const result = outcome.result?.value as SearchToggleResult | undefined;

  switch (result?.status) {
    case 'already-on': {
      if (result.label) {
        logger(`Search toggle already on (${result.label}).`);
      } else {
        logger('Search toggle already on.');
      }
      return;
    }
    case 'toggled-on': {
      if (result.label) {
        logger(`Search toggle enabled (${result.label}).`);
      } else {
        logger('Search toggle enabled.');
      }
      return;
    }
    case 'not-found': {
      logger('Search toggle not found in ChatGPT UI; continuing without forcing search.');
      return;
    }
    case 'error':
    default: {
      if (result?.message) {
        logger(`Search toggle error: ${result.message}; continuing without forcing search.`);
      } else {
        logger('Search toggle error; continuing without forcing search.');
      }
    }
  }
}

function buildSearchToggleExpression(): string {
  return `(() => {
    const KEYWORDS = ['search', 'web search', 'browse', 'browsing'];
    const SELECTORS = [
      'button',
      '[role="switch"]',
      '[data-testid]',
      '[aria-pressed]',
      '[aria-checked]'
    ];

    const normalizeText = (value) => {
      if (!value) return '';
      return String(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\\s+/g, ' ')
        .trim();
    };

    const isOn = (el) => {
      if (!(el instanceof HTMLElement)) return false;
      const ariaPressed = el.getAttribute('aria-pressed');
      const ariaChecked = el.getAttribute('aria-checked');
      const dataState = (el.getAttribute('data-state') || '').toLowerCase();
      if (ariaPressed === 'true' || ariaChecked === 'true') return true;
      if (['on', 'true', 'checked', 'selected', 'active'].includes(dataState)) return true;
      return false;
    };

    const getLabel = (el) => {
      if (!(el instanceof HTMLElement)) return '';
      const ariaLabel = el.getAttribute('aria-label') || '';
      const testId = el.getAttribute('data-testid') || '';
      const text = el.textContent || '';
      const best = ariaLabel || text || testId;
      return best.trim();
    };

    try {
      const candidates = new Set();
      for (const selector of SELECTORS) {
        document.querySelectorAll(selector).forEach((el) => candidates.add(el));
      }
      let best = null;
      for (const node of candidates) {
        if (!(node instanceof HTMLElement)) continue;
        const text = normalizeText(node.textContent || '');
        const ariaLabel = normalizeText(node.getAttribute('aria-label') || '');
        const testId = normalizeText(node.getAttribute('data-testid') || '');
        const haystack = text + ' ' + ariaLabel + ' ' + testId;
        if (!haystack) continue;
        const matches = KEYWORDS.some((kw) => haystack.includes(normalizeText(kw)));
        if (matches) {
          best = node;
          break;
        }
      }

      if (!best) {
        return { status: 'not-found' };
      }

      const label = getLabel(best);
      if (isOn(best)) {
        return { status: 'already-on', label };
      }

      best.click();
      return { status: 'toggled-on', label };
    } catch (error) {
      return { status: 'error', message: error instanceof Error ? error.message : String(error) };
    }
  })()`;
}

