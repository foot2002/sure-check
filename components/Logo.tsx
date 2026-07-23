import Image from "next/image";
import Link from "next/link";

interface LogoProps {
  size?: "header" | "hero";
}

/**
 * Between previous oversized mark and the undersized rewrite —
 * readable brand presence without dominating the hero.
 */
const sizeStyles = {
  header:
    "h-auto w-full max-w-[min(100%,240px)] sm:max-w-[min(100%,290px)] md:max-w-[min(100%,340px)]",
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
        priority={size === "header"}
        className={`${sizeStyles[size]} transition-opacity group-hover:opacity-90`}
      />
    </Link>
  );
}
