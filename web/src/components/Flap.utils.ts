export function normalizeFlapValue(value: string): string {
  return value.length > 0 ? value.slice(0, 1) : ' ';
}

export function normalizeFlapText(text: string): string {
  return text.length > 0 ? text : ' ';
}

export function isAnimatedFlapCharacter(character: string): boolean {
  return /^\d$/.test(character);
}

export function shouldAnimateFlapValue(
  previousValue: string,
  nextValue: string,
  isReducedMotion: boolean
): boolean {
  return previousValue !== nextValue && !isReducedMotion;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || window.matchMedia === undefined) {
    return false;
  }

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
