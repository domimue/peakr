import common from '@peakr/i18n/locales/en/common.json';
import plan from '@peakr/i18n/locales/en/plan.json';
import type { Translate } from '@peakr/quiz';

import { interpolate } from '.';

/**
 * Translator for the shared quiz, forecast and workout texts – the same keys and the same i18next
 * conventions the app uses: dotted keys, `{{name}}` placeholders, `count` picks `_one` / `_other`,
 * `defaultValue` when a key is missing (otherwise the key itself, like i18next).
 */

export type Tree = { readonly [key: string]: string | Tree | readonly unknown[] };

/** Common + quiz/plan texts (the quiz runs in the browser; exercise names: `./workouts`). */
export const PLAN_TREE: Tree = { ...(common as Tree), ...(plan as Tree) };

const plural = new Intl.PluralRules('en');

function lookup(tree: Tree, key: string): unknown {
  let node: unknown = tree;
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object' || Array.isArray(node)) return undefined;
    node = (node as Tree)[part];
  }
  return node;
}

/** A translate function over `tree` (the shared texts by default; a tree is passed in tests). */
export function createTranslate(tree: Tree = PLAN_TREE): Translate {
  return (key, params = {}) => {
    const count = params.count;
    let value: unknown;
    if (typeof count === 'number') {
      value =
        lookup(tree, `${key}_${count === 0 ? 'zero' : plural.select(count)}`) ??
        lookup(tree, `${key}_${plural.select(count)}`) ??
        lookup(tree, `${key}_other`);
    }
    value ??= lookup(tree, key);
    if (typeof value !== 'string') {
      const fallback = params.defaultValue;
      return typeof fallback === 'string' ? fallback : key;
    }
    const values: Record<string, string | number> = {};
    for (const [name, v] of Object.entries(params)) {
      if (typeof v === 'string' || typeof v === 'number') values[name] = v;
    }
    return interpolate(value, values);
  };
}

export const t = createTranslate();
