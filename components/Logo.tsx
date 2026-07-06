import Image from "next/image";
import Link from "next/link";

interface LogoProps {
  size?: "header" | "hero";
}

const sizeStyles = {
  header: "max-w-[min(100%,350px)] sm:max-w-[min(100%,430px)] md:max-w-[min(100%,510px)]",
  hero: "max-w-[min(100%,480px)] sm:max-w-[min(100%,600px)] md:max-w-[min(100%,720px)]",
};

export function Logo({ size = "header" }: LogoProps) {
  return (
    <Link href="/" className="group inline-block">
      <Image
        src="/images/sure_logo.png"
        alt="SURE — Secure User Response Environment Mark"
        width={1200}
        height={360}
        priority={size === "header"}
        className={`h-auto w-full ${sizeStyles[size]} transition-opacity group-hover:opacity-90`}
      />
    </Link>
  );
}
