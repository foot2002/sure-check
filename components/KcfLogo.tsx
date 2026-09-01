import Image from "next/image";

export function KcfLogo({
  className,
  size = "section",
}: {
  className?: string;
  size?: "section" | "footer";
}) {
  const sizeClass =
    size === "footer"
      ? "h-10 w-auto sm:h-12"
      : "h-12 w-auto sm:h-14 md:h-16";
  return (
    <Image
      src="/images/kcf_logo.jpg"
      alt="한국컨설팅산업재단 Korea Consultancy Foundation"
      width={800}
      height={240}
      className={`${sizeClass} object-contain ${className || ""}`}
    />
  );
}
