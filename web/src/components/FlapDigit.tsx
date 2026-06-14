import { useEffect, useRef, useState } from 'react';

import './Flap.css';
import {
  normalizeFlapValue,
  prefersReducedMotion,
  shouldAnimateFlapValue,
} from './Flap.utils';

interface FlapDigitProps {
  value: string;
  className?: string;
}

export function FlapDigit({ value, className }: FlapDigitProps) {
  const normalizedValue = normalizeFlapValue(value);
  const previousValueRef = useRef(normalizedValue);
  const frameRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const [displayValue, setDisplayValue] = useState(normalizedValue);
  const [previousValue, setPreviousValue] = useState(normalizedValue);
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationCount, setAnimationCount] = useState(0);

  useEffect(() => {
    if (previousValueRef.current === normalizedValue) {
      setDisplayValue(normalizedValue);
      return undefined;
    }

    const oldValue = previousValueRef.current;
    previousValueRef.current = normalizedValue;
    setPreviousValue(oldValue);
    setDisplayValue(normalizedValue);

    if (!shouldAnimateFlapValue(oldValue, normalizedValue, prefersReducedMotion())) {
      setIsAnimating(false);
      return undefined;
    }

    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
    }
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }

    frameRef.current = window.requestAnimationFrame(() => {
      setIsAnimating(true);
      setAnimationCount((count) => count + 1);
      timeoutRef.current = window.setTimeout(() => {
        setIsAnimating(false);
        timeoutRef.current = null;
      }, 520);
      frameRef.current = null;
    });

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [normalizedValue]);

  const classes = [
    'flap-digit',
    isAnimating ? 'flap-digit--animating' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span
      className={classes}
      data-animating={isAnimating ? 'true' : 'false'}
      data-animation-count={animationCount}
      data-value={displayValue}
    >
      <span className="flap-panel flap-top" aria-hidden="true">
        <span>{displayValue}</span>
      </span>
      <span className="flap-panel flap-bottom" aria-hidden="true">
        <span>{displayValue}</span>
      </span>
      <span className="flap-panel flap-top flap-top-previous" aria-hidden="true">
        <span>{previousValue}</span>
      </span>
      <span className="flap-panel flap-bottom flap-bottom-next" aria-hidden="true">
        <span>{displayValue}</span>
      </span>
      <span className="flap-digit-reader">{displayValue}</span>
    </span>
  );
}
