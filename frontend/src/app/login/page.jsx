"use client";

import { useState } from "react";
import Image from "next/image";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import GoogleSignUp from "@/components/GoogleSignUp";

const GUEST_SIGN_IN = !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

function ForgotPasswordModal({ onClose }) {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [status, setStatus] = useState("idle"); // idle | submitting | done
  const [message, setMessage] = useState("");
  const [hasEmail, setHasEmail] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus("submitting");
    try {
      const res = await apiFetch("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ phone_number: phoneNumber }),
      });
      setMessage(res.message);
      setHasEmail(res.has_email);
      setStatus("done");
    } catch (err) {
      setMessage(err.message || "Something went wrong. Please try again.");
      setHasEmail(false);
      setStatus("done");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-sm p-6 bg-white rounded-2xl shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Forgot Password
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {status === "done" ? (
          <div>
            <p
              className={`text-sm ${
                hasEmail ? "text-gray-700" : "text-amber-600"
              }`}
            >
              {message}
            </p>
            <button
              onClick={onClose}
              className="w-full mt-6 py-2.5 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-gray-500">
              Enter your registered phone number. If an email is linked to
              your account, we&apos;ll send you a link to reset your
              password.
            </p>
            <div>
              <label
                htmlFor="reset-phone"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Phone Number
              </label>
              <input
                id="reset-phone"
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="Enter your phone number"
                required
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-gray-900"
              />
            </div>
            <button
              type="submit"
              disabled={status === "submitting"}
              className="w-full py-2.5 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {status === "submitting" ? "Sending..." : "Send Reset Link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  // Two ways in: partners (and staff) with phone + password, or guests —
  // visitors just looking around — with Google. Without Google set up, the
  // partner form is all there is.
  const [mode, setMode] = useState(GUEST_SIGN_IN ? "choose" : "partner");
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const user = await login(phoneNumber, password);
      if (user.role === "admin" || user.role === "employee") {
        router.push("/panel");
      } else if (user.role === "doctor") {
        router.push("/doctor-panel");
      } else {
        router.push("/");
      }
    } catch (err) {
      setError(err.message || "Invalid phone number or password");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm md:max-w-4xl grid md:grid-cols-2 overflow-hidden bg-white rounded-2xl shadow-md">
      {/* Sign-in form — left on desktop, below the video on phones */}
      <div className="order-2 md:order-1 p-8 md:p-12 flex flex-col justify-center">
        <div className="flex justify-center mb-6">
          <Image
            src="/Moulins Logo High Res - V2.png"
            alt="Moulins"
            width={140}
            height={48}
            className="h-10 w-auto"
            priority
          />
        </div>
        {mode === "choose" && (
          <div className="space-y-6">
            <p className="text-sm text-gray-500 text-center">Welcome to Moulins</p>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setMode("partner")}
                className="w-full py-2.5 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
              >
                Partner login
              </button>
              <p className="text-[11px] text-gray-400 text-center">
                With the phone number and password from our team. Staff log in here too.
              </p>
            </div>

            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span className="flex-1 h-px bg-gray-200" />
              or
              <span className="flex-1 h-px bg-gray-200" />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700 text-center">Continue as a guest</p>
              <GoogleSignUp onUsePartnerLogin={() => setMode("partner")} />
              <p className="text-[11px] text-gray-400 text-center">
                New here? Sign up or sign in with Google to browse our products.
              </p>
            </div>
          </div>
        )}

        {mode === "partner" && (
        <>
        {GUEST_SIGN_IN && (
          <button
            type="button"
            onClick={() => {
              setMode("choose");
              setError("");
            }}
            className="text-xs text-gray-500 hover:text-gray-900 mb-4"
          >
            ← Back
          </button>
        )}
        <p className="text-sm text-gray-500 text-center mb-8">
          Partner login
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="phone"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Phone Number
            </label>
            <input
              id="phone"
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="Enter your phone number"
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-gray-900"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                className="w-full pl-4 pr-11 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-gray-900"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                title={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-gray-700 focus:outline-none focus-visible:text-gray-900"
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 text-center">{error}</p>
          )}

          <div className="text-right">
            <button
              type="button"
              onClick={() => setShowForgotPassword(true)}
              className="text-xs text-gray-500 hover:text-gray-800 hover:underline"
            >
              Forgot password?
            </button>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="text-xs text-gray-400 text-center mt-6">
          Don&apos;t have a partner login? Contact us to get invited.
        </p>
        </>
        )}
      </div>

      {/* Logo animation — plays once and rests on the logo. White panel
          matches how the video's background renders, so its edges don't show. */}
      <div className="order-1 md:order-2 flex items-center justify-center bg-white md:border-l md:border-gray-100">
        <video
          src="/login-logo.mp4"
          autoPlay
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
          className="w-48 md:w-full max-w-md aspect-square object-contain"
        />
      </div>
      </div>

      {showForgotPassword && (
        <ForgotPasswordModal onClose={() => setShowForgotPassword(false)} />
      )}
    </div>
  );
}
