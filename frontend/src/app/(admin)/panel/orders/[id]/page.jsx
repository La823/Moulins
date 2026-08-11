"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

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
  }, [id]);

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
  const handleUpdateItem = async (itemId, newQty, itemName) => {
    if (newQty < 1) return;
    if (!confirm(`Change quantity of "${itemName}" to ${newQty}?`)) return;
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
                {order.transport_mode === "transport" ? "By Transport" : "By Courier"}
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
                          onClick={() =>
                            handleUpdateItem(item.id, item.quantity - 1, item.product_name)
                          }
                          disabled={!canEdit || item.quantity <= 1}
                          className="w-7 h-7 rounded-md border border-gray-200 flex items-center justify-center text-gray-500 hover:border-gray-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          &minus;
                        </button>
                        <span className="w-8 text-center font-medium text-gray-900">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() =>
                            handleUpdateItem(item.id, item.quantity + 1, item.product_name)
                          }
                          disabled={!canEdit}
                          className="w-7 h-7 rounded-md border border-gray-200 flex items-center justify-center text-gray-500 hover:border-gray-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          +
                        </button>
                      </div>
                    </td>
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
    </div>
  );
}
