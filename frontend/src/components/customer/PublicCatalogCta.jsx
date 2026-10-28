"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { isVisitor, openBecomePartner } from "@/components/customer/BecomePartner";

// The public catalogue pages show no rates. A signed-in partner or team
// member is sent on to the same page in their own catalogue; everyone else
// is offered the partner sign-up, or sign-in.
export default function PublicCatalogCta({ privateHref, label = "this range" }) {
  const { user } = useAuth();

  if (user && !isVisitor(user)) {
    return (
      <Link
        href={privateHref}
        className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white rounded-full transition-colors"
        style={{ backgroundColor: "#AC2528" }}
      >
        See rates and order {label}
      </Link>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => openBecomePartner("public catalogue")}
        className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white rounded-full transition-colors"
        style={{ backgroundColor: "#AC2528" }}
      >
        Become a partner for rates
      </button>
      {!user && (
        <Link href="/login" className="text-sm text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline">
          Partner sign in
        </Link>
      )}
    </div>
  );
}
