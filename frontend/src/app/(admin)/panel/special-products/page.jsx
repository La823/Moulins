"use client";

import { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";

export default function AdminSpecialProducts() {
  return (
    <Suspense fallback={null}>
      <AdminSpecialProductsInner />
    </Suspense>
  );
}

function AdminSpecialProductsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerId = searchParams.get("customer_id") || "";

  const [partners, setPartners] = useState([]);
  const [loadingPartners, setLoadingPartners] = useState(true);

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    price: "",
    stock: "",
  });
  const [imageFiles, setImageFiles] = useState([]);
  const [pdfFiles, setPdfFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Load partners (only special-type customers get their own catalog)
  useEffect(() => {
    apiFetch("/admin/partners")
      .then((data) =>
        setPartners(
          (Array.isArray(data) ? data : []).filter(
            (u) => u.customer_type === "special"
          )
        )
      )
      .catch(console.error)
      .finally(() => setLoadingPartners(false));
  }, []);

  const selectedPartner = partners.find((p) => p.id === customerId);

  const fetchProducts = async () => {
    if (!customerId) return;
    try {
      setLoading(true);
      const data = await apiFetch(
        `/admin/special-products?customer_id=${customerId}`
      );
      setProducts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (customerId) fetchProducts();
    else setProducts([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  const handleSelectCustomer = (id) => {
    if (id) router.push(`/panel/special-products?customer_id=${id}`);
    else router.push("/panel/special-products");
  };

  // Special upload-url endpoints expect { customer_id, filename }.
  const uploadFileToS3 = async (file, urlEndpoint) => {
    const { upload_url, key } = await apiFetch(urlEndpoint, {
      method: "POST",
      body: JSON.stringify({ customer_id: customerId, filename: file.name }),
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
      const { id: productId } = await apiFetch("/admin/special-products", {
        method: "POST",
        body: JSON.stringify({
          customer_id: customerId,
          name: form.name,
          description: form.description,
          price: form.price ? parseFloat(form.price) : null,
          stock: form.stock ? parseInt(form.stock) : null,
        }),
      });

      for (let i = 0; i < imageFiles.length; i++) {
        const imageKey = await uploadFileToS3(
          imageFiles[i],
          "/admin/special-products/upload-url"
        );
        await apiFetch(`/admin/special-products/${productId}/images`, {
          method: "POST",
          body: JSON.stringify({ image_key: imageKey, sort_order: i }),
        });
      }

      for (const pdf of pdfFiles) {
        const fileKey = await uploadFileToS3(
          pdf.file,
          "/admin/special-products/document-upload-url"
        );
        await apiFetch(`/admin/special-products/${productId}/documents`, {
          method: "POST",
          body: JSON.stringify({ name: pdf.name, file_key: fileKey }),
        });
      }

      setForm({ name: "", description: "", price: "", stock: "" });
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
      await apiFetch(`/admin/special-products/images/${imgId}`, {
        method: "DELETE",
      });
      fetchProducts();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteDoc = async (docId) => {
    try {
      await apiFetch(`/admin/special-products/documents/${docId}`, {
        method: "DELETE",
      });
      fetchProducts();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this special product?")) return;
    try {
      await apiFetch(`/admin/special-products/${id}`, { method: "DELETE" });
      setProducts(products.filter((p) => p.id !== id));
    } catch (err) {
      alert(err.message);
    }
  };

  const toggleActive = async (product) => {
    try {
      await apiFetch(`/admin/special-products/${product.id}`, {
        method: "PUT",
        body: JSON.stringify({ is_active: !product.is_active }),
      });
      fetchProducts();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">
            Special Products
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Each special customer has their own private product catalog.
          </p>
        </div>
        {customerId && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
          >
            {showForm ? "Cancel" : "Add Product"}
          </button>
        )}
      </div>

      {/* Customer picker */}
      <div className="mb-6 max-w-md">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Special Customer
        </label>
        {loadingPartners ? (
          <p className="text-sm text-gray-400">Loading customers...</p>
        ) : partners.length === 0 ? (
          <p className="text-sm text-gray-400">
            No special customers yet. Set a partner&apos;s customer type to
            &quot;Special&quot; from their detail page first.
          </p>
        ) : (
          <select
            value={customerId}
            onChange={(e) => handleSelectCustomer(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-400"
          >
            <option value="">Select a customer...</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.username || p.phone_number}
              </option>
            ))}
          </select>
        )}
      </div>

      {!customerId ? (
        <p className="text-gray-500">
          Select a special customer to manage their products.
        </p>
      ) : (
        <>
          {/* Add Product Form */}
          {showForm && (
            <form
              onSubmit={handleSubmit}
              className="mb-8 p-6 bg-white rounded-xl border border-gray-200 space-y-4 max-w-2xl"
            >
              <p className="text-sm text-gray-500">
                Creating a product for{" "}
                <span className="font-medium text-gray-700">
                  {selectedPartner?.username ||
                    selectedPartner?.phone_number ||
                    "this customer"}
                </span>
              </p>
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
                    Price
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.price}
                    onChange={(e) =>
                      setForm({ ...form, price: e.target.value })
                    }
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
                    onChange={(e) =>
                      setForm({ ...form, stock: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                  />
                </div>
              </div>

              {/* Product Images */}
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
          {loading ? (
            <p className="text-gray-500">Loading products...</p>
          ) : products.length === 0 ? (
            <p className="text-gray-500">
              No products yet for this customer. Add the first one.
            </p>
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
                          <Link
                            href={`/panel/special-products/${p.id}?customer_id=${customerId}`}
                            className="font-medium text-gray-900 hover:text-blue-600 hover:underline"
                          >
                            {p.name}
                          </Link>
                          <p className="text-sm text-gray-500 mt-0.5">
                            {p.price != null ? `₹${p.price}` : "No price"} &middot;{" "}
                            {p.stock != null ? `${p.stock} in stock` : "—"}
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
        </>
      )}
    </>
  );
}
