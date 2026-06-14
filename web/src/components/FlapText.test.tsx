import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { FlapText } from './FlapText';
import { isAnimatedFlapCharacter, normalizeFlapText } from './Flap.utils';

function countOccurrences(text: string, pattern: string): number {
  return text.split(pattern).length - 1;
}

describe('FlapText', () => {
  it('桁数が変わると桁数に応じて表示を増減する', () => {
    const oneDigit = renderToStaticMarkup(<FlapText text="5" />);
    const twoDigits = renderToStaticMarkup(<FlapText text="12" />);

    expect(countOccurrences(oneDigit, 'data-animating=')).toBe(1);
    expect(countOccurrences(twoDigits, 'data-animating=')).toBe(2);
  });

  it('コロンは固定桁として扱う', () => {
    const markup = renderToStaticMarkup(<FlapText text="12:34" />);

    expect(isAnimatedFlapCharacter(':')).toBe(false);
    expect(markup).toContain('data-fixed="true"');
    expect(markup).toContain('data-value=":"');
    expect(countOccurrences(markup, 'data-animating=')).toBe(4);
  });

  it('非数値文字は固定桁として表示する', () => {
    const markup = renderToStaticMarkup(<FlapText text="A5" />);

    expect(isAnimatedFlapCharacter('A')).toBe(false);
    expect(markup).toContain('data-value="A"');
    expect(countOccurrences(markup, 'data-animating=')).toBe(1);
  });

  it('空文字列は空白の固定桁にフォールバックする', () => {
    const markup = renderToStaticMarkup(<FlapText text="" />);

    expect(normalizeFlapText('')).toBe(' ');
    expect(markup).toContain('data-fixed="true"');
    expect(markup).toContain('data-value=" "');
  });
});
