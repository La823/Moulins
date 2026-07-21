"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

const EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Internship", "Contract"];

const emptyForm = {
  title: "",
  department: "",
  location: "",
  employment_type: "Full-time",
  description: "",
  is_active: true,
};

export default function CareersAdminPage() {
  const [jobs, setJobs] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [expandedJob, setExpandedJob] = useState(null);
  const [applications, setApplications] = useState({});

  const fetchJobs = () => {
    apiFetch("/admin/careers")
      .then(setJobs)
      .catch(console.error);
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const startEdit = (job) => {
    setEditingId(job.id);
    setForm({
      title: job.title,
      department: job.department,
      location: job.location,
      employment_type: job.employment_type,
      description: job.description,
      is_active: job.is_active,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (editingId) {
        await apiFetch(`/admin/careers/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(form),
        });
      } else {
        await apiFetch("/admin/careers", {
          method: "POST",
          body: JSON.stringify(form),
        });
      }
      cancelEdit();
      fetchJobs();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this job opening? Its applications will also be deleted.")) return;
    try {
      await apiFetch(`/admin/careers/${id}`, { method: "DELETE" });
      fetchJobs();
    } catch (err) {
      alert(err.message);
    }
  };

  const toggleApplications = async (jobId) => {
    if (expandedJob === jobId) {
      setExpandedJob(null);
      return;
    }
    setExpandedJob(jobId);
    if (!applications[jobId]) {
      try {
        const data = await apiFetch(`/admin/careers/${jobId}/applications`);
        setApplications((prev) => ({ ...prev, [jobId]: data }));
      } catch (err) {
        console.error(err);
      }
    }
  };

  if (!jobs) return <p className="text-gray-500">Loading...</p>;

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-800">Careers</h2>
      </div>

      {/* Create / Edit form */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-8 max-w-2xl">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          {editingId ? "Edit Job Opening" : "New Job Opening"}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Department</label>
              <input
                type="text"
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Location</label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Employment type</label>
            <select
              value={form.employment_type}
              onChange={(e) => setForm({ ...form, employment_type: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            >
              {EMPLOYMENT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            Active (visible on the public careers page)
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
            >
              {saving ? "Saving..." : editingId ? "Save Changes" : "Create Job Opening"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={cancelEdit}
                className="text-sm text-gray-500 hover:underline"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 max-w-4xl">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Job Openings ({jobs.length})
        </h3>
        {jobs.length === 0 ? (
          <p className="text-sm text-gray-400">No job openings yet</p>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => (
              <div key={job.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{job.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {job.department} &middot; {job.location} &middot; {job.employment_type}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        job.is_active
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {job.is_active ? "Active" : "Hidden"}
                    </span>
                    <button
                      onClick={() => toggleApplications(job.id)}
                      className="text-xs font-medium text-blue-600 hover:underline"
                    >
                      {expandedJob === job.id ? "Hide applications" : "View applications"}
                    </button>
                    <button
                      onClick={() => startEdit(job)}
                      className="text-xs font-medium text-gray-600 hover:text-gray-900"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(job.id)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {expandedJob === job.id && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    {!applications[job.id] ? (
                      <p className="text-xs text-gray-400">Loading applications...</p>
                    ) : applications[job.id].length === 0 ? (
                      <p className="text-xs text-gray-400">No applications yet</p>
                    ) : (
                      <div className="space-y-2">
                        {applications[job.id].map((app) => (
                          <div
                            key={app.id}
                            className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 rounded-lg"
                          >
                            <div className="min-w-0">
                              <p className="text-sm text-gray-900 truncate">{app.name}</p>
                              <p className="text-xs text-gray-500">
                                {app.phone}
                                {app.email ? ` · ${app.email}` : ""}
                              </p>
                            </div>
                            <a
                              href={app.resume_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-medium text-blue-600 hover:underline flex-shrink-0"
                            >
                              View resume
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
