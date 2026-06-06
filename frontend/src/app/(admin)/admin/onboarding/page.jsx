"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { motion } from "framer-motion";

export default function OnboardingAdminPage() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [verifyingDoc, setVerifyingDoc] = useState(null);

  useEffect(() => {
    fetchPendingCustomers();
  }, []);

  const fetchPendingCustomers = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get("/api/admin/onboarding", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCustomers(res.data.customers);
      setLoading(false);
    } catch (err) {
      console.error("Failed to fetch customers:", err);
      setLoading(false);
    }
  };

  const handleVerifyDocument = async (userId, docType, isVerified, rejectionReason) => {
    setVerifyingDoc(`${userId}-${docType}`);
    try {
      const token = localStorage.getItem("token");
      await axios.patch(
        "/api/admin/onboarding/verify",
        {
          user_id: userId,
          doc_type: docType,
          is_verified: isVerified,
          rejection_reason: rejectionReason,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchPendingCustomers();
      setSelectedCustomer(null);
    } catch (err) {
      console.error("Failed to verify document:", err);
      alert("Failed to verify document");
    } finally {
      setVerifyingDoc(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-800 rounded-full animate-spin" />
      </div>
    );
  }

  const TEAL = "#00A6A4";

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Customer Verification
        </h1>
        <p className="text-gray-600">
          Review and verify customer documents
        </p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Customer List */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg border border-gray-200 h-[600px] overflow-y-auto">
            {customers.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                No pending verifications
              </div>
            ) : (
              <div className="divide-y">
                {customers.map((customer) => (
                  <motion.button
                    key={customer.id}
                    onClick={() => setSelectedCustomer(customer)}
                    whileHover={{ backgroundColor: "#f3f4f6" }}
                    className={`w-full p-4 text-left transition ${
                      selectedCustomer?.id === customer.id
                        ? "bg-teal-50 border-l-4"
                        : "hover:bg-gray-50"
                    }`}
                    style={
                      selectedCustomer?.id === customer.id
                        ? { borderLeftColor: TEAL }
                        : {}
                    }
                  >
                    <p className="font-bold text-sm">{customer.username || customer.phone_number}</p>
                    <p className="text-xs text-gray-600 mt-1">{customer.phone_number}</p>
                    <div className="mt-2">
                      <StepBadge step={customer.onboarding_step} teal={TEAL} />
                    </div>
                  </motion.button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Details Panel */}
        <div className="lg:col-span-2">
          {selectedCustomer ? (
            <motion.div
              key={selectedCustomer.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white rounded-lg border border-gray-200 p-6"
            >
              {/* Customer Info */}
              <div className="mb-6 pb-6 border-b">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                  {selectedCustomer.username || selectedCustomer.phone_number}
                </h2>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">Phone</p>
                    <p className="font-bold">{selectedCustomer.phone_number}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Status</p>
                    <StepBadge step={selectedCustomer.onboarding_step} teal={TEAL} />
                  </div>
                </div>
              </div>

              {/* Documents */}
              <div>
                <h3 className="font-bold text-lg mb-4">Documents</h3>
                <div className="space-y-4">
                  {selectedCustomer.documents_json &&
                    JSON.parse(selectedCustomer.documents_json).map((doc) => (
                      <DocumentReviewCard
                        key={doc.id}
                        doc={doc}
                        onVerify={(isVerified, reason) =>
                          handleVerifyDocument(
                            selectedCustomer.id,
                            doc.doc_type,
                            isVerified,
                            reason
                          )
                        }
                        isVerifying={verifyingDoc === `${selectedCustomer.id}-${doc.doc_type}`}
                        teal={TEAL}
                      />
                    ))}
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 p-12 flex items-center justify-center h-[600px]">
              <p className="text-gray-500">Select a customer to review</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StepBadge({ step, teal }) {
  const stepLabels = {
    1: "Account Created",
    2: "License Pending",
    3: "GST Pending",
    4: "All Verified",
  };

  const stepColors = {
    1: "bg-blue-100 text-blue-800",
    2: "bg-yellow-100 text-yellow-800",
    3: "bg-orange-100 text-orange-800",
    4: "bg-green-100 text-green-800",
  };

  return (
    <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${stepColors[step]}`}>
      {stepLabels[step]}
    </span>
  );
}

function DocumentReviewCard({ doc, onVerify, isVerifying, teal }) {
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);

  return (
    <div className={`p-4 rounded-lg border ${
      doc.is_verified
        ? "bg-green-50 border-green-200"
        : doc.rejection_reason
        ? "bg-red-50 border-red-200"
        : "bg-gray-50 border-gray-200"
    }`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="font-bold">{doc.doc_type === "LICENSE" ? "Drug License" : "GST Certificate"}</h4>
          <p className="text-sm text-gray-600 mt-1">
            {doc.doc_number && `Number: ${doc.doc_number}`}
          </p>
          {doc.rejection_reason && (
            <p className="text-sm text-red-600 mt-2">Reason: {doc.rejection_reason}</p>
          )}
        </div>
        <span className={`text-xs font-bold px-2 py-1 rounded ${
          doc.is_verified
            ? "bg-green-200 text-green-800"
            : doc.rejection_reason
            ? "bg-red-200 text-red-800"
            : "bg-yellow-200 text-yellow-800"
        }`}>
          {doc.is_verified ? "✓ Verified" : doc.rejection_reason ? "✗ Rejected" : "⏳ Pending"}
        </span>
      </div>

      {doc.photo_url && (
        <div className="mb-4">
          <a
            href={doc.photo_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline"
          >
            View Document Photo →
          </a>
        </div>
      )}

      {!doc.is_verified && !doc.rejection_reason && (
        <div className="flex gap-2">
          <button
            onClick={() => onVerify(true, null)}
            disabled={isVerifying}
            className="flex-1 px-3 py-2 bg-green-500 text-white rounded text-sm font-bold hover:bg-green-600 disabled:opacity-50"
          >
            {isVerifying ? "..." : "✓ Approve"}
          </button>
          <button
            onClick={() => setShowRejectForm(!showRejectForm)}
            disabled={isVerifying}
            className="flex-1 px-3 py-2 bg-red-500 text-white rounded text-sm font-bold hover:bg-red-600 disabled:opacity-50"
          >
            {isVerifying ? "..." : "✗ Reject"}
          </button>
        </div>
      )}

      {showRejectForm && !doc.is_verified && (
        <div className="mt-3 pt-3 border-t">
          <textarea
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            placeholder="Enter rejection reason..."
            className="w-full p-2 text-sm border rounded"
            rows="2"
          />
          <button
            onClick={() => {
              onVerify(false, rejectionReason);
              setShowRejectForm(false);
              setRejectionReason("");
            }}
            disabled={isVerifying || !rejectionReason}
            className="mt-2 w-full px-3 py-2 bg-red-500 text-white rounded text-sm font-bold hover:bg-red-600 disabled:opacity-50"
          >
            {isVerifying ? "..." : "Confirm Rejection"}
          </button>
        </div>
      )}

      {(doc.is_verified || doc.rejection_reason) && (
        <button
          onClick={() => {
            const isApproving = !doc.is_verified && doc.rejection_reason;
            onVerify(isApproving, null);
          }}
          disabled={isVerifying}
          className="w-full mt-3 px-3 py-2 bg-gray-300 text-gray-800 rounded text-sm font-bold hover:bg-gray-400 disabled:opacity-50"
        >
          {isVerifying ? "..." : "Reset"}
        </button>
      )}
    </div>
  );
}
