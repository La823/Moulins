"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

// Government dates come back as "30-Dec-2029" — convert to the <input
// type="date"> value format ("2029-12-30") so expiry fields can be
// auto-filled, and reused as-is for the discrete date columns.
export function parseGovDate(s) {
  if (!s) return "";
  const months = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
  const parts = s.split("-");
  if (parts.length !== 3 || !months[parts[1]]) return "";
  return `${parts[2]}-${months[parts[1]]}-${parts[0].padStart(2, "0")}`;
}

// Maps the raw scraper JSON onto the backend's discrete scraped-field
// columns, kept separate from doc_number/expiry_date/photo_url so each piece
// of government data (name, address, status, etc.) has its own column
// instead of being stuffed into one blob.
export function gstFieldsPayload(details) {
  return details ? {
    legal_name: details.lgnm || null,
    trade_name: details.tradeNam || null,
    status: details.sts || null,
    business_type: details.ctb || null,
    registered_date: parseGovDate(details.rgdt) || null,
    address: details.pradr?.adr || null,
  } : {};
}

export function dlFieldsPayload(details) {
  return details ? {
    legal_name: details.institute_name || null,
    status: details.licence_status || null,
    first_issue_date: parseGovDate(details.dt_first_issue_date) || null,
    address: details.full_address || null,
    tech_person_name: details.tech_persons?.[0]?.techname || null,
    tech_person_reg_no: details.tech_persons?.[0]?.techregno ? String(details.tech_persons[0].techregno) : null,
  } : {};
}

// Verifying a GSTIN means solving a live captcha against the government
// portal each time — there's no way to skip straight to the result, so this
// is a small multi-step modal: fetch captcha -> submit captcha+GSTIN ->
// show the scraped business details so the caller can eyeball them before
// continuing (either submitting a document, or an admin approving one).
export function GstVerifyModal({ gstin, onClose, onConfirm }) {
  const [step, setStep] = useState("loading"); // loading | captcha | result | error
  const [sessionId, setSessionId] = useState(null);
  const [captchaImage, setCaptchaImage] = useState(null);
  const [captchaInput, setCaptchaInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [details, setDetails] = useState(null);

  const fetchCaptcha = async () => {
    setStep("loading");
    setError("");
    setCaptchaInput("");
    try {
      const res = await apiFetch("/gst-lookup/captcha");
      setSessionId(res.sessionId);
      setCaptchaImage(res.image);
      setStep("captcha");
    } catch (err) {
      setError(err.message || "Could not load captcha. Please try again.");
      setStep("error");
    }
  };

  useEffect(() => {
    fetchCaptcha();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitCaptcha = async (e) => {
    e.preventDefault();
    if (!captchaInput.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await apiFetch("/gst-lookup/details", {
        method: "POST",
        body: JSON.stringify({ session_id: sessionId, gstin, captcha: captchaInput.trim() }),
      });
      if (res.error) throw new Error(res.error);
      setDetails(res);
      setStep("result");
    } catch (err) {
      setError(err.message || "Could not verify this GSTIN. Please check the captcha and try again.");
      setStep("error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-sm p-6 bg-white rounded-2xl shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Verify GSTIN</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">✕</button>
        </div>

        {step === "loading" && (
          <p className="text-sm text-gray-500 text-center py-6">Loading captcha...</p>
        )}

        {step === "captcha" && (
          <form onSubmit={submitCaptcha} className="space-y-4">
            <p className="text-sm text-gray-500">
              Enter the code shown below to fetch details for <span className="font-medium text-gray-700">{gstin}</span>.
            </p>
            {captchaImage && (
              <img src={captchaImage} alt="captcha" className="mx-auto border border-gray-200 rounded" />
            )}
            <button type="button" onClick={fetchCaptcha} className="text-xs text-blue-600 hover:underline block mx-auto">
              Can&apos;t read it? Get a new one
            </button>
            <input
              value={captchaInput}
              onChange={(e) => setCaptchaInput(e.target.value)}
              placeholder="Enter captcha"
              autoFocus
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00A6A4]"
            />
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 text-sm font-semibold text-white rounded-lg disabled:opacity-50"
              style={{ backgroundColor: "#00A6A4" }}
            >
              {submitting ? "Verifying..." : "Fetch Details"}
            </button>
          </form>
        )}

        {step === "error" && (
          <div className="space-y-4">
            <p className="text-sm text-red-600">{error}</p>
            <button
              onClick={fetchCaptcha}
              className="w-full py-2.5 text-sm font-semibold text-white rounded-lg"
              style={{ backgroundColor: "#00A6A4" }}
            >
              Try Again
            </button>
          </div>
        )}

        {step === "result" && details && (
          <div className="space-y-3">
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700 font-medium">
              GSTIN found — please check the details below
            </div>
            <div className="space-y-1.5 text-sm text-gray-700">
              {details.lgnm && <p><span className="font-medium">Legal Name:</span> {details.lgnm}</p>}
              {details.tradeNam && <p><span className="font-medium">Trade Name:</span> {details.tradeNam}</p>}
              {details.sts && <p><span className="font-medium">Status:</span> {details.sts}</p>}
              {details.ctb && <p><span className="font-medium">Business Type:</span> {details.ctb}</p>}
              {details.rgdt && <p><span className="font-medium">Registered:</span> {details.rgdt}</p>}
              {details.pradr?.adr && <p><span className="font-medium">Address:</span> {details.pradr.adr}</p>}
            </div>
            <div className="flex gap-3 pt-2">
              {onConfirm && (
                <button
                  onClick={() => onConfirm(details)}
                  className="flex-1 py-2.5 text-sm font-semibold text-white rounded-lg"
                  style={{ backgroundColor: "#00A6A4" }}
                >
                  Looks good, continue
                </button>
              )}
              <button
                onClick={fetchCaptcha}
                className={`${onConfirm ? "px-4" : "flex-1"} py-2.5 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50`}
              >
                Re-check
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Unlike GST verification, the drug-license portal has no captcha step —
// it's a single lookup call, so this modal just shows a loading state then
// the result (or an error), no multi-step flow needed.
export function DlVerifyModal({ licenseNo, onClose, onConfirm }) {
  const [status, setStatus] = useState("loading"); // loading | result | error
  const [error, setError] = useState("");
  const [details, setDetails] = useState(null);

  const fetchDetails = async () => {
    setStatus("loading");
    setError("");
    try {
      const res = await apiFetch(`/dl-lookup/details?license_no=${encodeURIComponent(licenseNo)}`);
      if (res.error) throw new Error(res.error);
      setDetails(res);
      setStatus("result");
    } catch (err) {
      setError(err.message || "Could not verify this license number. Please try again.");
      setStatus("error");
    }
  };

  useEffect(() => {
    fetchDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-sm p-6 bg-white rounded-2xl shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Verify Drug License</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">✕</button>
        </div>

        {status === "loading" && (
          <p className="text-sm text-gray-500 text-center py-6">
            Looking up <span className="font-medium text-gray-700">{licenseNo}</span>...
          </p>
        )}

        {status === "error" && (
          <div className="space-y-4">
            <p className="text-sm text-red-600">{error}</p>
            <button
              onClick={fetchDetails}
              className="w-full py-2.5 text-sm font-semibold text-white rounded-lg"
              style={{ backgroundColor: "#00A6A4" }}
            >
              Try Again
            </button>
          </div>
        )}

        {status === "result" && details && (
          <div className="space-y-3">
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700 font-medium">
              License found — please check the details below
            </div>
            <div className="space-y-1.5 text-sm text-gray-700">
              {details.str_ondls_licence_no && <p><span className="font-medium">License No:</span> {details.str_ondls_licence_no}</p>}
              {details.licence_form_no && <p><span className="font-medium">Form:</span> {details.licence_form_no}</p>}
              {details.institute_name && <p><span className="font-medium">Firm Name:</span> {details.institute_name}</p>}
              {details.licence_status && <p><span className="font-medium">Status:</span> {details.licence_status}</p>}
              {details.dt_curr_validity_date && <p><span className="font-medium">Valid Until:</span> {details.dt_curr_validity_date}</p>}
              {details.dt_first_issue_date && <p><span className="font-medium">First Issued:</span> {details.dt_first_issue_date}</p>}
              {details.full_address && <p><span className="font-medium">Address:</span> {details.full_address}</p>}
              {details.tech_persons?.length > 0 && (
                <p><span className="font-medium">Technical Person:</span> {details.tech_persons.map((t) => t.techname).join(", ")}</p>
              )}
            </div>
            <div className="flex gap-3 pt-2">
              {onConfirm && (
                <button
                  onClick={() => onConfirm(details)}
                  className="flex-1 py-2.5 text-sm font-semibold text-white rounded-lg"
                  style={{ backgroundColor: "#00A6A4" }}
                >
                  Looks good, continue
                </button>
              )}
              <button
                onClick={fetchDetails}
                className={`${onConfirm ? "px-4" : "flex-1"} py-2.5 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50`}
              >
                Re-check
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
