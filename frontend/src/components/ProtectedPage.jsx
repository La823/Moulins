"use client";

import { useAuth } from "@/context/AuthContext";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import Loader from "@/components/Loader";
import { BecomePartnerPage, isVisitor } from "@/components/customer/BecomePartner";
import { CATEGORY_TO_DIVISION_ROUTE } from "@/lib/divisionRoutes";

// What a visitor may open: the products and division pages, and the page
// that asks them to become a partner. Every other page shows that instead.
const VISITOR_PAGES = ["/products", "/become-partner", ...Object.values(CATEGORY_TO_DIVISION_ROUTE)];
const visitorMayOpen = (path) => VISITOR_PAGES.some((p) => path === p || path?.startsWith(p + "/"));

export default function ProtectedPage({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader />
      </div>
    );
  }

  if (!user) return null;
  if (isVisitor(user) && !visitorMayOpen(pathname)) return <BecomePartnerPage />;

  return children;
}
