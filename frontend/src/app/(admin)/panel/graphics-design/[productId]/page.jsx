"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";

export default function GraphicsDesignProduct() {
  const { productId } = useParams();
  const [product, setProduct] = useState(null);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      apiFetch(`/products/${productId}`),
      apiFetch(`/admin/products/${productId}/design-files`),
    ])
      .then(([p, f]) => {
        setProduct(p);
        setFiles(f || []);
      })
      .catch((e) => setError(e.message || "Could not load"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const handleFilesSelected = async (fileList) => {
    setError("");
    setUploading(true);
    try {
      for (const file of fileList) {
        const { upload_url, key } = await apiFetch("/admin/design-files/upload-url", {
          method: "POST",
          body: JSON.stringify({ product_id: productId, filename: file.name }),
        });
        await fetch(upload_url, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type || "application/octet-stream" },
        });
        await apiFetch(`/admin/products/${productId}/design-files`, {
          method: "POST",
          body: JSON.stringify({ name: file.name, file_key: key, file_size: file.size }),
        });
      }
      load();
    } catch (e) {
      setError(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (fileId) => {
    if (!confirm("Delete this file?")) return;
    try {
      await apiFetch(`/admin/products/design-files/${fileId}`, { method: "DELETE" });
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch (e) {
      setError(e.message || "Could not delete file");
    }
  };

  const formatSize = (bytes) => {
    if (!bytes && bytes !== 0) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div>
      <Link
        href="/panel/graphics-design"
        className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1 mb-4"
      >
        &larr; Back to Graphics Design
      </Link>

      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : (
        <>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{product?.name}</h1>
              <p className="text-xs text-gray-400 font-mono mt-1">#{product?.product_id}</p>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
            >
              {uploading ? "Uploading..." : "Upload Files"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) handleFilesSelected(Array.from(e.target.files));
                e.target.value = "";
              }}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2 mb-4">
              {error}
            </div>
          )}

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files?.length) handleFilesSelected(Array.from(e.dataTransfer.files));
            }}
            className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center text-sm text-gray-500 mb-6"
          >
            Drag and drop files here, or click "Upload Files" above.
          </div>

          {files.length === 0 ? (
            <p className="text-sm text-gray-500">No design files uploaded yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {files.map((f) => (
                <div
                  key={f.id}
                  className="bg-white border border-gray-200 rounded-xl p-4 flex items-start gap-3"
                >
                  <div className="w-10 h-10 rounded-lg bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <a
                      href={f.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-gray-900 hover:text-blue-600 truncate block"
                      title={f.name}
                    >
                      {f.name}
                    </a>
                    <p className="text-xs text-gray-400 mt-0.5">{formatSize(f.file_size)}</p>
                  </div>
                  <button
                    onClick={() => handleDelete(f.id)}
                    className="text-gray-400 hover:text-red-600 flex-shrink-0"
                    title="Delete"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
