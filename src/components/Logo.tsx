import Image from "next/image";

export default function Logo({ className }: { className?: string }) {
  return (
    <Image
      src="/logo.png"
      alt=""
      width={192}
      height={192}
      loading="eager"
      className={`rounded-full ${className ?? ""}`}
    />
  );
}
