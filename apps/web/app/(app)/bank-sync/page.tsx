import { redirect } from "next/navigation";

// Bank connections have moved to Settings → Bank Connections
// Transaction inbox has moved to the Bank Imports tab inside Expenses
export default function BankSyncPage() {
  redirect("/settings");
}
