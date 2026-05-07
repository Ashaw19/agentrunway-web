import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowRight, Clock, CalendarDays, Tag } from "lucide-react";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { getPostBySlug, getAllPosts, formatPostDate } from "@/lib/blog";
import { articleSchema, breadcrumbSchema } from "@/lib/schema";

// ── Static generation ─────────────────────────────────────────────────────────

export async function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.slug }));
}

// ── Metadata ──────────────────────────────────────────────────────────────────

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};

  return {
    title:       post.title,
    description: post.description,
    openGraph: {
      title:         post.title,
      description:   post.description,
      url:           `https://agentrunway.ca/blog/${slug}`,
      type:          "article",
      publishedTime: post.date,
      images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
    },
    alternates: {
      canonical: `https://agentrunway.ca/blog/${slug}`,
    },
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) notFound();

  const postArticleSchema = articleSchema({
    headline:      post.title,
    description:   post.description,
    url:           `/blog/${slug}`,
    datePublished: post.date,
    imageUrl:      "/og-image-v2.png",
  });

  const postBreadcrumb = breadcrumbSchema([
    { name: "Home",  url: "/" },
    { name: "Blog",  url: "/blog" },
    { name: post.title, url: `/blog/${slug}` },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(postArticleSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(postBreadcrumb) }}
      />
      <MarketingNav />

      <main className="min-h-screen bg-slate-950">
        <article className="px-6 py-16 sm:px-10">
          <div className="mx-auto max-w-3xl">

            {/* ── Back link ── */}
            <Link
              href="/blog"
              className="mb-10 inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Blog
            </Link>

            {/* ── Post header ── */}
            <header className="mb-12">
              {/* Date + reading time */}
              <div className="mb-6 flex flex-wrap items-center gap-4">
                <span className="flex items-center gap-1.5 text-sm text-slate-500">
                  <CalendarDays className="h-4 w-4" />
                  {formatPostDate(post.date)}
                </span>
                <span className="flex items-center gap-1.5 text-sm text-slate-500">
                  <Clock className="h-4 w-4" />
                  {post.readingTime} min read
                </span>
              </div>

              {/* Title block — photo floated left of title + description */}
              <div className="flex items-start gap-5">
                {post.author === "Andrew Shaw" && (
                  <div className="relative mt-4 h-[185px] w-[148px] flex-shrink-0 overflow-hidden rounded-xl border border-slate-700/60">
                    <Image
                      src="/images/andrew-shaw.jpg"
                      alt="Andrew Shaw"
                      fill
                      className="object-cover object-top"
                      sizes="148px"
                    />
                  </div>
                )}
                <div className="min-w-0">
                  <h1 className="mb-4 text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl">
                    {post.title}
                  </h1>
                  <p className="text-xl leading-relaxed text-slate-400">
                    {post.description}
                  </p>
                  {post.author === "Andrew Shaw" && (
                    <p className="mt-3 text-sm text-slate-500">
                      <span className="font-medium text-slate-400">Andrew Shaw</span>
                      {" · "}Licensed real estate agent · Founder, Agent Runway · Saint John, NB
                    </p>
                  )}
                </div>
              </div>

              {post.tags.length > 0 && (
                <div className="mt-6 flex flex-wrap gap-2">
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
              )}

            </header>

            {/* ── Divider ── */}
            <hr className="mb-12 border-slate-800" />

            {/* ── MDX content ── */}
            <div className="
              prose prose-invert prose-slate max-w-none

              prose-headings:font-bold prose-headings:tracking-tight prose-headings:text-white
              prose-h2:text-2xl prose-h2:mt-12 prose-h2:mb-4 prose-h2:pb-3 prose-h2:border-b prose-h2:border-slate-800
              prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3
              prose-h4:text-lg prose-h4:mt-6 prose-h4:mb-2

              prose-p:text-slate-300 prose-p:leading-relaxed

              prose-a:text-brand-orange prose-a:font-medium prose-a:no-underline hover:prose-a:underline

              prose-strong:text-white prose-strong:font-semibold

              prose-em:text-slate-300

              prose-code:rounded prose-code:bg-slate-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm prose-code:text-blue-300 prose-code:font-normal prose-code:before:content-none prose-code:after:content-none

              prose-pre:rounded-xl prose-pre:border prose-pre:border-slate-700 prose-pre:bg-slate-800/60

              prose-blockquote:border-l-brand-orange prose-blockquote:bg-slate-900/50 prose-blockquote:px-6 prose-blockquote:py-1 prose-blockquote:rounded-r-lg prose-blockquote:not-italic prose-blockquote:text-slate-300

              prose-ul:text-slate-300 prose-ol:text-slate-300 prose-li:text-slate-300

              prose-hr:border-slate-800

              prose-table:text-slate-300 prose-thead:text-white prose-thead:border-slate-700 prose-tbody:border-slate-800 prose-th:text-white prose-td:border-slate-800

              prose-img:rounded-xl prose-img:border prose-img:border-slate-700
            ">
              <MDXRemote
                source={post.content}
                options={{
                  mdxOptions: {
                    remarkPlugins: [remarkGfm],
                  },
                }}
              />
            </div>

            {/* ── Footer CTA ── */}
            <div className="mt-16 rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-900 to-slate-900/50 p-8 text-center">
              <p className="mb-1 text-lg font-bold text-white">
                Ready to put this into practice?
              </p>
              <p className="mb-6 text-slate-400">
                Agent Runway tracks GCI, expenses, pipeline, and financial
                runway automatically — built for Canadian real estate agents.
              </p>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 rounded-lg bg-brand-orange px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                Start Free Trial
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {/* ── Back link (bottom) ── */}
            <div className="mt-10 text-center">
              <Link
                href="/blog"
                className="inline-flex items-center gap-2 text-sm text-slate-500 transition-colors hover:text-slate-300"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to all articles
              </Link>
            </div>

          </div>
        </article>
      </main>

      <MarketingFooter />
    </>
  );
}
