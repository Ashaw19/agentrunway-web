import { redirect } from "next/navigation";

// T2125 / Tax form has moved to the T2125 tab inside Reports
export default function TaxPage() {
  redirect("/reports");
}
