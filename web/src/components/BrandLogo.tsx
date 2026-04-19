import Link from "next/link";

type BrandLogoProps = {
  /** Tailwind height class, e.g. h-9, h-12 */
  className?: string;
  /** If set, the logo is wrapped in a link (omit on pages that should not navigate). */
  href?: string;
};

/**
 * Vice Valley Roleplay wordmark (served from `/vice-valley-logo.png`).
 */
export function BrandLogo({ className = "h-10 w-auto max-w-[200px]", href }: BrandLogoProps) {
  const img = (
    <img
      src="/vice-valley-logo.png"
      alt="Vice Valley Roleplay"
      className={`object-contain object-left ${className}`}
      width={400}
      height={200}
    />
  );
  if (href === undefined) return img;
  return (
    <Link href={href} className="inline-flex shrink-0 items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 rounded">
      {img}
    </Link>
  );
}
