export default function BrandLogo({ className = "" }: { className?: string }) {
  return <img src="/portal-logo.svg" alt="AP" className={className} style={{ objectFit: "contain" }} />;
}
