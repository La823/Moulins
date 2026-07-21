"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

export default function CareersPage() {
  const [jobs, setJobs] = useState(null);
  const [openJobId, setOpenJobId] = useState(null);

  useEffect(() => {
    apiFetch("/careers")
      .then(setJobs)
      .catch(() => setJobs([]));
  }, []);

  return (
    <div>
      {/* Landing */}
      <section className="relative h-[50vh] min-h-[320px] flex items-end overflow-hidden bg-gray-900">
        <img
          src="/doctor patient croped.jpg"
          alt="Careers at Moulins"
          className="absolute inset-0 w-full h-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10" />
        <div className="relative z-10 max-w-7xl w-full mx-auto px-8 pb-14">
          <h1 className="text-4xl md:text-5xl text-white leading-tight mb-3">Careers</h1>
          <p className="text-sm md:text-base uppercase tracking-[0.2em] text-white/70">
            Build your career with Moulins
          </p>
        </div>
      </section>

      {/* Job listings */}
      <div className="max-w-4xl mx-auto px-8 py-16">
        <h2 className="text-2xl font-light text-gray-900 mb-10">Open Positions</h2>

        {jobs === null ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-gray-400">No open positions right now — check back soon.</p>
        ) : (
          <div className="space-y-4">
            {jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                isOpen={openJobId === job.id}
                onToggle={() => setOpenJobId(openJobId === job.id ? null : job.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function JobCard({ job, isOpen, onToggle }) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-4 p-6 text-left hover:bg-gray-50 transition-colors"
      >
        <div>
          <h3 className="text-lg font-medium text-gray-900">{job.title}</h3>
          <p className="text-sm text-gray-500 mt-1">
            {job.department} &middot; {job.location} &middot; {job.employment_type}
          </p>
        </div>
        <span
          className={`text-xl text-gray-400 transition-transform duration-200 flex-shrink-0 ${
            isOpen ? "rotate-45" : ""
          }`}
        >
          +
        </span>
      </button>

      {isOpen && (
        <div className="px-6 pb-6 border-t border-gray-100 pt-5">
          <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line mb-6">
            {job.description}
          </p>
          <ApplyForm jobId={job.id} />
        </div>
      )}
    </div>
  );
}

function ApplyForm({ jobId }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError("Please attach your resume");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const { upload_url, key } = await apiFetch("/careers/upload-url", {
        method: "POST",
        body: JSON.stringify({ filename: file.name }),
      });
      await fetch(upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      await apiFetch(`/careers/${jobId}/apply`, {
        method: "POST",
        body: JSON.stringify({ name, phone, email, resume_key: key }),
      });

      setSubmitted(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <p className="text-sm text-green-600">
        Thanks — your application has been submitted. We&apos;ll be in touch.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 max-w-md">
      <input
        type="text"
        placeholder="Full name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 outline-none focus:border-gray-900"
      />
      <input
        type="tel"
        placeholder="Phone number"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        required
        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 outline-none focus:border-gray-900"
      />
      <input
        type="email"
        placeholder="Email (optional)"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 outline-none focus:border-gray-900"
      />
      <div>
        <label className="block text-xs text-gray-500 mb-1">Resume</label>
        <input
          type="file"
          accept=".pdf,.doc,.docx"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          required
          className="w-full text-xs text-gray-500"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="px-6 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
      >
        {submitting ? "Submitting..." : "Submit Application"}
      </button>
    </form>
  );
}
