import { PageHeader } from "@/components/ui";
import { NewSupplierForm } from "@/components/supplier-form";

export default function NewSupplierPage() {
  return (
    <div className="max-w-3xl">
      <PageHeader title="Add supplier" subtitle="You only need the name, type and country. Add products, prices and checks afterwards." back={{ href: "/suppliers", label: "Suppliers" }} />
      <NewSupplierForm />
    </div>
  );
}
