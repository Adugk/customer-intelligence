import { QuickCaptureForm } from "@/components/quick-capture-form";
import { PageHeader } from "@/components/ui";
import { q } from "@/lib/db";
import { addDays, todayISO } from "@/lib/format";

export default async function NewCustomerPage() {
  const categories = await q("select id, name from product_category where parent_id is null order by sort_order");
  return (
    <div className="max-w-3xl">
      <PageHeader title="Quick capture" subtitle="First contact — about two minutes. Only name, type and a phone or location are required." back={{ href: "/customers", label: "Customers" }} />
      <QuickCaptureForm categories={categories.map((c) => ({ id: c.id, name: c.name }))} defaultFollowUp={addDays(todayISO(), 3)} />
    </div>
  );
}
