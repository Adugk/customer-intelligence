import { Area, Card, Details, Empty, ErrorNote, Field, NumberInput, PageHeader, Select, Submit, Text } from "@/components/ui";
import { saveProduct } from "@/lib/actions/products";
import { q, type Row } from "@/lib/db";
import { OPT } from "@/lib/options";

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const sp = await searchParams;
  const [products, categories] = await Promise.all([
    q(
      `select p.*, c.name as category_name,
         (select count(*)::int from product_requirement r where r.product_id = p.id and r.archived_at is null) as reqs
       from product p left join product_category c on c.id = p.category_id order by p.name`,
    ),
    q("select c.id, c.name, p.name as parent from product_category c left join product_category p on p.id = c.parent_id order by coalesce(p.sort_order, c.sort_order), (c.parent_id is not null), c.sort_order"),
  ]);
  return (
    <div className="max-w-4xl">
      <PageHeader title="Product catalog" subtitle="One shared definition per product, so demand from different customers can be added up." />
      <ErrorNote message={typeof sp.error === "string" ? sp.error : null} />
      <div className="mb-4">
        <Details summary="+ Add product" open={products.length === 0}>
          <ProductForm categories={categories} />
        </Details>
      </div>
      {products.length === 0 ? (
        <Empty>No products yet. You can also create them from a requirement.</Empty>
      ) : (
        <div className="space-y-2">
          {products.map((p) => (
            <Card key={p.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-xs text-muted">
                    {p.code} · {p.category_name ?? "No category"} {p.brand && `· ${p.brand}`} {p.model_sku && `· ${p.model_sku}`} · unit: {p.standard_unit}
                  </div>
                </div>
                <span className="chip bg-surface-2 text-muted">{p.reqs} requirements</span>
              </div>
              {p.key_specifications && <pre className="mt-2 font-sans text-sm whitespace-pre-wrap text-muted">{p.key_specifications}</pre>}
              <div className="mt-2">
                <Details summary="Edit">
                  <ProductForm categories={categories} p={p} />
                </Details>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ProductForm({ categories, p }: { categories: Row[]; p?: Row }) {
  return (
    <form action={saveProduct} className="space-y-3">
      {p && <input type="hidden" name="product_id" value={p.id} />}
      <Field label="Name *" hint="Pattern: Brand – Product type – Model – Key spec">
        <Text name="name" defaultValue={p?.name} required />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Category">
          <select className="inp" name="category_id" defaultValue={p?.category_id ?? ""}>
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.parent ? `${c.parent} › ${c.name}` : c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Brand">
          <Text name="brand" defaultValue={p?.brand} placeholder="or Generic/Unbranded" />
        </Field>
        <Field label="Model / SKU">
          <Text name="model_sku" defaultValue={p?.model_sku} />
        </Field>
        <Field label="Barcode (GTIN)" hint="8, 12, 13 or 14 digits; check digit is validated.">
          <Text name="barcode_gtin" defaultValue={p?.barcode_gtin} inputMode="numeric" />
        </Field>
        <Field label="Standard unit">
          <Select name="standard_unit" options={OPT.unit} defaultValue={p?.standard_unit ?? "piece"} blank={false} />
        </Field>
        <Field label="Units per pack">
          <NumberInput name="units_per_pack" defaultValue={p?.units_per_pack} />
        </Field>
      </div>
      <Field label="Key specifications" hint="One per line, e.g. 'wattage: 25W'">
        <Area name="key_specifications" defaultValue={p?.key_specifications} rows={3} />
      </Field>
      <Submit>{p ? "Save product" : "Add product"}</Submit>
    </form>
  );
}
