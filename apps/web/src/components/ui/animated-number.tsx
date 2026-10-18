import { animate, useMotionValue, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

/** Tweens between values; the final text is always the exact number (also for screen readers). */
export function AnimatedNumber({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const mv = useMotionValue(value);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) {
      mv.set(value);
      if (ref.current) ref.current.textContent = value.toLocaleString();
      return;
    }
    const controls = animate(mv, value, { duration: 0.45, ease: "easeOut" });
    return () => controls.stop();
  }, [value, mv, reduce]);

  useEffect(() => mv.on("change", (v) => ref.current && (ref.current.textContent = Math.round(v).toLocaleString())), [mv]);

  return <span ref={ref}>{value.toLocaleString()}</span>;
}
