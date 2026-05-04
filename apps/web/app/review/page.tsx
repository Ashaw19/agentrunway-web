import type { Metadata } from "next";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { ReviewContent } from "./review-content";

export const metadata: Metadata = {
  title: "Leave a Review",
  description: "Share your experience with Agent Runway",
  openGraph: {
    url: "https://agentrunway.ca/review",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical: "https://agentrunway.ca/review",
  },
};

export default function ReviewPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#010D1F]">
      <MarketingNav />
      <main className="flex-1">
        <ReviewContent />
      </main>
      <MarketingFooter />
    </div>
  );
}
