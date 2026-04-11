"use client";

import { useState, useEffect, useRef } from "react";
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

export default function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const limit = 20;
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    price: "",
    stock: "",
  });
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [imageFiles, setImageFiles] = useState([]);
  const [pdfFiles, setPdfFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [catDropdownOpen, setCatDropdownOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const catRef = useRef(null);
  const searchTimer = useRef(null);

  const fetchProducts = async (p = page, q = search) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: p, limit });
      if (q) params.set("search", q);
      const data = await apiFetch(`/admin/products?${params}`);
      setProducts(data.products || []);
      setTotal(data.total || 0);
      setTotalPages(data.total_pages || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts(page, search);
  }, [page, search]);

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchInput(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      setSearch(val);
    }, 300);
  };

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      // Create product first (no image_key — images are separate now)
      const { id: productId } = await apiFetch("/admin/products", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          price: parseFloat(form.price),
          categories: selectedCategories,
          stock: parseInt(form.stock) || 0,
        }),
      });

      // Upload images and attach to product
      for (let i = 0; i < imageFiles.length; i++) {
        const imageKey = await uploadFileToS3(
          imageFiles[i],
          "/admin/products/upload-url"
        );
        await apiFetch(`/admin/products/${productId}/images`, {
          method: "POST",
          body: JSON.stringify({ image_key: imageKey, sort_order: i }),
        });
      }

      // Upload PDFs and attach to product
      for (const pdf of pdfFiles) {
        const fileKey = await uploadFileToS3(
          pdf.file,
          "/admin/products/document-upload-url"
        );
        await apiFetch(`/admin/products/${productId}/documents`, {
          method: "POST",
          body: JSON.stringify({ name: pdf.name, file_key: fileKey }),
        });
      }

      // Reset form
      setForm({ name: "", description: "", price: "", stock: "" });
      setSelectedCategories([]);
      setImageFiles([]);
      setPdfFiles([]);
      setShowForm(false);
      fetchProducts();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddImages = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    setImageFiles([...imageFiles, ...files]);
    e.target.value = "";
  };

  const removeImage = (index) => {
    setImageFiles(imageFiles.filter((_, i) => i !== index));
  };

  const handleAddPdf = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const displayName = file.name.replace(/\.pdf$/i, "");
    setPdfFiles([...pdfFiles, { file, name: displayName }]);
    e.target.value = "";
  };

  const removePdf = (index) => {
    setPdfFiles(pdfFiles.filter((_, i) => i !== index));
  };

  const handleDeleteImage = async (imgId) => {
    try {
      await apiFetch(`/admin/products/images/${imgId}`, { method: "DELETE" });
      fetchProducts();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteDoc = async (docId) => {
    try {
      await apiFetch(`/admin/products/documents/${docId}`, {
        method: "DELETE",
      });
      fetchProducts();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this product?")) return;
    try {
      await apiFetch(`/admin/products/${id}`, { method: "DELETE" });
      setProducts(products.filter((p) => p.id !== id));
    } catch (err) {
      alert(err.message);
    }
  };

  const toggleActive = async (product) => {
    try {
      await apiFetch(`/admin/products/${product.id}`, {
        method: "PUT",
        body: JSON.stringify({ is_active: !product.is_active }),
      });
      fetchProducts();
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) return <p className="text-gray-500">Loading products...</p>;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">Products</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
        >
          {showForm ? "Cancel" : "Add Product"}
        </button>
      </div>

      <input
        type="text"
        value={searchInput}
        onChange={handleSearchChange}
        placeholder="Search products by name..."
        className="w-full px-3 py-2 mb-4 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-400"
      />

      {/* Add Product Form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-8 p-6 bg-white rounded-xl border border-gray-200 space-y-4 max-w-2xl"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name *
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Price *
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

          {/* Categories - dropdown tag selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Categories
            </label>
            <div ref={catRef} className="relative">
              {/* Selected tags + trigger */}
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
                      ✕
                    </button>
                  </span>
                ))}
              </div>

              {/* Dropdown */}
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
                          selected ? "text-gray-900 font-medium" : "text-gray-600"
                        }`}
                      >
                        {cat}
                        {selected && (
                          <span className="text-gray-900 text-xs">✓</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Product Images (multiple) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Product Images
            </label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleAddImages}
              className="w-full text-sm text-gray-600"
            />
            {imageFiles.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {imageFiles.map((file, i) => (
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
                      onClick={() => removeImage(i)}
                      className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* PDF Documents */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              PDF Documents
            </label>
            <input
              type="file"
              accept=".pdf"
              onChange={handleAddPdf}
              className="w-full text-sm text-gray-600"
            />
            {pdfFiles.length > 0 && (
              <div className="mt-2 space-y-1">
                {pdfFiles.map((pdf, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between bg-gray-50 px-3 py-1.5 rounded text-sm"
                  >
                    <input
                      type="text"
                      value={pdf.name}
                      onChange={(e) => {
                        const updated = [...pdfFiles];
                        updated[i].name = e.target.value;
                        setPdfFiles(updated);
                      }}
                      className="bg-transparent border-none text-gray-700 text-sm flex-1 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => removePdf(i)}
                      className="text-red-500 text-xs ml-2"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Save Product"}
          </button>
        </form>
      )}

      {/* Products List */}
      {products.length === 0 ? (
        <p className="text-gray-500">No products yet. Add your first product.</p>
      ) : (
        <div className="space-y-3">
          {products.map((p) => (
            <div
              key={p.id}
              className="bg-white rounded-xl border border-gray-200 p-4"
            >
              <div className="flex gap-4">
                {/* Images */}
                {p.images && p.images.length > 0 ? (
                  <div className="flex gap-1.5 flex-shrink-0">
                    {p.images.map((img) => (
                      <div key={img.id} className="relative group">
                        <img
                          src={img.image_url}
                          alt={p.name}
                          className="w-16 h-16 object-cover rounded-lg"
                        />
                        <button
                          onClick={() => handleDeleteImage(img.id)}
                          className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full w-4 h-4 text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          x
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 text-xs flex-shrink-0">
                    No img
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div>
                      <Link href={`/admin/products/${p.id}`} className="font-medium text-gray-900 hover:text-blue-600 hover:underline">{p.name}</Link>
                      <p className="text-sm text-gray-500 mt-0.5">
                        ₹{p.price} &middot; {p.stock} in stock
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleActive(p)}
                        className={`text-xs px-2 py-1 rounded-full font-medium ${
                          p.is_active
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {p.is_active ? "Active" : "Hidden"}
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="text-red-600 hover:text-red-700 text-xs font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Categories */}
                  {p.categories && p.categories.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {p.categories.map((cat) => (
                        <span
                          key={cat}
                          className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs"
                        >
                          {cat}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Documents */}
                  {p.documents && p.documents.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {p.documents.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded text-xs"
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
                            onClick={() => handleDeleteDoc(doc.id)}
                            className="text-red-400 hover:text-red-600"
                          >
                            x
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between mt-6 text-sm text-gray-600">
          <span>
            {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total} products
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(page - 1)}
              disabled={page <= 1}
              className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-gray-500">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages}
              className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </>
  );
}
