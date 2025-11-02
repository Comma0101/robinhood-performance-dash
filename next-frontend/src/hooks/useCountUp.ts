import { useEffect, useState, useRef } from "react";

interface UseCountUpOptions {
  start?: number;
  duration?: number;
  decimals?: number;
  enableScrollSpy?: boolean;
}

export function useCountUp(
  end: number,
  options: UseCountUpOptions = {}
): number {
  const {
    start = 0,
    duration = 800,
    decimals = 0,
    enableScrollSpy = false,
  } = options;

  const [count, setCount] = useState(start);
  const [hasStarted, setHasStarted] = useState(!enableScrollSpy);
  const elementRef = useRef<HTMLElement | null>(null);
  const frameRef = useRef<number | undefined>(undefined);
  const startTimeRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!hasStarted) return;

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = timestamp;
      }

      const progress = Math.min(
        (timestamp - startTimeRef.current) / duration,
        1
      );

      // Easing function (ease-out cubic)
      const easeOut = 1 - Math.pow(1 - progress, 3);

      const currentCount = start + (end - start) * easeOut;
      setCount(currentCount);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        setCount(end);
      }
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [end, start, duration, hasStarted]);

  useEffect(() => {
    if (!enableScrollSpy) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasStarted) {
            setHasStarted(true);
          }
        });
      },
      { threshold: 0.1 }
    );

    const element = elementRef.current;
    if (element) {
      observer.observe(element);
    }

    return () => {
      if (element) {
        observer.unobserve(element);
      }
    };
  }, [enableScrollSpy, hasStarted]);

  // Return the formatted count
  return decimals > 0
    ? Math.round(count * Math.pow(10, decimals)) / Math.pow(10, decimals)
    : Math.round(count);
}
