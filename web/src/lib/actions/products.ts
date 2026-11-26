"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "../auth";
import { q } from "../db";
import { choice, num, str, uuid } from "../forms";
import { OPT } from "../options";

function validGtin(code: string): boolean {
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

export async function saveProduct(fd: FormData) {
  await requireUser();
  const id = uuid(fd, "product_id");
  const name = str(fd, "name", 200);
  if (!name) redirect("/products?error=Please+enter+a+product+name.");
  const gtin = str(fd, "barcode_gtin", 14);
  if (gtin && !validGtin(gtin)) redirect("/products?error=That+barcode+number+isn%27t+valid.+Check+the+digits+and+try+again.");
  const vals = [
    uuid(fd, "category_id"), name, str(fd, "brand", 120), str(fd, "model_sku", 120), gtin, str(fd, "key_specifications"),
    choice(fd, "standard_unit", OPT.unit) ?? "piece", num(fd, "units_per_pack", { min: 0 }),
  ];
  if (id) {
    await q(
      `update product set category_id=$2, name=$3, brand=$4, model_sku=$5, barcode_gtin=$6, key_specifications=$7, standard_unit=$8, units_per_pack=$9, updated_at=now() where id=$1`,
      [id, ...vals],
    );
  } else {
    await q(
      `insert into product (category_id, name, brand, model_sku, barcode_gtin, key_specifications, standard_unit, units_per_pack) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      vals,
    );
  }
  revalidatePath("/products");
  redirect("/products");
}
