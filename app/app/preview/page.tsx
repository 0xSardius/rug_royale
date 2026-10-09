import { notFound } from "next/navigation";
import { PreviewClient } from "./preview-client";

// Dev-only design QA for components that need a connected wallet (trade panel, result popup).
export default function PreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PreviewClient />;
}
