import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';

interface TextTypeProps {
  text?: string[];
  texts?: string[];
  typingSpeed?: number;
  pauseDuration?: number;
  deletingSpeed?: number;
  showCursor?: boolean;
  cursorCharacter?: string;
  cursorBlinkDuration?: number;
  variableSpeedEnabled?: boolean;
  variableSpeedMin?: number;
  variableSpeedMax?: number;
  className?: string;
  style?: React.CSSProperties;
}

export default function TextType({
  text = [],
  texts = [],
  typingSpeed = 75,
  pauseDuration = 1500,
  deletingSpeed = 50,
  showCursor = true,
  cursorCharacter = '_',
  cursorBlinkDuration = 0.5,
  variableSpeedEnabled = false,
  variableSpeedMin = 60,
  variableSpeedMax = 120,
  className = '',
  style = {},
}: TextTypeProps) {
  const [displayedText, setDisplayedText] = useState('');
  const [done, setDone] = useState(false);
  const cursorRef = useRef<HTMLSpanElement>(null);

  // Use only the first string from text or texts
  const allTexts = [...text, ...texts];
  const firstText = allTexts[0] || '';

  // Cursor blink animation (always active)
  useEffect(() => {
    if (showCursor && cursorRef.current) {
      gsap.to(cursorRef.current, {
        opacity: 0,
        duration: cursorBlinkDuration,
        repeat: -1,
        yoyo: true,
        ease: 'power1.inOut',
      });
    }
  }, [showCursor, cursorBlinkDuration]);

  // Type once, then stop — cursor keeps blinking
  useEffect(() => {
    if (!firstText) return;
    if (done) return;
    if (displayedText === firstText) {
      setDone(true);
      return;
    }
    const getSpeed = () => {
      if (variableSpeedEnabled) {
        return Math.random() * (variableSpeedMax - variableSpeedMin) + variableSpeedMin;
      }
      return typingSpeed;
    };
    const timeout = setTimeout(() => {
      setDisplayedText((prev) => firstText.substring(0, prev.length + 1));
    }, getSpeed());
    return () => clearTimeout(timeout);
  }, [displayedText, done, firstText, typingSpeed, variableSpeedEnabled, variableSpeedMin, variableSpeedMax]);

  return (
    <span className={className} style={style}>
      {displayedText}
      {showCursor && (
        <span ref={cursorRef} style={{ display: 'inline-block' }}>
          {cursorCharacter}
        </span>
      )}
    </span>
  );
}
