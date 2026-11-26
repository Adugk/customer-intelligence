import { QuickCaptureForm } from "@/components/quick-capture-form";
import { PageHeader } from "@/components/ui";
import { q } from "@/lib/db";
import { addDays, todayISO } from "@/lib/format";

export default async function NewCustomerPage() {
  const categories = await q("select id, name from product_category where parent_id is null order by sort_order");
  return (
    <div className="max-w-3xl">
      <PageHeader title="Add customer" subtitle="Takes about two minutes. You only need the name, the type, and a phone number or location. Add the rest later." back={{ href: "/customers", label: "Customers" }} />
      <QuickCaptureForm categories={categories.map((c) => ({ id: c.id, name: c.name }))} defaultFollowUp={addDays(todayISO(), 3)} />
    </div>
  );
}
