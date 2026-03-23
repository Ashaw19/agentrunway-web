import fs from "fs";
import path from "path";
import matter from "gray-matter";

// ── Blog content directory ────────────────────────────────────────────────────

const BLOG_DIR = path.join(process.cwd(), "content", "blog");

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BlogPostMeta {
  slug: string;
  title: string;
  date: string;       // ISO date string e.g. "2026-01-15"
  description: string;
  author: string;
  readingTime: number; // minutes
  tags: string[];
}

export interface BlogPost extends BlogPostMeta {
  content: string;    // raw MDX source (no frontmatter)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function estimateReadingTime(content: string): number {
  const words = content.trim().split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200));
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Return all post metadata sorted newest-first. */
export function getAllPosts(): BlogPostMeta[] {
  if (!fs.existsSync(BLOG_DIR)) return [];

  const files = fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith(".mdx"));

  const posts = files.map((filename): BlogPostMeta => {
    const slug = filename.replace(/\.mdx$/, "");
    const raw = fs.readFileSync(path.join(BLOG_DIR, filename), "utf-8");
    const { data, content } = matter(raw);

    return {
      slug,
      title:       (data.title       as string) ?? "Untitled",
      date:        (data.date        as string) ?? "",
      description: (data.description as string) ?? "",
      author:      (data.author      as string) ?? "Agent Runway",
      readingTime: estimateReadingTime(content),
      tags:        (data.tags        as string[]) ?? [],
    };
  });

  // Sort newest first
  return posts.sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** Return a single post's metadata + raw MDX content, or null if not found. */
export function getPostBySlug(slug: string): BlogPost | null {
  const filepath = path.join(BLOG_DIR, `${slug}.mdx`);
  if (!fs.existsSync(filepath)) return null;

  const raw = fs.readFileSync(filepath, "utf-8");
  const { data, content } = matter(raw);

  return {
    slug,
    title:       (data.title       as string) ?? "Untitled",
    date:        (data.date        as string) ?? "",
    description: (data.description as string) ?? "",
    author:      (data.author      as string) ?? "Agent Runway",
    readingTime: estimateReadingTime(content),
    tags:        (data.tags        as string[]) ?? [],
    content,
  };
}

/** Format an ISO date string for display. */
export function formatPostDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString("en-CA", {
    year:  "numeric",
    month: "long",
    day:   "numeric",
  });
}
