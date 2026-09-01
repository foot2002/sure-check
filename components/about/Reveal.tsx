"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

type RevealTag = "div" | "li";

export function Reveal({
  children,
  className,
  delayMs = 0,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  delayMs?: number;
  as?: RevealTag;
}) {
  const ref = useRef<HTMLDivElement | HTMLLIElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setShown(true);
        observer.disconnect();
      },
      reduced
        ? { threshold: 0 }
        : { threshold: 0.12, rootMargin: "0px 0px -48px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const style: CSSProperties | undefined = delayMs
    ? { transitionDelay: `${delayMs}ms` }
    : undefined;

  return (
    <Tag
      ref={ref as never}
      style={style}
      className={[
        "transition-[opacity,transform] duration-700 ease-out will-change-[opacity,transform] motion-reduce:transform-none motion-reduce:transition-none",
        shown ? "translate-y-0 opacity-100" : "translate-y-7 opacity-0",
        className || "",
      ].join(" ")}
    >
      {children}
    </Tag>
  );
}
