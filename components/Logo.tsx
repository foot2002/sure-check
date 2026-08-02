import Image from "next/image";
import Link from "next/link";

interface LogoProps {
  size?: "header" | "headerCompact" | "hero";
}

/**
 * Between previous oversized mark and the undersized rewrite —
 * readable brand presence without dominating the hero.
 */
const sizeStyles = {
  header:
    "h-auto w-full max-w-[min(100%,240px)] sm:max-w-[min(100%,290px)] md:max-w-[min(100%,340px)]",
  headerCompact:
    "h-auto w-full max-w-[min(100%,160px)] sm:max-w-[min(100%,190px)] md:max-w-[min(100%,220px)]",
  hero: "h-auto w-full max-w-[min(100%,300px)] sm:max-w-[min(100%,360px)] md:max-w-[min(100%,420px)]",
};

export function Logo({ size = "header" }: LogoProps) {
  return (
    <Link href="/" className="group inline-block">
      <Image
        src="/images/sure_logo.png"
        alt="SURE Check"
        width={1200}
        height={360}
        priority={size === "header" || size === "headerCompact"}
        className={`${sizeStyles[size]} transition-opacity group-hover:opacity-90`}
      />
    </Link>
  );
}
