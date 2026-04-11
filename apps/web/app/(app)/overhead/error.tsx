"use client";
import { PageError } from "@/components/page-error";
export default function OverheadError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <PageError {...props} pageName="Overhead" />;
}
