"use client";

export const PASSWORD_RULES = [
  { key: "length", label: "At least 8 characters", test: (p) => p.length >= 8 },
  { key: "upper", label: "One uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { key: "lower", label: "One lowercase letter", test: (p) => /[a-z]/.test(p) },
  { key: "digit", label: "One number", test: (p) => /[0-9]/.test(p) },
];

export function isPasswordValid(password) {
  return PASSWORD_RULES.every((rule) => rule.test(password || ""));
}

// Live checklist shown under a password field — each rule turns green as
// soon as the current input satisfies it.
export default function PasswordRules({ password }) {
  const p = password || "";
  return (
    <ul className="mt-1.5 space-y-0.5">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(p);
        return (
          <li
            key={rule.key}
            className={`flex items-center gap-1.5 text-[11px] transition-colors ${
              met ? "text-green-600" : "text-gray-400"
            }`}
          >
            <svg
              className="w-3 h-3 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth={met ? 2.5 : 2}
              viewBox="0 0 24 24"
            >
              {met ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              ) : (
                <circle cx="12" cy="12" r="8" />
              )}
            </svg>
            {rule.label}
          </li>
        );
      })}
    </ul>
  );
}
