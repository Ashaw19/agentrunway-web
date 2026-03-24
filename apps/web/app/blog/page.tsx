import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock, CalendarDays, Tag } from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { getAllPosts, formatPostDate } from "@/lib/blog";

// ── Metadata ──────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: "Blog | Agent Runway",
  description:
    "Practical insights for Canadian real estate agents — GCI tracking, income forecasting, tax planning, and business analytics tips.",
  openGraph: {
    url: "https://agentrunway.ca/blog",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical: "https://agentrunway.ca/blog",
  },
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BlogPage() {
  const posts = getAllPosts();

  return (
    <>
      <MarketingNav />

      <main className="min-h-screen bg-slate-950">

        {/* ── Hero ── */}
        <section className="px-6 pt-20 pb-14 sm:px-10">
          <div className="mx-auto max-w-4xl text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-brand-orange">
              Agent Runway Blog
            </p>
            <h1 className="mb-5 text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Built for Real Estate Agents
            </h1>
            <p className="mx-auto max-w-2xl text-lg leading-relaxed text-slate-400">
              Practical guides on GCI tracking, income forecasting, business
              expenses, and financial runway — written for Canadian real estate
              professionals.
            </p>
          </div>
        </section>

        {/* ── Post list ── */}
        <section className="px-6 pb-28 sm:px-10">
          <div className="mx-auto max-w-4xl">

            {posts.length === 0 ? (
              <p className="py-24 text-center text-slate-500">
                No posts yet — check back soon.
              </p>
            ) : (
              <div className="divide-y divide-slate-800/70">
                {posts.map((post) => (
                  <article key={post.slug} className="group py-10">
                    <Link href={`/blog/${post.slug}`} className="block">

                      {/* Meta row */}
                      <div className="mb-3 flex flex-wrap items-center gap-4">
                        <span className="flex items-center gap-1.5 text-xs text-slate-500">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {formatPostDate(post.date)}
                        </span>
                        <span className="flex items-center gap-1.5 text-xs text-slate-500">
                          <Clock className="h-3.5 w-3.5" />
                          {post.readingTime} min read
                        </span>
                      </div>

                      {/* Title */}
                      <h2 className="mb-3 text-2xl font-bold text-white transition-colors group-hover:text-brand-orange">
                        {post.title}
                      </h2>

                      {/* Description */}
                      <p className="mb-5 leading-relaxed text-slate-400">
                        {post.description}
                      </p>

                      {/* Tags + read link */}
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap gap-2">
                          {post.tags.map((tag) => (
                            <span
                              key={tag}
                              className="flex items-center gap-1 rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-500"
                            >
                              <Tag className="h-2.5 w-2.5" />
                              {tag}
                            </span>
                          ))}
                        </div>
                        <span className="ml-auto flex items-center gap-1 text-sm font-semibold text-brand-orange">
                          Read article
                          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                        </span>
                      </div>

                    </Link>
                  </article>
                ))}
              </div>
            )}

          </div>
        </section>

      </main>

      <MarketingFooter />
    </>
  );
}
