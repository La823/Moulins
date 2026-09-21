"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Loader from "@/components/Loader";

export default function AuthGuard({ children, requiredRole, allowedRoles }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Support both single role and array of roles
  const roles = allowedRoles || (requiredRole ? [requiredRole] : null);

  const hasAccess = !roles || (user && roles.includes(user.role));

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
    if (!loading && user && roles && !roles.includes(user.role)) {
      router.push("/");
    }
  }, [user, loading, router, roles]);

  if (loading) {
    return <Loader fullScreen size="lg" />;
  }

  if (!user) return null;
  if (!hasAccess) return null;

  return children;
}
