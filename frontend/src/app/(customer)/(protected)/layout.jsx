"use client";
import ProtectedPage from "@/components/ProtectedPage";
export default function ProtectedLayout({ children }) {
  return <ProtectedPage>{children}</ProtectedPage>;
}
