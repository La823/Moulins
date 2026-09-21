import Image from "next/image";

const SIZES = {
  sm: { box: "w-10 h-10", logo: 32 },
  md: { box: "w-16 h-16", logo: 52 },
  lg: { box: "w-24 h-24", logo: 80 },
};

// Branded loading indicator — the Moulins logo breathing in place with an
// expanding ring behind it (see the .animate-logo-* keyframes in
// globals.css), used in place of a plain spinner/"Loading..." text wherever
// the app needs to show a page or panel is still loading.
export default function Loader({ size = "md", label, fullScreen = false, className = "" }) {
  const { box, logo } = SIZES[size] || SIZES.md;

  const content = (
    <div className={`flex flex-col items-center justify-center gap-3 ${className}`}>
      <div className={`relative ${box} flex items-center justify-center`}>
        <span className="absolute inset-0 rounded-full bg-red-100 animate-logo-ring" />
        <Image
          src="/Moulins Logo High Res - V2.png"
          alt="Loading"
          width={logo}
          height={logo}
          className="relative w-auto h-full object-contain animate-logo-breathe"
          priority
        />
      </div>
      {label && <p className="text-sm text-gray-500">{label}</p>}
    </div>
  );

  if (!fullScreen) return content;

  return <div className="min-h-screen flex items-center justify-center">{content}</div>;
}
