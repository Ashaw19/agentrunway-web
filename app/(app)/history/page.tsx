import { redirect } from "next/navigation";

export default function HistoryRedirect() {
  redirect("/transactions?tab=history");
}
