"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const CATEGORY_OPTIONS = [
  "Skin",
  "Hair",
  "Wellness",
  "Immunity",
  "Digestion",
  "Pain Relief",
  "Personal Care",
];

export default function EditProduct() {
  const { id } = useParams();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [catDropdownOpen, setCatDropdownOpen] = useState(false);
  const catRef = useRef(null);

  // Form state
  const [form, setForm] = useState({
    name: "",
    description: "",
    price: "",
    stock: "",
    is_active: true,
    brand_name: "",
    hsn_code: "",
    gst_rate: "",
    mrp: "",
    product_form: "",
    consume_type: "",
    pack_size: "",
    pack_form: "",
    key_ingredients: "",
    strength: "",
    product_weight: "",
    key_benefits: "",
    direction_for_use: "",
    safety_information: "",
  });
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [images, setImages] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [newImageFiles, setNewImageFiles] = useState([]);
  const [newPdfFiles, setNewPdfFiles] = useState([]);

  // Fetch product data
  useEffect(() => {
    apiFetch(`/products/${id}`)
      .then((p) => {
        setForm({
          name: p.name || "",
          description: p.description || "",
          price: p.price != null ? String(p.price) : "",
          stock: p.stock != null ? String(p.stock) : "",
          is_active: p.is_active ?? true,
          brand_name: p.brand_name || "",
          hsn_code: p.hsn_code || "",
          gst_rate: p.gst_rate != null ? String(p.gst_rate) : "",
          mrp: p.mrp != null ? String(p.mrp) : "",
          product_form: p.product_form || "",
          consume_type: p.consume_type || "",
          pack_size: p.pack_size || "",
          pack_form: p.pack_form || "",
          key_ingredients: p.key_ingredients || "",
          strength: p.strength || "",
          product_weight: p.product_weight || "",
          key_benefits: p.key_benefits || "",
          direction_for_use: p.direction_for_use || "",
          safety_information: p.safety_information || "",
        });
        setSelectedCategories(p.categories || []);
        setImages(p.images || []);
        setDocuments(p.documents || []);
      })
      .catch(() => setError("Could not load product"))
      .finally(() => setLoading(false));
  }, [id]);

  // Close category dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (catRef.current && !catRef.current.contains(e.target)) {
        setCatDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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
        name: form.name,
        description: form.description,
        price: parseFloat(form.price) || 0,
        categories: selectedCategories,
        stock: parseInt(form.stock) || 0,
        is_active: form.is_active,
        brand_name: form.brand_name || null,
        hsn_code: form.hsn_code || null,
        gst_rate: form.gst_rate ? parseFloat(form.gst_rate) : null,
        mrp: form.mrp ? parseFloat(form.mrp) : null,
        product_form: form.product_form || null,
        consume_type: form.consume_type || null,
        pack_size: form.pack_size || null,
        pack_form: form.pack_form || null,
        key_ingredients: form.key_ingredients || null,
        strength: form.strength || null,
        product_weight: form.product_weight || null,
        key_benefits: form.key_benefits || null,
        direction_for_use: form.direction_for_use || null,
        safety_information: form.safety_information || null,
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

      // Refresh product data
      const updated = await apiFetch(`/products/${id}`);
      setImages(updated.images || []);
      setDocuments(updated.documents || []);
      setNewImageFiles([]);
      setNewPdfFiles([]);
      setSuccess("Product saved successfully");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteImage = async (imgId) => {
    try {
      await apiFetch(`/admin/products/images/${imgId}`, { method: "DELETE" });
      setImages(images.filter((img) => img.id !== imgId));
    } catch (err) {
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
            href="/admin/products"
            className="text-gray-400 hover:text-gray-600 text-sm"
          >
            &larr; Back
          </Link>
          <h2 className="text-lg font-semibold text-gray-800">Edit Product</h2>
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
          <div className="grid grid-cols-3 gap-4">
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
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Stock
              </label>
              <input
                type="number"
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: e.target.value })}
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
                  {CATEGORY_OPTIONS.map((cat) => {
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
        </section>

        {/* Product Details */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Product Details
          </h3>
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
              <input
                type="text"
                value={form.hsn_code}
                onChange={(e) =>
                  setForm({ ...form, hsn_code: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
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
              <input
                type="text"
                value={form.product_form}
                onChange={(e) =>
                  setForm({ ...form, product_form: e.target.value })
                }
                placeholder="Tablet, Cream, Syrup..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
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
        </section>

        {/* Images */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Images
          </h3>
          {images.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {images.map((img) => (
                <div key={img.id} className="relative group">
                  <img
                    src={img.image_url}
                    alt="Product"
                    className="w-24 h-24 object-cover rounded-lg border border-gray-200"
                  />
                  <button
                    type="button"
                    onClick={() => handleDeleteImage(img.id)}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    x
                  </button>
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
            href="/admin/products"
            className="px-5 py-2.5 text-gray-600 text-sm hover:text-gray-900"
          >
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}
