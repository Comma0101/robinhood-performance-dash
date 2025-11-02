import { useEffect, useRef, useState } from "react";

interface SwipeInput {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  minSwipeDistance?: number;
  preventDefaultTouchMove?: boolean;
}

interface TouchPosition {
  x: number;
  y: number;
  time: number;
}

export function useSwipe({
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
  minSwipeDistance = 50,
  preventDefaultTouchMove = false,
}: SwipeInput) {
  const touchStart = useRef<TouchPosition | null>(null);
  const touchEnd = useRef<TouchPosition | null>(null);
  const [isSwiping, setIsSwiping] = useState(false);

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      touchEnd.current = null;
      touchStart.current = {
        x: e.targetTouches[0].clientX,
        y: e.targetTouches[0].clientY,
        time: Date.now(),
      };
      setIsSwiping(true);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (preventDefaultTouchMove && touchStart.current) {
        const currentX = e.targetTouches[0].clientX;
        const currentY = e.targetTouches[0].clientY;
        const diffX = Math.abs(currentX - touchStart.current.x);
        const diffY = Math.abs(currentY - touchStart.current.y);

        // Only prevent default if horizontal swipe is more prominent
        if (diffX > diffY && diffX > 10) {
          e.preventDefault();
        }
      }

      touchEnd.current = {
        x: e.targetTouches[0].clientX,
        y: e.targetTouches[0].clientY,
        time: Date.now(),
      };
    };

    const handleTouchEnd = () => {
      if (!touchStart.current || !touchEnd.current) {
        setIsSwiping(false);
        return;
      }

      const distanceX = touchStart.current.x - touchEnd.current.x;
      const distanceY = touchStart.current.y - touchEnd.current.y;
      const timeDiff = touchEnd.current.time - touchStart.current.time;

      // Calculate velocity (pixels per ms)
      const velocityX = Math.abs(distanceX) / timeDiff;
      const velocityY = Math.abs(distanceY) / timeDiff;

      const isHorizontalSwipe = Math.abs(distanceX) > Math.abs(distanceY);
      const isVerticalSwipe = Math.abs(distanceY) > Math.abs(distanceX);

      // Horizontal swipes
      if (isHorizontalSwipe) {
        if (distanceX > minSwipeDistance && velocityX > 0.3 && onSwipeLeft) {
          onSwipeLeft();
        } else if (
          distanceX < -minSwipeDistance &&
          velocityX > 0.3 &&
          onSwipeRight
        ) {
          onSwipeRight();
        }
      }

      // Vertical swipes
      if (isVerticalSwipe) {
        if (distanceY > minSwipeDistance && velocityY > 0.3 && onSwipeUp) {
          onSwipeUp();
        } else if (
          distanceY < -minSwipeDistance &&
          velocityY > 0.3 &&
          onSwipeDown
        ) {
          onSwipeDown();
        }
      }

      setIsSwiping(false);
      touchStart.current = null;
      touchEnd.current = null;
    };

    // Add event listeners
    document.addEventListener("touchstart", handleTouchStart);
    document.addEventListener("touchmove", handleTouchMove, {
      passive: !preventDefaultTouchMove,
    });
    document.addEventListener("touchend", handleTouchEnd);

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    minSwipeDistance,
    preventDefaultTouchMove,
  ]);

  return { isSwiping };
}
