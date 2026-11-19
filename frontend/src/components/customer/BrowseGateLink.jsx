"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

// Someone who lands on a public product page from Google may read that page,
// but moving on to other products, divisions or salt pages asks them to sign
// in first (a Google visitor sign-in is enough). The link stays a normal link
// in the page, so search engines still follow it; only the click is stopped.
export default function BrowseGateLink({ href, children, ...rest }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  const onClick = (e) => {
    if (user || loading) return;
    // new-tab / modified clicks are left to the browser
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    router.push("/login");
  };

  return (
    <Link href={href} onClick={onClick} {...rest}>
      {children}
    </Link>
  );
}
