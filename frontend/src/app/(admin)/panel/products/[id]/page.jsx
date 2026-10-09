"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import ToastStack, { useToasts } from "@/components/admin/Toast";
import { HsnResult, useHsnLookup } from "@/components/admin/HsnLookup";
import ProductVisibilityPanel from "@/components/admin/ProductVisibilityPanel";
import ProductThumbnailCard from "@/components/admin/ProductThumbnailCard";

// Marg's raw "YYYYMMDD" batch expiry, shown as "MM/YYYY". The day is dropped
// deliberately: a batch expires at the end of its stated month, and Marg
// stores the first of the month regardless.
function fmtExp(raw) {
  const t = (raw || "").trim();
  if (t.length !== 8) return t || "—";
  return `${t.slice(4, 6)}/${t.slice(0, 4)}`;
}

export default function EditProduct() {
  const { id } = useParams();
  const router = useRouter();
  const { toasts, pushToast, dismissToast } = useToasts();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [savingMargCode, setSavingMargCode] = useState(false);
  const [catDropdownOpen, setCatDropdownOpen] = useState(false);
  const catRef = useRef(null);
  const [categoryOptions, setCategoryOptions] = useState([]);

  useEffect(() => {
    apiFetch("/products/categories")
      .then((data) => setCategoryOptions(Array.isArray(data) ? data.map((c) => c.name) : []))
      .catch(console.error);
  }, []);

  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const tagRef = useRef(null);
  const [tagOptions, setTagOptions] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);

  useEffect(() => {
    apiFetch("/products/tags")
      .then((data) => setTagOptions(Array.isArray(data) ? data : []))
      .catch(console.error);
  }, []);

  const toggleTag = (tag) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const tagColor = (name) => tagOptions.find((t) => t.name === name)?.color || "#6B7280";

  const [unitOptions, setUnitOptions] = useState([]);

  useEffect(() => {
    apiFetch("/products/units")
      .then((data) => setUnitOptions(Array.isArray(data) ? data.map((u) => u.name) : []))
      .catch(console.error);
  }, []);

  const [formOptions, setFormOptions] = useState([]);

  // Regulatory licence classification (Drug / Food / Cosmetic). Saved on its
  // own endpoint rather than through the main product form, so changing it
  // is one click and doesn't require submitting every other field.
  const [licenceTypes, setLicenceTypes] = useState([]);

  // HSN lookup for the code typed into the form — verifies the code is real
  // and shows what it actually covers, without leaving the page.
  const hsn = useHsnLookup();
  const [licenceTypeId, setLicenceTypeId] = useState("");
  const [foodType, setFoodType] = useState("");
  const [savingLicence, setSavingLicence] = useState(false);
  const [licenceMsg, setLicenceMsg] = useState("");

  useEffect(() => {
    apiFetch("/admin/product-licence-types")
      .then((data) => setLicenceTypes(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // True when the selected licence type is the Food one — veg/non-veg only
  // applies there. Resolved by name rather than a hardcoded id, since the
  // licence types table is admin-editable.
  const isFood = licenceTypes.some(
    (t) => String(t.id) === String(licenceTypeId) && t.name.toLowerCase() === "food",
  );

  const saveLicence = async (typeId, food) => {
    setSavingLicence(true);
    setLicenceMsg("");
    try {
      await apiFetch(`/admin/products/${id}/licence-type`, {
        method: "PUT",
        body: JSON.stringify({
          licence_type_id: typeId === "" ? null : Number(typeId),
          food_type: food === "" ? null : food,
        }),
      });
      setLicenceMsg("Saved");
      setTimeout(() => setLicenceMsg(""), 2500);
    } catch (err) {
      setLicenceMsg(err.message || "Could not save");
    } finally {
      setSavingLicence(false);
    }
  };

  const handleLicenceChange = async (value) => {
    setLicenceTypeId(value);
    // Moving away from Food clears veg/non-veg — it would otherwise linger
    // on a product it no longer applies to.
    const nowFood = licenceTypes.some(
      (t) => String(t.id) === String(value) && t.name.toLowerCase() === "food",
    );
    const nextFood = nowFood ? foodType : "";
    setFoodType(nextFood);
    await saveLicence(value, nextFood);
  };

  const handleFoodTypeChange = async (value) => {
    setFoodType(value);
    await saveLicence(licenceTypeId, value);
  };

  useEffect(() => {
    apiFetch("/products/forms")
      .then((data) => setFormOptions(Array.isArray(data) ? data : []))
      .catch(console.error);
  }, []);

  // Warehouse inventory code (e.g. "T-14") — assigned automatically from the
  // product's form, shown read-only here. Fetched separately rather than as
  // part of the main product payload so it stays purely additive.
  const [inventoryInfo, setInventoryInfo] = useState(null);
  const [inventoryInfoError, setInventoryInfoError] = useState("");

  const fetchInventoryInfo = () => {
    if (!id) return;
    apiFetch(`/admin/products/${id}/inventory-code`)
      .then((data) => setInventoryInfo(data))
      .catch((err) => setInventoryInfoError(err.message));
  };

  useEffect(fetchInventoryInfo, [id]);

  // Form state
  // Marg batches for this product, FEFO-ordered (earliest expiry first), used
  // by the MRP picker. Empty for products not linked to Marg.
  const [batches, setBatches] = useState([]);
  // The batch the MRP follows. Marked in the database, one per product, and
  // moved on to the next FEFO batch by the Marg sync when it sells out.
  const currentBatch = batches.find((b) => b.is_current) || null;
  const [settingBatch, setSettingBatch] = useState(null);

  const loadBatches = () =>
    apiFetch(`/admin/products/${id}/batches`)
      .then((d) => setBatches(Array.isArray(d?.batches) ? d.batches : []))
      .catch(() => setBatches([]));

  const makeCurrent = async (b) => {
    setSettingBatch(b.id);
    try {
      await apiFetch(`/admin/products/${id}/batches/${b.id}/current`, { method: "PUT" });
      // The endpoint copies the batch MRP into products.mrp; mirror it in the
      // form so a later Save does not write the old figure back over it.
      if (b.mrp != null) setForm((f) => ({ ...f, mrp: String(b.mrp) }));
      await loadBatches();
    } catch (err) {
      alert(err.message || "Could not set the current batch");
    } finally {
      setSettingBatch(null);
    }
  };

  const [form, setForm] = useState({
    product_id: "",
    name: "",
    description: "",
    price: "",
    moq: "",
    is_active: true,
    brand_name: "",
    hsn_code: "",
    gst_rate: "",
    mrp: "",
    mrp_unit: "",
    product_form: "",
    consume_type: "",
    pack_size: "",
    pack_form: "",
    key_ingredients: "",
    strength: "",
    product_weight: "",
    length_cm: "",
    width_cm: "",
    height_cm: "",
    key_benefits: "",
    direction_for_use: "",
    safety_information: "",
    edetailing: "",
    marg_code: "",
  });
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [images, setImages] = useState([]);
  // card thumbnail: a small copy of the first image (see ProductThumbnailCard)
  const [thumb, setThumb] = useState({ url: "", source: "" });
  const firstImageKey = images.find((img) => !img.hidden)?.image_key || "";
  const [documents, setDocuments] = useState([]);
  const [newImageFiles, setNewImageFiles] = useState([]);
  const [newPdfFiles, setNewPdfFiles] = useState([]);
  const [audioUrl, setAudioUrl] = useState(null);
  const [newAudioFile, setNewAudioFile] = useState(null);
  const [newAudioPreviewUrl, setNewAudioPreviewUrl] = useState(null);
  const [removeAudio, setRemoveAudio] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [recordError, setRecordError] = useState("");
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordTimerRef = useRef(null);

  // Fetch product data
  useEffect(() => {
    loadBatches();

    apiFetch(`/products/${id}`)
      .then((p) => {
        setForm({
          product_id: p.product_id != null ? String(p.product_id) : "",
          name: p.name || "",
          description: p.description || "",
          price: p.price != null ? String(p.price) : "",
          moq: p.moq != null ? String(p.moq) : "",
          is_active: p.is_active ?? true,
          brand_name: p.brand_name || "",
          hsn_code: p.hsn_code || "",
          gst_rate: p.gst_rate != null ? String(p.gst_rate) : "",
          mrp: p.mrp != null ? String(p.mrp) : "",
          mrp_unit: p.mrp_unit || "",
          product_form: p.product_form || "",
          consume_type: p.consume_type || "",
          pack_size: p.pack_size || "",
          pack_form: p.pack_form || "",
          key_ingredients: p.key_ingredients || "",
          strength: p.strength || "",
          product_weight: p.product_weight || "",
          length_cm: p.length_cm != null ? String(p.length_cm) : "",
          width_cm: p.width_cm != null ? String(p.width_cm) : "",
          height_cm: p.height_cm != null ? String(p.height_cm) : "",
          key_benefits: p.key_benefits || "",
          direction_for_use: p.direction_for_use || "",
          safety_information: p.safety_information || "",
          edetailing: p.edetailing || "",
          marg_code: p.marg_code || "",
        });
        setLicenceTypeId(p.licence_type_id != null ? String(p.licence_type_id) : "");
        setFoodType(p.food_type || "");
        setSelectedCategories(p.categories || []);
        setSelectedTags(p.tags || []);
        setImages(p.images || []);
        setThumb({ url: p.thumb_url || "", source: p.thumb_source_key || "" });
        setDocuments(p.documents || []);
        setAudioUrl(p.audio_url || null);
      })
      .catch(() => setError("Could not load product"))
      .finally(() => setLoading(false));
  }, [id]);

  // Close category/tag dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (catRef.current && !catRef.current.contains(e.target)) {
        setCatDropdownOpen(false);
      }
      if (tagRef.current && !tagRef.current.contains(e.target)) {
        setTagDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    return () => clearInterval(recordTimerRef.current);
  }, []);

  const toggleCategory = (cat) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const uploadFileToS3 = async (file, urlEndpoint) => {
    const { upload_url, key } = await apiFetch(urlEndpoint, {
      method: "POST",
      body: JSON.stringify({ filename: file.name }),
    });
    await fetch(upload_url, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type },
    });
    return key;
  };

  // Save product details
  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);

    try {
      const body = {
        product_id: form.product_id ? parseInt(form.product_id) : null,
        name: form.name,
        description: form.description,
        price: parseFloat(form.price) || 0,
        categories: selectedCategories,
        tags: selectedTags,
        moq: form.moq ? parseInt(form.moq) : null,
        is_active: form.is_active,
        brand_name: form.brand_name || null,
        hsn_code: form.hsn_code || null,
        gst_rate: form.gst_rate ? parseFloat(form.gst_rate) : null,
        mrp: form.mrp ? parseFloat(form.mrp) : null,
        mrp_unit: form.mrp_unit || null,
        product_form: form.product_form || null,
        consume_type: form.consume_type || null,
        pack_size: form.pack_size || null,
        pack_form: form.pack_form || null,
        key_ingredients: form.key_ingredients || null,
        strength: form.strength || null,
        product_weight: form.product_weight || null,
        length_cm: form.length_cm ? parseFloat(form.length_cm) : null,
        width_cm: form.width_cm ? parseFloat(form.width_cm) : null,
        height_cm: form.height_cm ? parseFloat(form.height_cm) : null,
        key_benefits: form.key_benefits || null,
        direction_for_use: form.direction_for_use || null,
        safety_information: form.safety_information || null,
        edetailing: form.edetailing || null,
        marg_code: form.marg_code.trim() || null,
      };

      await apiFetch(`/admin/products/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });

      // Upload new images
      for (let i = 0; i < newImageFiles.length; i++) {
        const imageKey = await uploadFileToS3(
          newImageFiles[i],
          "/admin/products/upload-url"
        );
        await apiFetch(`/admin/products/${id}/images`, {
          method: "POST",
          body: JSON.stringify({
            image_key: imageKey,
            sort_order: images.length + i,
          }),
        });
      }

      // Upload new PDFs
      for (const pdf of newPdfFiles) {
        const fileKey = await uploadFileToS3(
          pdf.file,
          "/admin/products/document-upload-url"
        );
        await apiFetch(`/admin/products/${id}/documents`, {
          method: "POST",
          body: JSON.stringify({ name: pdf.name, file_key: fileKey }),
        });
      }

      // Upload/replace audio, or clear it
      if (newAudioFile) {
        const audioKey = await uploadFileToS3(newAudioFile, "/admin/products/document-upload-url");
        await apiFetch(`/admin/products/${id}/audio`, {
          method: "PUT",
          body: JSON.stringify({ file_key: audioKey }),
        });
      } else if (removeAudio) {
        await apiFetch(`/admin/products/${id}/audio`, {
          method: "PUT",
          body: JSON.stringify({ file_key: "" }),
        });
      }

      // Refresh product data
      const updated = await apiFetch(`/products/${id}`);
      setImages(updated.images || []);
      setThumb({ url: updated.thumb_url || "", source: updated.thumb_source_key || "" });
      // a product's first thumbnail is made in the background after its first
      // image is added — pick it up a moment later
      if (!updated.thumb_url && (updated.images || []).length) {
        setTimeout(() => {
          apiFetch(`/products/${id}`)
            .then((p) => setThumb({ url: p.thumb_url || "", source: p.thumb_source_key || "" }))
            .catch(() => {});
        }, 4000);
      }
      setDocuments(updated.documents || []);
      setAudioUrl(updated.audio_url || null);
      setNewImageFiles([]);
      setNewPdfFiles([]);
      setNewAudioFile(null);
      setNewAudioPreviewUrl(null);
      setRemoveAudio(false);
      fetchInventoryInfo();
      setSuccess("Product saved successfully");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Saves just the Marg Base Code field, independent of the full-form save
  // above — lets an admin link/relink a product to Marg without touching
  // (or re-submitting) everything else on the page.
  const handleSaveMargCode = async () => {
    setSavingMargCode(true);
    try {
      await apiFetch(`/admin/products/${id}`, {
        method: "PUT",
        body: JSON.stringify({ marg_code: form.marg_code.trim() || null }),
      });
      pushToast("success", "Marg base code saved");
    } catch (err) {
      pushToast("error", err.message || "Could not save Marg base code");
    } finally {
      setSavingMargCode(false);
    }
  };

  const startRecording = async () => {
    setRecordError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordedChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const ext = (recorder.mimeType || "audio/webm").includes("ogg") ? "ogg" : "webm";
        const file = new File([blob], `recording-${Date.now()}.${ext}`, { type: blob.type });
        setNewAudioFile(file);
        setNewAudioPreviewUrl(URL.createObjectURL(blob));
        setRemoveAudio(false);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch (err) {
      setRecordError("Could not access microphone");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    clearInterval(recordTimerRef.current);
    setRecording(false);
  };

  const handleDeleteImage = async (imgId) => {
    try {
      await apiFetch(`/admin/products/images/${imgId}`, { method: "DELETE" });
      setImages(images.filter((img) => img.id !== imgId));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleToggleVisualAid = async (imgId, visualAid) => {
    setImages(images.map((img) => (img.id === imgId ? { ...img, visual_aid: visualAid } : img)));
    try {
      await apiFetch(`/admin/products/images/${imgId}/visual-aid`, {
        method: "PATCH",
        body: JSON.stringify({ visual_aid: visualAid }),
      });
    } catch (err) {
      setImages(images.map((img) => (img.id === imgId ? { ...img, visual_aid: !visualAid } : img)));
      alert(err.message);
    }
  };

  const handleToggleHidden = async (imgId, hidden) => {
    setImages(images.map((img) => (img.id === imgId ? { ...img, hidden } : img)));
    try {
      await apiFetch(`/admin/products/images/${imgId}/hidden`, {
        method: "PATCH",
        body: JSON.stringify({ hidden }),
      });
    } catch (err) {
      setImages(images.map((img) => (img.id === imgId ? { ...img, hidden: !hidden } : img)));
      alert(err.message);
    }
  };

  const handleDeleteDoc = async (docId) => {
    try {
      await apiFetch(`/admin/products/documents/${docId}`, {
        method: "DELETE",
      });
      setDocuments(documents.filter((d) => d.id !== docId));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleAddImages = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    setNewImageFiles([...newImageFiles, ...files]);
    e.target.value = "";
  };

  const removeNewImage = (index) => {
    setNewImageFiles(newImageFiles.filter((_, i) => i !== index));
  };

  const handleAddPdf = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const displayName = file.name.replace(/\.pdf$/i, "");
    setNewPdfFiles([...newPdfFiles, { file, name: displayName }]);
    e.target.value = "";
  };

  const removeNewPdf = (index) => {
    setNewPdfFiles(newPdfFiles.filter((_, i) => i !== index));
  };

  if (loading) return <p className="text-gray-500">Loading product...</p>;

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link
            href="/panel/products"
            className="text-gray-400 hover:text-gray-600 text-sm"
          >
            &larr; Back
          </Link>
          <h2 className="text-lg font-semibold text-gray-800">Edit Product</h2>
          <span
            className={`text-xs font-mono px-2 py-1 rounded-md ${
              inventoryInfoError ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-600"
            }`}
            title={
              inventoryInfoError ||
              "Warehouse inventory code — assigned automatically from the Product Form field below, permanent once set"
            }
          >
            {inventoryInfoError
              ? "Inventory code unavailable"
              : inventoryInfo?.inventory_code || "No inventory code yet"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              setForm({ ...form, is_active: !form.is_active })
            }
            className={`text-xs px-3 py-1.5 rounded-full font-medium ${
              form.is_active
                ? "bg-green-100 text-green-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {form.is_active ? "Active" : "Hidden"}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 mb-4 bg-red-50 px-3 py-2 rounded-lg">
          {error}
        </p>
      )}
      {success && (
        <p className="text-sm text-green-600 mb-4 bg-green-50 px-3 py-2 rounded-lg">
          {success}
        </p>
      )}

      <form onSubmit={handleSave} className="space-y-6 max-w-3xl">
        {/* Basic Info */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Basic Info
          </h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Product ID
            </label>
            <input
              type="number"
              value={form.product_id}
              onChange={(e) => setForm({ ...form, product_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            />
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Selling Price
              </label>
              <input
                type="number"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                MRP
              </label>
              <input
                type="number"
                step="0.01"
                value={form.mrp}
                onChange={(e) => setForm({ ...form, mrp: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
              {/* The product's batches, earliest expiry first. The current
                  one is what the MRP follows; when it sells out the Marg sync
                  moves the flag to the next batch with stock and the MRP goes
                  with it. Choosing one here does the same by hand. The MRP
                  field above stays editable either way. */}
              {batches.length > 0 && (
                <div className="mt-2">
                  <label className="block text-[11px] font-medium text-gray-500 mb-1">
                    Current batch — MRP follows it
                  </label>
                  <select
                    value={currentBatch?.id || ""}
                    disabled={settingBatch !== null}
                    onChange={(e) => {
                      const b = batches.find((x) => x.id === e.target.value);
                      if (b && !b.is_current) makeCurrent(b);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white text-gray-900 disabled:opacity-50"
                  >
                    {!currentBatch && <option value="">No current batch</option>}
                    {batches.map((b) => {
                      const stock = Number(b.stock ?? 0);
                      return (
                        // A batch with no stock cannot be current — the next
                        // sync would move the flag straight off it.
                        <option key={b.id} value={b.id} disabled={stock <= 0 && !b.is_current}>
                          {b.curbatch || "(no code)"} · {fmtExp(b.exp)} · ₹{b.mrp ?? "—"} · stock {stock}
                          {stock <= 0 ? " (no stock)" : ""}
                        </option>
                      );
                    })}
                  </select>
                  {settingBatch !== null && (
                    <p className="text-[11px] text-gray-400 mt-1">Updating…</p>
                  )}
                  {currentBatch?.mrp != null && String(currentBatch.mrp) !== String(form.mrp) && (
                    <p className="text-[11px] text-amber-700 mt-1">
                      Current batch MRP is ₹{currentBatch.mrp} — differs from the MRP above.
                    </p>
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                MRP Unit
              </label>
              <select
                value={form.mrp_unit}
                onChange={(e) => setForm({ ...form, mrp_unit: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              >
                <option value="">Select unit</option>
                {unitOptions.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                MOQ
              </label>
              <input
                type="number"
                min="1"
                placeholder="1"
                value={form.moq}
                onChange={(e) => setForm({ ...form, moq: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
            </div>
          </div>

          {/* Categories */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Categories
            </label>
            <div ref={catRef} className="relative">
              <div
                onClick={() => setCatDropdownOpen(!catDropdownOpen)}
                className="w-full min-h-[42px] px-3 py-2 border border-gray-300 rounded-lg text-sm cursor-pointer flex flex-wrap items-center gap-1.5"
              >
                {selectedCategories.length === 0 && (
                  <span className="text-gray-400">Select categories...</span>
                )}
                {selectedCategories.map((cat) => (
                  <span
                    key={cat}
                    className="inline-flex items-center gap-1 bg-gray-900 text-white text-xs font-medium px-2.5 py-1 rounded-full"
                  >
                    {cat}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCategory(cat);
                      }}
                      className="hover:text-gray-300 text-[10px] leading-none"
                    >
                      x
                    </button>
                  </span>
                ))}
              </div>
              {catDropdownOpen && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg py-1 max-h-48 overflow-y-auto">
                  {categoryOptions.map((cat) => {
                    const selected = selectedCategories.includes(cat);
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => toggleCategory(cat)}
                        className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-gray-50 ${
                          selected
                            ? "text-gray-900 font-medium"
                            : "text-gray-600"
                        }`}
                      >
                        {cat}
                        {selected && (
                          <span className="text-gray-900 text-xs">
                            &#10003;
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tags
            </label>
            <div ref={tagRef} className="relative">
              <div
                onClick={() => setTagDropdownOpen(!tagDropdownOpen)}
                className="w-full min-h-[42px] px-3 py-2 border border-gray-300 rounded-lg text-sm cursor-pointer flex flex-wrap items-center gap-1.5"
              >
                {selectedTags.length === 0 && (
                  <span className="text-gray-400">Select tags...</span>
                )}
                {selectedTags.map((tag) => (
                  <span
                    key={tag}
                    style={{ backgroundColor: tagColor(tag) }}
                    className="inline-flex items-center gap-1 text-white text-xs font-medium px-2.5 py-1 rounded-full"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTag(tag);
                      }}
                      className="hover:opacity-70 text-[10px] leading-none"
                    >
                      x
                    </button>
                  </span>
                ))}
              </div>
              {tagDropdownOpen && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg py-1 max-h-48 overflow-y-auto">
                  {tagOptions.map((tag) => {
                    const selected = selectedTags.includes(tag.name);
                    return (
                      <button
                        key={tag.name}
                        type="button"
                        onClick={() => toggleTag(tag.name)}
                        className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-50 ${
                          selected
                            ? "text-gray-900 font-medium"
                            : "text-gray-600"
                        }`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0 border border-black/10"
                          style={{ backgroundColor: tag.color || "#6B7280" }}
                        />
                        <span className="flex-1">{tag.name}</span>
                        {selected && (
                          <span className="text-gray-900 text-xs">
                            &#10003;
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Product Details */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Product Details
          </h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Marg Base Code
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={form.marg_code}
                onChange={(e) => setForm({ ...form, marg_code: e.target.value })}
                placeholder="e.g. 1002126 — links this product to its Marg ERP record"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 font-mono"
              />
              <button
                type="button"
                onClick={handleSaveMargCode}
                disabled={savingMargCode}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 whitespace-nowrap"
              >
                {savingMargCode ? "Saving..." : "Save"}
              </button>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Find the base code on the <a href="/panel/marg-products" className="underline hover:text-gray-600">Marg Products</a> page.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Brand Name
              </label>
              <input
                type="text"
                value={form.brand_name}
                onChange={(e) =>
                  setForm({ ...form, brand_name: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                HSN Code
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={form.hsn_code}
                  onChange={(e) => {
                    setForm({ ...form, hsn_code: e.target.value });
                    hsn.reset();
                  }}
                  onKeyDown={(e) => {
                    // Enter looks the code up rather than submitting the whole
                    // product form, which is what a bare Enter would do here.
                    if (e.key === "Enter") {
                      e.preventDefault();
                      hsn.lookup(form.hsn_code);
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                />
                <button
                  type="button"
                  onClick={() => hsn.lookup(form.hsn_code)}
                  disabled={hsn.loading || !form.hsn_code?.trim()}
                  title="Look this HSN code up in the master"
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap"
                >
                  {hsn.loading ? "…" : "Search"}
                </button>
              </div>
              {hsn.error && (
                <p className="text-xs text-red-600 mt-1">{hsn.error}</p>
              )}
              {hsn.result && (
                <div className="mt-2">
                  <HsnResult result={hsn.result} compact />
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                GST Rate
              </label>
              <input
                type="number"
                step="0.0001"
                value={form.gst_rate}
                onChange={(e) =>
                  setForm({ ...form, gst_rate: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Product Form
              </label>
              <p className="text-[11px] text-gray-400 mb-1">
                The dosage/pack form of this product (Tablet, Syrup, Injection, etc.) — used to filter and
                group products by type across the catalog and warehouse.
              </p>
              <select
                value={form.product_form}
                onChange={(e) =>
                  setForm({ ...form, product_form: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              >
                <option value="">Select form</option>
                {form.product_form && !formOptions.includes(form.product_form) && (
                  <option value={form.product_form}>{form.product_form} (current)</option>
                )}
                {formOptions.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              {inventoryInfo?.inventory_code && (
                <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg">
                  <span className="text-sm text-gray-600">Warehouse inventory code:</span>
                  <span className="font-mono font-semibold text-base text-blue-800">
                    {inventoryInfo.inventory_code}
                  </span>
                  <span className="text-xs text-gray-400">(assigned automatically, permanent once set)</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Licence Type
              </label>
              <p className="text-[11px] text-gray-400 mb-1">
                The regulatory licence this product is sold under. Manage the
                list under Licence Types in the panel.
              </p>
              <div className="flex items-center gap-2">
                <select
                  value={licenceTypeId}
                  onChange={(e) => handleLicenceChange(e.target.value)}
                  disabled={savingLicence}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 disabled:opacity-60"
                >
                  <option value="">Not classified</option>
                  {licenceTypes.map((t) => (
                    <option key={t.id} value={String(t.id)}>
                      {t.name}
                    </option>
                  ))}
                </select>
                {licenceMsg && (
                  <span
                    className={`text-xs whitespace-nowrap ${
                      licenceMsg === "Saved" ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {licenceMsg}
                  </span>
                )}
              </div>

              {isFood && (
                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Veg / Non-Veg
                  </label>
                  <p className="text-[11px] text-gray-400 mb-1">
                    Required on food products — the FSSAI green or brown mark.
                  </p>
                  <select
                    value={foodType}
                    onChange={(e) => handleFoodTypeChange(e.target.value)}
                    disabled={savingLicence}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 disabled:opacity-60"
                  >
                    <option value="">Not set</option>
                    <option value="Veg">Veg</option>
                    <option value="Non-Veg">Non-Veg</option>
                  </select>
                  {!foodType && (
                    <p className="text-[11px] text-amber-600 mt-1">
                      Not set — food products should be marked Veg or Non-Veg.
                    </p>
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Consume Type
              </label>
              <input
                type="text"
                value={form.consume_type}
                onChange={(e) =>
                  setForm({ ...form, consume_type: e.target.value })
                }
                placeholder="Oral, Topical..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Pack Size
              </label>
              <input
                type="text"
                value={form.pack_size}
                onChange={(e) =>
                  setForm({ ...form, pack_size: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Pack Form
              </label>
              <input
                type="text"
                value={form.pack_form}
                onChange={(e) =>
                  setForm({ ...form, pack_form: e.target.value })
                }
                placeholder="Bottle, Strip, Tube..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Product Weight
              </label>
              <input
                type="text"
                value={form.product_weight}
                onChange={(e) =>
                  setForm({ ...form, product_weight: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Length (cm)
              </label>
              <input
                type="number"
                step="0.01"
                value={form.length_cm}
                onChange={(e) =>
                  setForm({ ...form, length_cm: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Width (cm)
              </label>
              <input
                type="number"
                step="0.01"
                value={form.width_cm}
                onChange={(e) =>
                  setForm({ ...form, width_cm: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Height (cm)
              </label>
              <input
                type="number"
                step="0.01"
                value={form.height_cm}
                onChange={(e) =>
                  setForm({ ...form, height_cm: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
            </div>
          </div>
        </section>

        {/* Ingredients & Usage */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Ingredients & Usage
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Key Ingredients
              </label>
              <textarea
                value={form.key_ingredients}
                onChange={(e) =>
                  setForm({ ...form, key_ingredients: e.target.value })
                }
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Strength
              </label>
              <textarea
                value={form.strength}
                onChange={(e) =>
                  setForm({ ...form, strength: e.target.value })
                }
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Key Benefits
            </label>
            <textarea
              value={form.key_benefits}
              onChange={(e) =>
                setForm({ ...form, key_benefits: e.target.value })
              }
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Direction for Use
            </label>
            <textarea
              value={form.direction_for_use}
              onChange={(e) =>
                setForm({ ...form, direction_for_use: e.target.value })
              }
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Safety Information
            </label>
            <textarea
              value={form.safety_information}
              onChange={(e) =>
                setForm({ ...form, safety_information: e.target.value })
              }
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Edetailing
            </label>
            <textarea
              value={form.edetailing}
              onChange={(e) =>
                setForm({ ...form, edetailing: e.target.value })
              }
              rows={4}
              placeholder="Detailing script / talking points for reps..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            />
          </div>
        </section>

        {/* Images */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Images
          </h3>
          <ProductThumbnailCard
            productId={id}
            thumbUrl={thumb.url}
            sourceKey={thumb.source}
            firstImageKey={firstImageKey}
            onChange={setThumb}
          />
          {images.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {images.map((img) => (
                <div key={img.id} className="relative group">
                  <img
                    src={img.image_url}
                    alt="Product"
                    className={`w-24 h-24 object-cover rounded-lg border-2 transition-colors ${
                      img.visual_aid
                        ? "border-teal-500 ring-2 ring-teal-200"
                        : "border-gray-200"
                    } ${img.hidden ? "opacity-40 grayscale" : ""}`}
                  />
                  {img.hidden && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="bg-gray-900/80 text-white text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded">
                        Hidden
                      </span>
                    </div>
                  )}
                  {img.visual_aid && (
                    <div
                      title="Visual aid — recommended for partner slideshow presentations"
                      className="absolute top-1 left-1 w-5 h-5 rounded-full bg-teal-500 text-white flex items-center justify-center text-[10px] font-bold shadow"
                    >
                      V
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDeleteImage(img.id)}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    x
                  </button>
                  <label
                    title="Recommended for partner slideshow presentations"
                    className={`absolute bottom-1 left-1 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] cursor-pointer ${
                      img.visual_aid ? "bg-teal-500 text-white" : "bg-white/90 text-gray-600"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={!!img.visual_aid}
                      onChange={(e) => handleToggleVisualAid(img.id, e.target.checked)}
                      className="w-3 h-3"
                    />
                    Visual aid
                  </label>
                  <label
                    title="Hide this image from customer-facing pages"
                    className={`absolute bottom-1 right-1 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] cursor-pointer ${
                      img.hidden ? "bg-gray-900 text-white" : "bg-white/90 text-gray-600 opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={!!img.hidden}
                      onChange={(e) => handleToggleHidden(img.id, e.target.checked)}
                      className="w-3 h-3"
                    />
                    Hide
                  </label>
                </div>
              ))}
            </div>
          )}
          <div>
            <label className="block text-sm text-gray-600 mb-1">
              Add new images
            </label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleAddImages}
              className="text-sm text-gray-600"
            />
            {newImageFiles.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {newImageFiles.map((file, i) => (
                  <div
                    key={i}
                    className="relative group w-20 h-20 rounded-lg overflow-hidden border border-gray-200"
                  >
                    <img
                      src={URL.createObjectURL(file)}
                      alt={file.name}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeNewImage(i)}
                      className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Documents */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Documents
          </h3>
          {documents.length > 0 && (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-lg text-sm"
                >
                  <a
                    href={doc.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    {doc.name}
                  </a>
                  <button
                    type="button"
                    onClick={() => handleDeleteDoc(doc.id)}
                    className="text-red-500 text-xs hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          <div>
            <label className="block text-sm text-gray-600 mb-1">
              Add new PDF
            </label>
            <input
              type="file"
              accept=".pdf"
              onChange={handleAddPdf}
              className="text-sm text-gray-600"
            />
            {newPdfFiles.length > 0 && (
              <div className="mt-2 space-y-1">
                {newPdfFiles.map((pdf, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between bg-gray-50 px-3 py-1.5 rounded text-sm"
                  >
                    <input
                      type="text"
                      value={pdf.name}
                      onChange={(e) => {
                        const updated = [...newPdfFiles];
                        updated[i].name = e.target.value;
                        setNewPdfFiles(updated);
                      }}
                      className="bg-transparent border-none text-gray-700 text-sm flex-1 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => removeNewPdf(i)}
                      className="text-red-500 text-xs ml-2"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Audio */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Audio
          </h3>
          {audioUrl && !removeAudio && !newAudioFile && (
            <div className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-lg gap-3">
              <audio controls src={audioUrl} className="flex-1 h-9" />
              <button
                type="button"
                onClick={() => setRemoveAudio(true)}
                className="text-red-500 text-xs hover:text-red-700 flex-shrink-0"
              >
                Remove
              </button>
            </div>
          )}
          {removeAudio && (
            <p className="text-xs text-gray-500">Audio will be removed when you save.</p>
          )}

          {newAudioPreviewUrl && (
            <div className="bg-gray-50 px-3 py-2 rounded-lg">
              <audio controls src={newAudioPreviewUrl} className="w-full h-9" />
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-gray-400">Not saved yet — click Save Changes to upload</p>
                <button
                  type="button"
                  onClick={() => {
                    setNewAudioFile(null);
                    setNewAudioPreviewUrl(null);
                  }}
                  className="text-red-500 text-xs hover:text-red-700 flex-shrink-0"
                >
                  Discard
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={recording ? stopRecording : startRecording}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
                recording ? "bg-red-600 text-white" : "bg-gray-900 text-white hover:bg-gray-800"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${recording ? "bg-white animate-pulse" : "bg-red-500"}`} />
              {recording ? `Stop (${String(Math.floor(recordSeconds / 60)).padStart(2, "0")}:${String(recordSeconds % 60).padStart(2, "0")})` : "Record audio"}
            </button>
            <span className="text-xs text-gray-400">or</span>
            <label className="text-sm text-blue-600 hover:underline cursor-pointer">
              {audioUrl ? "Replace with a file" : "Upload a file"}
              <input
                type="file"
                accept="audio/*"
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    setNewAudioFile(e.target.files[0]);
                    setNewAudioPreviewUrl(URL.createObjectURL(e.target.files[0]));
                    setRemoveAudio(false);
                  }
                }}
                className="hidden"
              />
            </label>
          </div>
          {recordError && <p className="text-xs text-red-600">{recordError}</p>}
        </section>

        {/* Save button */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
          <Link
            href="/panel/products"
            className="px-5 py-2.5 text-gray-600 text-sm hover:text-gray-900"
          >
            Cancel
          </Link>
        </div>
      </form>

      {/* saves on its own, separately from the form above */}
      <div className="max-w-3xl mt-6">
        <ProductVisibilityPanel productId={id} />
      </div>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
