import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { FlapDigit } from './FlapDigit';
import { normalizeFlapValue, shouldAnimateFlapValue } from './Flap.utils';

describe('FlapDigit', () => {
  it('同じ値ではアニメーションを再発火しない', () => {
    expect(shouldAnimateFlapValue('5', '5', false)).toBe(false);
  });

  it('値が変化すると新しい値を表示する', () => {
    const markup = renderToStaticMarkup(<FlapDigit value="6" />);

    expect(markup).toContain('data-value="6"');
  });

  it('prefers-reduced-motion が reduce のときアニメーションを付けない', () => {
    expect(shouldAnimateFlapValue('5', '6', true)).toBe(false);
  });

  it('空文字列は空白表示にフォールバックする', () => {
    expect(normalizeFlapValue('')).toBe(' ');
  });
});
