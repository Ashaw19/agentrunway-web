"use client";

import { useState } from "react";
import { Star, CheckCircle2 } from "lucide-react";
import { ScrollRevealSection } from "@/components/scroll-reveal-section";

export function ReviewContent() {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [quote, setQuote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!name.trim() || !quote.trim()) {
      setError("Name and review are required.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/testimonials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          title: title.trim() || null,
          quote: quote.trim(),
          rating,
          source: "website",
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Something went wrong");
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <section className="px-6 py-24 sm:px-10 sm:py-32">
        <ScrollRevealSection className="mx-auto max-w-xl text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
            <CheckCircle2 className="h-8 w-8 text-green-400" />
          </div>
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            Thank you for your review!
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-400">
            It will appear on our site once approved.
          </p>
        </ScrollRevealSection>
      </section>
    );
  }

  return (
    <section className="px-6 py-24 sm:px-10 sm:py-32">
      <ScrollRevealSection className="mx-auto max-w-xl">
        {/* Heading */}
        <div className="mb-10 text-center">
          <div className="mb-5 inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold text-blue-400">
            Leave a Review
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Share Your Experience
          </h1>
          <p className="mt-4 text-base leading-relaxed text-slate-400">
            Your feedback helps other agents make better decisions about their
            business.
          </p>
        </div>

        {/* Form card */}
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8"
        >
          {/* Name */}
          <div className="mb-5">
            <label
              htmlFor="review-name"
              className="mb-1.5 block text-sm font-medium text-slate-300"
            >
              Name <span className="text-red-400">*</span>
            </label>
            <input
              id="review-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
            />
          </div>

          {/* Title / Role */}
          <div className="mb-5">
            <label
              htmlFor="review-title"
              className="mb-1.5 block text-sm font-medium text-slate-300"
            >
              Title / Role
            </label>
            <input
              id="review-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Royal LePage Select, Toronto ON"
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
            />
          </div>

          {/* Rating */}
          <div className="mb-5">
            <label className="mb-1.5 block text-sm font-medium text-slate-300">
              Rating
            </label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="rounded p-0.5 transition-colors hover:bg-white/5"
                  aria-label={`Rate ${star} star${star > 1 ? "s" : ""}`}
                >
                  <Star
                    className={`h-7 w-7 transition-colors ${
                      star <= (hoverRating || rating)
                        ? "fill-yellow-400 text-yellow-400"
                        : "fill-none text-slate-600"
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Quote / Review */}
          <div className="mb-6">
            <label
              htmlFor="review-quote"
              className="mb-1.5 block text-sm font-medium text-slate-300"
            >
              Your Review <span className="text-red-400">*</span>
            </label>
            <textarea
              id="review-quote"
              required
              rows={5}
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
              placeholder="What has Agent Runway done for your business?"
              className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="mb-4 text-sm text-red-400">{error}</p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Submitting..." : "Submit Review"}
          </button>
        </form>
      </ScrollRevealSection>
    </section>
  );
}
