import { FlapDigit } from './FlapDigit';
import { isAnimatedFlapCharacter, normalizeFlapText } from './Flap.utils';

interface FlapTextProps {
  text: string;
  className?: string;
}

export function FlapText({ text, className }: FlapTextProps) {
  const characters = Array.from(normalizeFlapText(text));
  const classes = ['flap-text', className ?? ''].filter(Boolean).join(' ');

  return (
    <span className={classes}>
      {characters.map((character, index) => {
        if (isAnimatedFlapCharacter(character)) {
          return <FlapDigit key={index} value={character} />;
        }

        return (
          <span
            className="flap-digit flap-digit--fixed"
            data-fixed="true"
            data-value={character}
            key={index}
          >
            {character}
          </span>
        );
      })}
    </span>
  );
}
