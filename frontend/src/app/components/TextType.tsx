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
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const cursorRef = useRef<HTMLSpanElement>(null);
  
  // Combine text and texts arrays
  const allTexts = [...text, ...texts];

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

  useEffect(() => {
    if (allTexts.length === 0) return;

    const currentText = allTexts[currentIndex];
    let timeout: NodeJS.Timeout;

    const getSpeed = () => {
      if (variableSpeedEnabled) {
        return Math.random() * (variableSpeedMax - variableSpeedMin) + variableSpeedMin;
      }
      return isDeleting ? deletingSpeed : typingSpeed;
    };

    if (!isDeleting && displayedText === currentText) {
      timeout = setTimeout(() => {
        if (allTexts.length > 1) {
          setIsDeleting(true);
        }
      }, pauseDuration);
    } else if (isDeleting && displayedText === '') {
      setIsDeleting(false);
      setCurrentIndex((prev) => (prev + 1) % allTexts.length);
    } else {
      timeout = setTimeout(() => {
        setDisplayedText((prev) =>
          isDeleting
            ? currentText.substring(0, prev.length - 1)
            : currentText.substring(0, prev.length + 1)
        );
      }, getSpeed());
    }

    return () => clearTimeout(timeout);
  }, [
    displayedText,
    isDeleting,
    currentIndex,
    allTexts,
    typingSpeed,
    deletingSpeed,
    pauseDuration,
    variableSpeedEnabled,
    variableSpeedMin,
    variableSpeedMax,
  ]);

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
