"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

// Loads Google's sign-in script once per page.
let scriptPromise;
function loadGoogleScript() {
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = resolve;
      s.onerror = () => {
        scriptPromise = null;
        reject(new Error("Couldn't reach Google — check your connection and try again."));
      };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

// The server's answer when the Google email is already on an account
// (auth/google.go) — such people use Partner login instead.
const isExistingAccount = (msg) => /already have a Moulins account/i.test(msg || "");

/**
 * "Sign up with Google" for visitors — people checking the website out.
 * Renders nothing until NEXT_PUBLIC_GOOGLE_CLIENT_ID is set.
 * `onUsePartnerLogin` shows the partner form, for someone who already has
 * an account.
 */
export default function GoogleSignUp({ onUsePartnerLogin }) {
  const { loginWithGoogle } = useAuth();
  const router = useRouter();
  const buttonRef = useRef(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;
    loadGoogleScript()
      .then(() => {
        if (cancelled || !buttonRef.current) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: async ({ credential }) => {
            setError("");
            setBusy(true);
            try {
              await loginWithGoogle(credential);
              router.push("/products");
            } catch (err) {
              setError(err.message || "Google sign-in failed — please try again.");
            } finally {
              setBusy(false);
            }
          },
        });
        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          width: buttonRef.current.offsetWidth || 320,
        });
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
    // once: loginWithGoogle and router hold no state the callback needs
    // fresh, and re-running would draw Google's button again
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!CLIENT_ID) return null;
  return (
    <div className="space-y-2">
      <div ref={buttonRef} className="w-full flex justify-center min-h-[44px]" />
      {busy && <p className="text-xs text-gray-400 text-center">Signing you in…</p>}
      {error && isExistingAccount(error) ? (
        <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2.5 text-center space-y-2">
          <p className="text-xs text-amber-800">{error.trim()}</p>
          {onUsePartnerLogin && (
            <button
              type="button"
              onClick={onUsePartnerLogin}
              className="px-3 py-1.5 bg-gray-900 text-white rounded-md text-xs font-medium hover:bg-gray-800"
            >
              Go to Partner login
            </button>
          )}
        </div>
      ) : (
        error && <p className="text-xs text-red-600 text-center">{error}</p>
      )}
    </div>
  );
}
