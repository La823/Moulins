"use client";

import { useAuth } from "@/context/AuthContext";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import Loader from "@/components/Loader";
import { BecomePartnerPage, isVisitor } from "@/components/customer/BecomePartner";
import { CATEGORY_TO_DIVISION_ROUTE } from "@/lib/divisionRoutes";
import { logVisitorEvent } from "@/lib/visitorLog";

// What a visitor may open: the products and division pages, and the page
// that asks them to become a partner. Every other page shows that instead.
const VISITOR_PAGES = ["/products", "/become-partner", ...Object.values(CATEGORY_TO_DIVISION_ROUTE)];
const visitorMayOpen = (path) => VISITOR_PAGES.some((p) => path === p || path?.startsWith(p + "/"));

// A page a visitor can't open: the "Become a partner" page in its place,
// noted in the visitors log.
function LockedPage({ path }) {
  useEffect(() => {
    logVisitorEvent({ kind: "locked_action", label: `page ${path}` });
  }, [path]);
  return <BecomePartnerPage />;
}

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
  if (isVisitor(user) && !visitorMayOpen(pathname)) return <LockedPage path={pathname} />;

  return children;
}
