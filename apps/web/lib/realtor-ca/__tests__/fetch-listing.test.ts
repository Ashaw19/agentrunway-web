import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fetchRealtorListing, parseListingFromHtml } from "../fetch-listing";

const fixtureHtml = readFileSync(
  path.resolve(__dirname, "fixtures/sample-listing.html"),
  "utf-8",
);

// Helper: wrap a JSON-LD object in a minimal HTML page so we can test
// parseListingFromHtml against tightly controlled inputs.
function htmlWithProductJsonLd(product: object): string {
  return `<html><head><script type="application/ld+json">${JSON.stringify(product)}</script></head><body></body></html>`;
}

describe("parseListingFromHtml", () => {
  it("extracts every field from the real captured listing", () => {
    const result = parseListingFromHtml(fixtureHtml);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // From listing 29789475 captured 2026-05-24
    expect(result.data.address).toBe("2394 Loch Lomond Road");
    expect(result.data.city).toBe("Saint John");
    expect(result.data.province).toBe("NB");
    expect(result.data.price).toBe(339900);
    expect(result.data.photoUrl).toMatch(/^https:\/\/cdn\.realtor\.ca\/listings\//);
    expect(result.data.description).toMatch(/Welcome to this charming/);
    expect(result.data.description.length).toBeLessThanOrEqual(600);
  });

  it("returns upstream_unavailable when HTML has no JSON-LD blocks", () => {
    const result = parseListingFromHtml(
      "<html><body>nothing here</body></html>",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("upstream_unavailable");
  });

  it("returns upstream_unavailable when JSON-LD has no Product schema", () => {
    const breadcrumbOnly = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [],
    };
    const html = htmlWithProductJsonLd(breadcrumbOnly);
    const result = parseListingFromHtml(html);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("upstream_unavailable");
  });

  it("returns upstream_unavailable on Incapsula bot-wall HTML", () => {
    const wallHtml = `<html><body><iframe src="/_Incapsula_Resource">incident_id: 123</iframe></body></html>`;
    const result = parseListingFromHtml(wallHtml);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("upstream_unavailable");
  });

  it("handles a Product schema with all expected fields", () => {
    const product = {
      "@context": "http://schema.org/",
      "@type": "Product",
      name: "123 Main Street, Saint John, New Brunswick E2L 1A1",
      image: [
        "https://cdn.realtor.ca/abc/highres.jpg",
        "https://cdn.realtor.ca/abc/medres.jpg",
      ],
      description: "A lovely home.",
      sku: "12345678",
      offers: [
        { "@type": "Offer", priceCurrency: "CAD", price: "450000.00" },
      ],
    };
    const result = parseListingFromHtml(htmlWithProductJsonLd(product));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.address).toBe("123 Main Street");
    expect(result.data.city).toBe("Saint John");
    expect(result.data.province).toBe("NB");
    expect(result.data.price).toBe(450000);
    expect(result.data.photoUrl).toBe("https://cdn.realtor.ca/abc/highres.jpg");
    expect(result.data.description).toBe("A lovely home.");
  });

  it("returns empty photo when image array is empty", () => {
    const product = {
      "@type": "Product",
      name: "123 Main Street, Saint John, New Brunswick E2L 1A1",
      image: [],
      description: "No photos.",
      offers: [{ price: "100000.00" }],
    };
    const result = parseListingFromHtml(htmlWithProductJsonLd(product));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.photoUrl).toBe("");
  });

  it("returns null price when offers is missing or empty", () => {
    const product = {
      "@type": "Product",
      name: "123 Main Street, Saint John, New Brunswick E2L 1A1",
      image: ["https://cdn.realtor.ca/x.jpg"],
      description: "No price set.",
    };
    const result = parseListingFromHtml(htmlWithProductJsonLd(product));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.price).toBeNull();
  });

  it("truncates descriptions over 600 chars", () => {
    const longDesc = "A".repeat(800);
    const product = {
      "@type": "Product",
      name: "123 Main Street, Saint John, New Brunswick E2L 1A1",
      image: ["https://cdn.realtor.ca/x.jpg"],
      description: longDesc,
      offers: [{ price: "100000.00" }],
    };
    const result = parseListingFromHtml(htmlWithProductJsonLd(product));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.description.length).toBe(600);
  });

  it("maps French province names to codes", () => {
    const product = {
      "@type": "Product",
      name: "123 Rue Principale, Montréal, Québec H2X 1Y1",
      image: ["https://cdn.realtor.ca/x.jpg"],
      description: "Belle maison.",
      offers: [{ price: "500000.00" }],
    };
    const result = parseListingFromHtml(htmlWithProductJsonLd(product));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.province).toBe("QC");
  });

  it("falls back to full province name when not in the lookup map", () => {
    const product = {
      "@type": "Product",
      name: "1 Some Street, Some City, Made Up Province X1X 1X1",
      image: [],
      description: "Edge case.",
      offers: [{ price: "100000.00" }],
    };
    const result = parseListingFromHtml(htmlWithProductJsonLd(product));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.province).toBe("Made Up Province");
  });
});

describe("fetchRealtorListing", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("returns ok on a 200 + valid HTML", async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(fixtureHtml, {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );
    const result = await fetchRealtorListing("29789475");
    expect(result.ok).toBe(true);
  });

  it("sends browser-like headers (no bot-wall fingerprint)", async () => {
    const mock = vi
      .fn()
      .mockResolvedValue(new Response(fixtureHtml, { status: 200 }));
    globalThis.fetch = mock as unknown as typeof globalThis.fetch;
    await fetchRealtorListing("29789475");
    const call = mock.mock.calls[0];
    const headers = call[1].headers as Record<string, string>;
    expect(headers["User-Agent"]).toMatch(/Mozilla\/5\.0/);
    expect(headers["Accept"]).toMatch(/text\/html/);
    expect(headers["Accept-Language"]).toBeDefined();
  });

  it("returns upstream_unavailable on a 5xx", async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("", { status: 503 }),
    );
    const result = await fetchRealtorListing("29789475");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("upstream_unavailable");
  });

  it("returns upstream_unavailable when fetch throws (network error or timeout)", async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("network down"),
    );
    const result = await fetchRealtorListing("29789475");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("upstream_unavailable");
  });

  it("returns upstream_unavailable when response HTML has no Product schema", async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("<html><body>nothing</body></html>", { status: 200 }),
    );
    const result = await fetchRealtorListing("29789475");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("upstream_unavailable");
  });
});
