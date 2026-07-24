import { Albert_Sans } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { CartProvider } from "@/context/CartContext";

const albertSans = Albert_Sans({
  variable: "--font-albert-sans",
  subsets: ["latin"],
});

const erode = localFont({
  variable: "--font-erode",
  src: [
    { path: "../../public/Erode_Complete/Fonts/WEB/fonts/Erode-Light.woff2", weight: "300", style: "normal" },
    { path: "../../public/Erode_Complete/Fonts/WEB/fonts/Erode-LightItalic.woff2", weight: "300", style: "italic" },
    { path: "../../public/Erode_Complete/Fonts/WEB/fonts/Erode-Regular.woff2", weight: "400", style: "normal" },
    { path: "../../public/Erode_Complete/Fonts/WEB/fonts/Erode-Italic.woff2", weight: "400", style: "italic" },
    { path: "../../public/Erode_Complete/Fonts/WEB/fonts/Erode-Medium.woff2", weight: "500", style: "normal" },
    { path: "../../public/Erode_Complete/Fonts/WEB/fonts/Erode-MediumItalic.woff2", weight: "500", style: "italic" },
    { path: "../../public/Erode_Complete/Fonts/WEB/fonts/Erode-Semibold.woff2", weight: "600", style: "normal" },
    { path: "../../public/Erode_Complete/Fonts/WEB/fonts/Erode-SemiboldItalic.woff2", weight: "600", style: "italic" },
    { path: "../../public/Erode_Complete/Fonts/WEB/fonts/Erode-Bold.woff2", weight: "700", style: "normal" },
    { path: "../../public/Erode_Complete/Fonts/WEB/fonts/Erode-BoldItalic.woff2", weight: "700", style: "italic" },
  ],
});

const SITE_URL = "https://www.moulinspharma.com";
const SITE_NAME = "Moulins Pharmaceuticals";
const SITE_DESCRIPTION =
  "Moulins Pharmaceuticals is a pharmaceutical company manufacturing and marketing quality medicines across Aerozone, Bonevoyage, Fluidity, Gutsy, Jivya, Lifegard, Little Planet, Matrix, Mindset, Miss Bella, Srishti and Viewpoint divisions.";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Quality Medicines Across Every Therapy Area`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "Moulins Pharmaceuticals",
    "pharmaceutical company India",
    "generic medicines",
    "pharma manufacturer",
    "healthcare products",
  ],
  authors: [{ name: SITE_NAME }],
  applicationName: SITE_NAME,
  referrer: "origin-when-cross-origin",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Quality Medicines Across Every Therapy Area`,
    description: SITE_DESCRIPTION,
    locale: "en_IN",
    images: [
      {
        url: "/Moulins Logo High Res - V2.png",
        width: 1200,
        height: 630,
        alt: SITE_NAME,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — Quality Medicines Across Every Therapy Area`,
    description: SITE_DESCRIPTION,
    images: ["/Moulins Logo High Res - V2.png"],
  },
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/Moulins Logo High Res - V2.png`,
  description: SITE_DESCRIPTION,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
      </head>
      <body
        className={`${albertSans.variable} ${erode.variable} antialiased`}
      >
        <AuthProvider>
          <CartProvider>{children}</CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
