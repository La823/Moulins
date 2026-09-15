"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import MargBatchPickerModal from "@/components/admin/MargBatchPickerModal";

const STATUSES = [
  "pending",
  "confirmed",
  "transferred",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
];

const STATUS_STYLES = {
  pending: "bg-yellow-50 text-yellow-700",
  confirmed: "bg-blue-50 text-blue-700",
  transferred: "bg-indigo-50 text-indigo-700",
  shipped: "bg-purple-50 text-purple-700",
  delivered: "bg-green-50 text-green-700",
  cancelled: "bg-red-50 text-red-700",
  refunded: "bg-orange-50 text-orange-700",
};

// Marg batch expiry comes back as raw "YYYYMMDD" (e.g. "20270701") —
// render it as a readable date, falling back to the raw string if it
// doesn't parse (e.g. the placeholder all-spaces value for empty batches).
function formatBatchExpiry(raw) {
  const trimmed = raw?.trim();
  if (!trimmed || trimmed.length !== 8) return trimmed || "";
  const year = trimmed.slice(0, 4);
  const month = trimmed.slice(4, 6);
  const day = trimmed.slice(6, 8);
  const d = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return trimmed;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export default function AdminOrderDetail() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || (user?.permissions || []).includes("orders_edit");

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Editable items state (local copy)
  const [items, setItems] = useState([]);

  // Delivery form
  const [delivery, setDelivery] = useState({
    delivery_person: "",
    tracking_number: "",
    expected_delivery: "",
    delivery_notes: "",
    eway_bill_number: "",
  });
  const [savingDelivery, setSavingDelivery] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingTracking, setUploadingTracking] = useState(false);
  const [showMargModal, setShowMargModal] = useState(false);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [whatsAppError, setWhatsAppError] = useState("");
  const [sendLog, setSendLog] = useState([]);
  const [batchInfoByItem, setBatchInfoByItem] = useState({}); // { [order_item_id]: {curbatch, exp, marg_linked} }

  const loadSendLog = () =>
    apiFetch(`/admin/orders/${id}/send-log`)
      .then((data) => setSendLog(data.entries || []))
      .catch(() => {});

  const handleSendWhatsApp = async () => {
    setSendingWhatsApp(true);
    setWhatsAppError("");
    try {
      const { message, phone } = await apiFetch(`/admin/orders/${id}/whatsapp-message`);
      const digits = phone.replace(/[^\d]/g, "");
      window.open(`https://wa.me/${digits}?text=${encodeURIComponent(message)}`, "_blank");
      await apiFetch(`/admin/orders/${id}/whatsapp-sent`, {
        method: "POST",
        body: JSON.stringify({ key: "order_received_whatsapp", phone }),
      });
      loadSendLog();
    } catch (err) {
      setWhatsAppError(err.message);
    } finally {
      setSendingWhatsApp(false);
    }
  };

  const lastSent = (templateKey) =>
    sendLog.find((e) => e.template_key === templateKey);

  const [printingPDF, setPrintingPDF] = useState(false);
  const [printError, setPrintError] = useState("");

  // apiFetch always parses JSON, so the PDF download uses a plain fetch
  // with the same Bearer token, opening the resulting blob in a new tab.
  // The tab is opened synchronously (before the await) so it's still tied
  // to the click gesture — opening it only after the fetch resolves gets
  // silently blocked as a popup by most browsers.
  const handlePrintPDF = async () => {
    const newTab = window.open("", "_blank");
    setPrintingPDF(true);
    setPrintError("");
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
      const token = localStorage.getItem("token");
      const res = await fetch(`${apiUrl}/admin/orders/${id}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text() || "Could not generate PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (newTab) {
        newTab.location.href = url;
      } else {
        window.open(url, "_blank");
      }
      loadSendLog();
    } catch (err) {
      setPrintError(err.message);
      newTab?.close();
    } finally {
      setPrintingPDF(false);
    }
  };

  const loadOrder = () =>
    apiFetch(`/orders/${id}`).then((data) => {
      setOrder(data);
      setItems(data.items || []);
      setDelivery({
        delivery_person: data.delivery_person || "",
        tracking_number: data.tracking_number || "",
        expected_delivery: data.expected_delivery || "",
        delivery_notes: data.delivery_notes || "",
        eway_bill_number: data.eway_bill_number || "",
      });
      return data;
    });

  // Fetch order
  useEffect(() => {
    loadOrder()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    loadSendLog();
  }, [id]);

  // Live Marg batches per item (earliest expiry first, FEFO) — powers the
  // inline batch dropdown. The dropdown's own value is item.selected_batch_code
  // (persisted server-side, defaulting to the earliest-expiry batch here if
  // nothing's been picked yet).
  const loadBatchOptions = () =>
    apiFetch(`/admin/orders/${id}/marg-batch-options`)
      .then((data) => {
        const map = {};
        (data.items || []).forEach((it) => {
          map[it.order_item_id] = {
            batches: it.batches || [],
            defaultCode: it.default_code || "",
            margLinked: !!it.marg_linked,
          };
        });
        setBatchInfoByItem(map);
      })
      .catch(() => {});

  useEffect(() => {
    loadBatchOptions();
  }, [id]);

  const handleSelectBatch = async (item, batchCode) => {
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, selected_batch_code: batchCode } : i))
    );
    try {
      await apiFetch(`/admin/orders/${id}/items/${item.id}/batch`, {
        method: "PUT",
        body: JSON.stringify({ batch_code: batchCode }),
      });
    } catch (err) {
      setError(err.message);
    }
  };

  // Clear alerts after 4s
  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(""), 4000);
      return () => clearTimeout(t);
    }
  }, [success]);

  // --- Status change ---
  const handleStatusChange = async (newStatus) => {
    if (newStatus === order.status) return;
    if (!confirm(`Change order status from "${order.status}" to "${newStatus}"? The partner will see this update.`)) return;
    try {
      await apiFetch(`/admin/orders/${id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: newStatus }),
      });
      setOrder((prev) => ({ ...prev, status: newStatus }));
      loadOrder().catch(() => {});
      setSuccess("Status updated");
    } catch (err) {
      setError(err.message);
    }
  };

  // --- Save delivery details ---
  const handleSaveDelivery = async () => {
    if (!confirm("Save these delivery detail changes? The partner will see this update.")) return;
    setSavingDelivery(true);
    setError("");
    try {
      await apiFetch(`/admin/orders/${id}/details`, {
        method: "PUT",
        body: JSON.stringify({
          delivery_person: delivery.delivery_person || null,
          tracking_number: delivery.tracking_number || null,
          expected_delivery: delivery.expected_delivery || null,
          delivery_notes: delivery.delivery_notes || null,
          eway_bill_number: delivery.eway_bill_number || null,
        }),
      });
      loadOrder().catch(() => {});
      setSuccess("Delivery details saved");
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingDelivery(false);
    }
  };

  // --- Update item quantity ---
  const [qtyDrafts, setQtyDrafts] = useState({}); // { [itemId]: string } — pending textbox edits, not yet saved

  const handleUpdateItem = async (itemId, newQty) => {
    if (!Number.isInteger(newQty) || newQty < 1) return;
    try {
      await apiFetch(`/admin/orders/${id}/items/${itemId}`, {
        method: "PUT",
        body: JSON.stringify({ quantity: newQty }),
      });
      setItems((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, quantity: newQty } : i))
      );
      loadOrder().catch(() => {});
      setSuccess("Item quantity updated");
    } catch (err) {
      setError(err.message);
    }
  };

  const commitQtyDraft = (item) => {
    const raw = qtyDrafts[item.id];
    setQtyDrafts((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
    if (raw === undefined) return;
    const parsed = parseInt(raw, 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed === item.quantity) return;
    handleUpdateItem(item.id, parsed);
  };

  // --- Delete item ---
  const handleDeleteItem = async (itemId, itemName) => {
    if (!confirm(`Remove "${itemName}" from this order?`)) return;
    try {
      await apiFetch(`/admin/orders/${id}/items/${itemId}`, {
        method: "DELETE",
      });
      setItems((prev) => prev.filter((i) => i.id !== itemId));
      loadOrder().catch(() => {});
      setSuccess("Item removed from order");
    } catch (err) {
      setError(err.message);
    }
  };

  // --- Add product to order ---
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState([]);
  const [showProductResults, setShowProductResults] = useState(false);
  const [addingProduct, setAddingProduct] = useState(false);

  useEffect(() => {
    const q = productQuery.trim();
    if (!q) {
      setProductResults([]);
      return;
    }
    const t = setTimeout(() => {
      apiFetch(`/admin/products?search=${encodeURIComponent(q)}&limit=15`)
        .then((data) => setProductResults(data.products || []))
        .catch(() => setProductResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [productQuery]);

  const handleAddProduct = async (product) => {
    setProductQuery("");
    setProductResults([]);
    setShowProductResults(false);
    setAddingProduct(true);
    setError("");
    try {
      await apiFetch(`/admin/orders/${id}/items`, {
        method: "POST",
        body: JSON.stringify({
          product_id: product.id,
          product_name: product.name,
          quantity: Math.max(1, product.moq || 1),
        }),
      });
      await loadOrder();
      setSuccess(`${product.name} added to order`);
    } catch (err) {
      setError(err.message);
    } finally {
      setAddingProduct(false);
    }
  };

  // --- Bill photo upload ---
  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploadingPhoto(true);
    setError("");
    try {
      const { upload_url, key } = await apiFetch("/admin/orders/upload-url", {
        method: "POST",
        body: JSON.stringify({ filename: file.name }),
      });
      await fetch(upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      await apiFetch(`/admin/orders/${id}/photos`, {
        method: "POST",
        body: JSON.stringify({ image_key: key }),
      });
      loadOrder().catch(() => {});
      setSuccess("Bill photo attached");
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleDeletePhoto = async (photoId, label = "Bill photo") => {
    if (!confirm(`Remove this ${label.toLowerCase()}?`)) return;
    try {
      await apiFetch(`/admin/orders/photos/${photoId}`, { method: "DELETE" });
      loadOrder().catch(() => {});
      setSuccess(`${label} removed`);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleTrackingUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploadingTracking(true);
    setError("");
    try {
      const { upload_url, key } = await apiFetch(`/admin/orders/${id}/tracking-upload-url`, {
        method: "POST",
        body: JSON.stringify({ filename: file.name }),
      });
      await fetch(upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      await apiFetch(`/admin/orders/${id}/photos`, {
        method: "POST",
        body: JSON.stringify({ image_key: key, photo_type: "tracking" }),
      });
      loadOrder().catch(() => {});
      setSuccess("Tracking image attached");
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingTracking(false);
    }
  };

  // --- Loading ---
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-6 bg-gray-100 rounded w-1/4 animate-pulse" />
        <div className="h-40 bg-gray-100 rounded animate-pulse" />
        <div className="h-40 bg-gray-100 rounded animate-pulse" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-gray-400">Order not found</p>
        <Link
          href="/panel/orders"
          className="text-sm text-blue-600 hover:underline mt-2 inline-block"
        >
          Back to orders
        </Link>
      </div>
    );
  }

  const billPhotos = (order.photos || []).filter((p) => (p.photo_type || "bill") === "bill");
  const trackingPhotos = (order.photos || []).filter((p) => p.photo_type === "tracking");

  return (
    <div className="max-w-4xl">
      {/* Back link */}
      <Link
        href="/panel/orders"
        className="text-sm text-gray-400 hover:text-gray-700 transition-colors"
      >
        &larr; All orders
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between mt-4 mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Order Detail</h2>
          <p className="text-xs text-gray-400 font-mono mt-0.5">{order.id}</p>
        </div>
        {canEdit ? (
          <select
            value={order.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            className={`text-sm px-3 py-1.5 rounded-full font-medium capitalize border-0 outline-none cursor-pointer ${
              STATUS_STYLES[order.status] || "bg-gray-100 text-gray-600"
            }`}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        ) : (
          <span
            className={`text-sm px-3 py-1.5 rounded-full font-medium capitalize ${
              STATUS_STYLES[order.status] || "bg-gray-100 text-gray-600"
            }`}
          >
            {order.status}
          </span>
        )}
      </div>

      {/* WhatsApp order-received message */}
      <div className="mb-6 flex items-center gap-3 flex-wrap">
        <button
          onClick={handleSendWhatsApp}
          disabled={sendingWhatsApp}
          className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
            <path d="M12.002 2C6.478 2 2 6.477 2 12c0 1.833.488 3.599 1.415 5.153L2 22l4.943-1.393A9.955 9.955 0 0012.002 22C17.525 22 22 17.523 22 12S17.525 2 12.002 2zm0 18.086c-1.63 0-3.204-.436-4.58-1.263l-.328-.196-3.296.929.897-3.309-.216-.34A8.09 8.09 0 013.914 12c0-4.463 3.626-8.086 8.088-8.086 4.462 0 8.086 3.623 8.086 8.086 0 4.462-3.624 8.086-8.086 8.086z" />
          </svg>
          {sendingWhatsApp ? "Preparing..." : "Send WhatsApp Message"}
        </button>
        {lastSent("order_received_whatsapp") && (
          <span className="inline-flex items-center gap-1.5 text-xs text-green-700">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            Sent {new Date(lastSent("order_received_whatsapp").sent_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
          </span>
        )}
        {whatsAppError && <p className="text-xs text-red-600">{whatsAppError}</p>}

        {order.status !== "pending" && (
          <button
            onClick={handlePrintPDF}
            disabled={printingPDF}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
            </svg>
            {printingPDF ? "Preparing..." : "Print PDF"}
          </button>
        )}
        {lastSent("order_pdf_printed") && (
          <span className="text-xs text-gray-400">
            Last printed by {lastSent("order_pdf_printed").sent_by_name || "staff"} on{" "}
            {new Date(lastSent("order_pdf_printed").sent_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
          </span>
        )}
        {printError && <p className="text-xs text-red-600">{printError}</p>}
      </div>

      {/* Marg ERP push */}
      <div className="mb-6">
        {order.marg_order_no ? (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            Pushed to Marg — Order No. {order.marg_order_no}
            {order.marg_pushed_at && (
              <span className="text-green-500"> on {new Date(order.marg_pushed_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
            )}
          </div>
        ) : (
          canEdit &&
          order.status === "confirmed" && (
            <button
              onClick={() => setShowMargModal(true)}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
            >
              Send to Marg
            </button>
          )
        )}
      </div>

      {/* Alerts */}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
          <button
            onClick={() => setError("")}
            className="float-right text-red-400 hover:text-red-600"
          >
            &times;
          </button>
        </div>
      )}
      {success && (
        <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          {success}
        </div>
      )}

      <div className="space-y-6">
        {/* Partner Info */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Partner
          </h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-400">Name</span>
              <p className="text-gray-900 font-medium">
                {order.user_name || "—"}
              </p>
            </div>
            <div>
              <span className="text-gray-400">Phone</span>
              <p className="text-gray-900 font-medium">
                {order.user_phone || "—"}
              </p>
            </div>
            <div>
              <span className="text-gray-400">Transport Mode</span>
              <p className="text-gray-900 font-medium">
                {order.transport_mode
                  ? `By ${order.transport_mode.charAt(0).toUpperCase()}${order.transport_mode.slice(1)}`
                  : "—"}
              </p>
            </div>
            {order.transport_name && (
              <div>
                <span className="text-gray-400">Transport</span>
                <p className="text-gray-900 font-medium">
                  {order.transport_name}
                  {order.transport_gst_number && (
                    <span className="text-xs text-gray-400 font-normal"> · GST {order.transport_gst_number}</span>
                  )}
                </p>
              </div>
            )}
            <div>
              <span className="text-gray-400">Placed on</span>
              <p className="text-gray-900">
                {new Date(order.created_at).toLocaleDateString("en-IN", {
                  weekday: "short",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
            <div>
              <span className="text-gray-400">Last updated</span>
              <p className="text-gray-900">
                {new Date(order.updated_at).toLocaleDateString("en-IN", {
                  weekday: "short",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>
          {order.notes && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <span className="text-xs text-gray-400">Partner notes</span>
              <p className="text-sm text-gray-700 mt-1">{order.notes}</p>
            </div>
          )}
        </div>

        {/* Order Items — Editable */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">
              Order Items ({items.length})
            </h3>
            {canEdit && (
              <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                Edits visible to partner
              </span>
            )}
          </div>

          {items.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">
              No items in this order
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Product
                  </th>
                  <th className="text-center py-2 text-xs font-medium text-gray-400 uppercase tracking-wider w-32">
                    Quantity
                  </th>
                  <th className="text-left py-2 text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Batch
                  </th>
                  <th className="text-left py-2 text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Expiry
                  </th>
                  <th className="text-right py-2 text-xs font-medium text-gray-400 uppercase tracking-wider w-16">
                    &nbsp;
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-3 text-gray-900">
                      {item.product_name}
                    </td>
                    <td className="py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleUpdateItem(item.id, item.quantity - 1)}
                          disabled={!canEdit || item.quantity <= 1}
                          className="w-7 h-7 rounded-md border border-gray-200 flex items-center justify-center text-gray-500 hover:border-gray-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          &minus;
                        </button>
                        <input
                          type="number"
                          min={1}
                          value={qtyDrafts[item.id] ?? item.quantity}
                          disabled={!canEdit}
                          onChange={(e) =>
                            setQtyDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                          }
                          onBlur={() => commitQtyDraft(item)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                          }}
                          className="w-14 text-center font-medium text-gray-900 border border-gray-200 rounded-md py-1 focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                        <button
                          onClick={() => handleUpdateItem(item.id, item.quantity + 1)}
                          disabled={!canEdit}
                          className="w-7 h-7 rounded-md border border-gray-200 flex items-center justify-center text-gray-500 hover:border-gray-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          +
                        </button>
                      </div>
                    </td>
                    {(() => {
                      const info = batchInfoByItem[item.id];
                      const batches = info?.batches || [];
                      const currentCode = item.selected_batch_code || info?.defaultCode || "";
                      const currentBatch = batches.find((b) => b.code === currentCode);
                      if (!info || !info.margLinked) {
                        return (
                          <td colSpan={2} className="py-3 pl-4 text-gray-300">
                            {info?.margLinked === false ? "not Marg-linked" : "—"}
                          </td>
                        );
                      }
                      if (batches.length === 0) {
                        return (
                          <td colSpan={2} className="py-3 pl-4 text-amber-600 text-xs">
                            No live batches
                          </td>
                        );
                      }
                      return (
                        <>
                          <td className="py-3 pl-4">
                            <select
                              value={currentCode}
                              disabled={!canEdit}
                              onChange={(e) => handleSelectBatch(item, e.target.value)}
                              className="text-blue-600 font-medium border border-gray-200 rounded-md py-1 px-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:opacity-50 disabled:cursor-not-allowed bg-white"
                            >
                              {batches.map((b) => (
                                <option key={b.code} value={b.code}>
                                  {b.curbatch || "—"}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-3 text-red-600 font-medium">
                            {formatBatchExpiry(currentBatch?.exp) || <span className="text-gray-300 font-normal">—</span>}
                          </td>
                        </>
                      );
                    })()}
                    <td className="py-3 text-right">
                      {canEdit && (
                      <button
                        onClick={() =>
                          handleDeleteItem(item.id, item.product_name)
                        }
                        className="text-gray-300 hover:text-red-500 transition-colors"
                        title="Remove item"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.5}
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                          />
                        </svg>
                      </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {canEdit && (
            <div className="relative mt-4 max-w-sm">
              <input
                type="text"
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                onFocus={() => setShowProductResults(true)}
                onBlur={() => setTimeout(() => setShowProductResults(false), 150)}
                disabled={addingProduct}
                placeholder={addingProduct ? "Adding…" : "+ Add a product…"}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:opacity-50"
              />
              {showProductResults && productResults.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg text-sm">
                  {productResults.map((p) => (
                    <li
                      key={p.id}
                      onMouseDown={() => handleAddProduct(p)}
                      className="px-3 py-2 cursor-pointer hover:bg-gray-50 text-gray-800"
                    >
                      {p.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Bill Photos */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">
              Bill Photos ({billPhotos.length})
            </h3>
            {canEdit && (
              <label className="px-3 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 cursor-pointer transition-colors">
                {uploadingPhoto ? "Uploading..." : "+ Add Photo"}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  disabled={uploadingPhoto}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {billPhotos.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">
              No bill photos attached yet
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {billPhotos.map((photo) => (
                <div key={photo.id} className="relative group">
                  <a href={photo.image_url} target="_blank" rel="noopener noreferrer">
                    <img
                      src={photo.image_url}
                      alt="Bill"
                      className="w-full h-28 object-cover rounded-lg border border-gray-200"
                    />
                  </a>
                  {canEdit && (
                    <button
                      onClick={() => handleDeletePhoto(photo.id)}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove photo"
                    >
                      &times;
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Activity Timeline */}
        {order.events?.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">
              Activity Log
            </h3>
            <div className="relative pl-6">
              <div className="absolute left-[7px] top-1 bottom-1 w-px bg-gray-200" />
              <div className="space-y-3">
                {order.events.map((event, i) => (
                  <div key={event.id} className="relative flex gap-3">
                    <div className={`absolute -left-6 top-1 w-[9px] h-[9px] rounded-full border-2 ${
                      i === order.events.length - 1
                        ? "bg-gray-900 border-gray-900"
                        : "bg-white border-gray-300"
                    }`} />
                    <div className="min-w-0">
                      <p className="text-sm text-gray-900">{event.description}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-[10px] text-gray-400 font-mono">{event.event_type}</span>
                        <span className="text-[10px] text-gray-300">&middot;</span>
                        <span className="text-[10px] text-gray-400">
                          {new Date(event.created_at).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {event.actor_name && (
                          <>
                            <span className="text-[10px] text-gray-300">&middot;</span>
                            <span className="text-[10px] font-medium text-teal-700">
                              by {event.actor_name}
                              {event.actor_role ? ` (${event.actor_role})` : ""}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Delivery Details — Editable */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            Delivery Details
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Delivery Person
              </label>
              <input
                type="text"
                value={delivery.delivery_person}
                onChange={(e) =>
                  setDelivery((d) => ({
                    ...d,
                    delivery_person: e.target.value,
                  }))
                }
                placeholder="Name of delivery person"
                disabled={!canEdit}
                className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-200 rounded-lg focus:border-gray-400 outline-none transition-colors disabled:bg-gray-50 disabled:text-gray-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Tracking Number
              </label>
              <input
                type="text"
                value={delivery.tracking_number}
                onChange={(e) =>
                  setDelivery((d) => ({
                    ...d,
                    tracking_number: e.target.value,
                  }))
                }
                placeholder="Tracking or reference number"
                disabled={!canEdit}
                className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-200 rounded-lg focus:border-gray-400 outline-none transition-colors disabled:bg-gray-50 disabled:text-gray-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Expected Delivery
              </label>
              <input
                type="date"
                value={delivery.expected_delivery}
                onChange={(e) =>
                  setDelivery((d) => ({
                    ...d,
                    expected_delivery: e.target.value,
                  }))
                }
                disabled={!canEdit}
                className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-200 rounded-lg focus:border-gray-400 outline-none transition-colors disabled:bg-gray-50 disabled:text-gray-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                E-Way Bill Number <span className="text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                value={delivery.eway_bill_number}
                onChange={(e) =>
                  setDelivery((d) => ({
                    ...d,
                    eway_bill_number: e.target.value,
                  }))
                }
                placeholder="Only if an e-way bill was generated"
                disabled={!canEdit}
                className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-200 rounded-lg focus:border-gray-400 outline-none transition-colors disabled:bg-gray-50 disabled:text-gray-500"
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-xs text-gray-500 mb-1">
              Delivery Notes
            </label>
            <textarea
              value={delivery.delivery_notes}
              onChange={(e) =>
                setDelivery((d) => ({
                  ...d,
                  delivery_notes: e.target.value,
                }))
              }
              rows={2}
              placeholder="Any delivery instructions or notes..."
              disabled={!canEdit}
              className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-200 rounded-lg focus:border-gray-400 outline-none transition-colors resize-none disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs text-gray-500">
                Tracking Image
              </label>
              {canEdit && (
                <label className="px-3 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 cursor-pointer transition-colors">
                  {uploadingTracking ? "Uploading..." : "+ Add Tracking Image"}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleTrackingUpload}
                    disabled={uploadingTracking}
                    className="hidden"
                  />
                </label>
              )}
            </div>
            {trackingPhotos.length === 0 ? (
              <p className="text-sm text-gray-400 py-2 text-center border border-dashed border-gray-200 rounded-lg">
                No tracking image attached yet
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {trackingPhotos.map((photo) => (
                  <div key={photo.id} className="relative group">
                    <a href={photo.image_url} target="_blank" rel="noopener noreferrer">
                      <img
                        src={photo.image_url}
                        alt="Tracking"
                        className="w-full h-28 object-cover rounded-lg border border-gray-200"
                      />
                    </a>
                    {canEdit && (
                      <button
                        onClick={() => handleDeletePhoto(photo.id, "Tracking image")}
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove tracking image"
                      >
                        &times;
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {canEdit && (
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleSaveDelivery}
                disabled={savingDelivery}
                className="px-5 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                {savingDelivery ? "Saving..." : "Save Delivery Details"}
              </button>
            </div>
          )}
        </div>
      </div>

      {showMargModal && (
        <MargBatchPickerModal
          orderId={id}
          onClose={() => setShowMargModal(false)}
          onPushed={(result) => {
            setShowMargModal(false);
            setOrder((prev) => ({ ...prev, marg_order_no: result.marg_order_no, marg_pushed_at: new Date().toISOString() }));
            loadOrder().catch(() => {});
            setSuccess(`Order pushed to Marg — Order No. ${result.marg_order_no}`);
          }}
        />
      )}
    </div>
  );
}
