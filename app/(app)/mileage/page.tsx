import { redirect } from "next/navigation";

// Mileage log has moved to the Mileage tab inside Expenses
export default function MileagePage() {
  redirect("/expenses");
}
