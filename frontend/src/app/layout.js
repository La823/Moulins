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

export const metadata = {
  title: "Moulins",
  description: "Moulins e-commerce",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
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
