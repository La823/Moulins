"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { GstVerifyModal, DlVerifyModal, ScrapedDetails } from "@/components/shared/DocVerifyModals";

// A retailer's GST number and drug licences, for their partner: saved, and
// checked against the government portals with the same GST / DL lookups as
// partner onboarding (GST needs the portal's captcha). The portal's details
// are kept with each number.
export default function RetailerDocuments({ retailer, onChanged }) {
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState(null); // { kind, number }
  const [checking, setChecking] = useState(null); // { kind, number }
  const base = `/retailers/${retailer.id}/documents`;

  const load = () =>
    apiFetch(base)
      .then((d) => (setDocs(d || []), setError("")))
      .catch((e) => (setDocs((x) => x || []), setError(e.message)));

  useEffect(() => {
    let off = false;
    apiFetch(base)
      .then((d) => !off && setDocs(d || []))
      .catch((e) => !off && (setDocs([]), setError(e.message)));
    return () => {
      off = true;
    };
  }, [base]);

  const save = async (kind, number, details) => {
    setError("");
    try {
      const res = await apiFetch(base, { method: "POST", body: JSON.stringify({ kind, number, details: details || undefined }) });
      setMessage(res?.message || "The number has been saved.");
      setDraft(null);
      await load();
      onChanged?.();
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async (d) => {
    if (!window.confirm(`Remove ${d.number}?`)) return;
    try {
      await apiFetch(`${base}/${d.id}`, { method: "DELETE" });
      setMessage("The number has been removed.");
      await load();
      onChanged?.();
    } catch (e) {
      setError(e.message);
    }
  };

  const hasGst = docs?.some((d) => d.kind === "gst");
  const btn = "text-xs px-3 py-1.5 border rounded-lg";
  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      {message && <p className="text-xs text-teal-700 mb-2">{message}</p>}
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      {docs === null ? (
        <p className="text-xs text-gray-400">Loading…</p>
      ) : (
        <div className="space-y-2">
          {docs.length === 0 && <p className="text-xs text-gray-500">No GST number or drug licence saved yet.</p>}
          {docs.map((d) => (
            <div key={d.id} className="border border-gray-200 rounded-lg p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-gray-500">{d.kind === "gst" ? "GST" : "Drug licence"}</span>
                <span className="font-medium text-gray-900">{d.number}</span>
                {d.verified_at ? (
                  <span className="text-xs text-green-700">
                    ✓ Checked {new Date(d.verified_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                ) : (
                  <span className="text-xs text-amber-700">Not checked</span>
                )}
                <span className="flex-1" />
                <button type="button" onClick={() => setChecking({ kind: d.kind, number: d.number })} className={`${btn} border-gray-300 text-gray-700`}>
                  {d.verified_at ? "Check again" : "Check now"}
                </button>
                <button type="button" onClick={() => remove(d)} className={`${btn} border-red-200 text-red-600`}>
                  Remove
                </button>
              </div>
              {d.details && (
                <div className="mt-2 text-xs text-gray-700 space-y-0.5">
                  <ScrapedDetails data={d.details} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {draft ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            autoFocus
            value={draft.number}
            onChange={(e) => setDraft((x) => ({ ...x, number: e.target.value.toUpperCase() }))}
            placeholder={draft.kind === "gst" ? "15-character GSTIN" : "Drug licence number"}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-64"
          />
          <button
            type="button"
            disabled={!draft.number.trim()}
            onClick={() => setChecking({ kind: draft.kind, number: draft.number.trim() })}
            className={`${btn} bg-gray-900 text-white border-gray-900 disabled:opacity-50`}
          >
            Check
          </button>
          <button
            type="button"
            disabled={!draft.number.trim()}
            onClick={() => save(draft.kind, draft.number.trim())}
            className={`${btn} border-gray-300 text-gray-700 disabled:opacity-50`}
          >
            Save without checking
          </button>
          <button type="button" onClick={() => setDraft(null)} className={`${btn} border-gray-300 text-gray-500`}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          {!hasGst && (
            <button type="button" onClick={() => setDraft({ kind: "gst", number: "" })} className={`${btn} border-gray-300 text-gray-700`}>
              + GST number
            </button>
          )}
          <button type="button" onClick={() => setDraft({ kind: "dl", number: "" })} className={`${btn} border-gray-300 text-gray-700`}>
            + Drug licence
          </button>
        </div>
      )}

      {checking?.kind === "gst" && (
        <GstVerifyModal
          gstin={checking.number}
          onClose={() => setChecking(null)}
          onConfirm={(details) => {
            setChecking(null);
            save("gst", checking.number, details);
          }}
        />
      )}
      {checking?.kind === "dl" && (
        <DlVerifyModal
          licenseNo={checking.number}
          onClose={() => setChecking(null)}
          onConfirm={(details) => {
            setChecking(null);
            save("dl", checking.number, details);
          }}
        />
      )}
    </div>
  );
}
