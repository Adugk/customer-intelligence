// Database migrations. Never edit a migration that has been applied to real data;
// add a new one instead. Statements are separated by ";" at the end of a line.
// Field meanings are documented in docs/Customer-Module-Design.md (section 4).

const INIT = `
create table app_user (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table user_session (
  id text primary key,
  user_id uuid not null references app_user(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create sequence business_code_seq;
create sequence contact_code_seq;
create sequence requirement_code_seq;
create sequence problem_code_seq;
create sequence interaction_code_seq;
create sequence follow_up_code_seq;
create sequence opportunity_code_seq;
create sequence product_code_seq;

create table business (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default 'BUS-' || lpad(nextval('business_code_seq')::text, 4, '0'),
  trading_name text not null,
  alternate_names text,
  legal_name text,
  business_type text not null,
  sectors jsonb not null default '[]',
  product_range_summary text,
  customer_segment jsonb not null default '[]',
  price_positioning text,
  sales_channels jsonb not null default '[]',
  staff_size_band text,
  years_operating_band text,
  acquisition_source text,
  referred_by_business_id uuid references business(id) on delete set null,
  rel_categories boolean,
  rel_recurring boolean,
  rel_imported boolean,
  rel_stock boolean,
  relationship_stage text not null default 'prospect',
  stage_override text,
  stage_override_reason text,
  sourcing_status text not null default 'unknown',
  sourcing_status_basis text,
  sourcing_status_verified_at date,
  not_a_fit_reason text,
  confidentiality_level text not null default 'standard',
  tin text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table branch (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id) on delete cascade,
  branch_label text not null default 'Main shop',
  is_main boolean not null default false,
  city text not null default 'Addis Ababa',
  sub_city text,
  woreda text,
  area text,
  directions text,
  gps_lat double precision,
  gps_lng double precision,
  branch_phone text,
  opening_hours text,
  storage_note text,
  created_at timestamptz not null default now()
);

create table contact (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default 'CON-' || lpad(nextval('contact_code_seq')::text, 4, '0'),
  business_id uuid not null references business(id) on delete cascade,
  branch_id uuid references branch(id) on delete set null,
  name text not null,
  job_title text,
  decision_roles jsonb not null default '[]',
  purchasing_authority text not null default 'unknown',
  payment_authority text not null default 'unknown',
  authority_basis text,
  authority_verified_at date,
  is_primary boolean not null default false,
  phone_primary text,
  phone_secondary text,
  whatsapp text,
  telegram text,
  email text,
  preferred_channel text,
  best_time_to_contact text,
  language_preference text,
  contact_permission text not null default 'not_asked',
  permitted_channels jsonb not null default '[]',
  permission_recorded_at date,
  opt_out_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table purchasing_profile (
  business_id uuid primary key references business(id) on delete cascade,
  restock_process text,
  source_types_used jsonb not null default '[]',
  imports_directly text,
  restock_trigger jsonb not null default '[]',
  typical_purchase_value_band text,
  payment_methods_used jsonb not null default '[]',
  payment_timing text,
  credit_days_expected double precision,
  goods_receipt_method jsonb not null default '[]',
  expected_lead_time_days double precision,
  needs_formal_receipt text,
  purchasing_constraints jsonb not null default '[]',
  constraints_note text,
  basis text,
  verified_at date,
  interaction_id uuid,
  updated_at timestamptz not null default now()
);

create table product_category (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_id uuid references product_category(id) on delete cascade,
  is_regulated boolean not null default false,
  sort_order int not null default 0,
  unique (parent_id, name)
);

create table product (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default 'PRD-' || lpad(nextval('product_code_seq')::text, 4, '0'),
  category_id uuid references product_category(id) on delete set null,
  name text not null,
  brand text,
  model_sku text,
  barcode_gtin text,
  key_specifications text,
  standard_unit text not null default 'piece',
  units_per_pack double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table product_requirement (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default 'REQ-' || lpad(nextval('requirement_code_seq')::text, 4, '0'),
  business_id uuid not null references business(id) on delete cascade,
  customer_description text not null,
  category_id uuid references product_category(id) on delete set null,
  product_id uuid references product(id) on delete set null,
  brand_requirement text,
  accepted_alternatives text,
  specification_notes text,
  condition_required text,
  authenticity_required text,
  reference_links text,

  purchase_pattern text,
  qty_per_order double precision,
  unit text not null default 'piece',
  order_interval_value double precision,
  order_interval_unit text,
  monthly_demand double precision,
  last_purchase_date date,
  last_purchase_qty double precision,
  smallest_practical_order double precision,
  largest_possible_order double precision,
  seasonality_months jsonb not null default '[]',
  seasonality_note text,
  pattern_basis text,
  pattern_verified_at date,
  pattern_interaction_id uuid,

  current_unit_price double precision,
  price_currency text not null default 'ETB',
  price_per_unit text,
  price_includes_vat text,
  price_includes_delivery text,
  target_price double precision,
  max_acceptable_price double precision,
  price_basis text,
  price_verified_at date,
  price_interaction_id uuid,

  current_stock_status text,
  stockout_frequency text,
  typical_stockout_duration text,
  stockout_consequences jsonb not null default '[]',
  current_lead_time_days double precision,
  stock_basis text,
  stock_verified_at date,
  stock_interaction_id uuid,

  next_purchase_date date,
  next_purchase_date_precision text,
  next_purchase_qty double precision,
  customer_urgency text,
  next_basis text,
  next_verified_at date,
  next_interaction_id uuid,

  demand_status text not null default 'mentioned',
  willingness_to_test text not null default 'not_asked',
  willingness_basis text,
  willingness_verified_at date,
  switching_trigger text,
  not_pursuing_reason text,
  not_pursuing_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table requirement_variant (
  id uuid primary key default gen_random_uuid(),
  requirement_id uuid not null references product_requirement(id) on delete cascade,
  variant_label text not null,
  size text,
  colour text,
  other_attribute text,
  share_pct double precision
);

create table current_source (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id) on delete cascade,
  requirement_id uuid references product_requirement(id) on delete cascade,
  source_type text not null,
  source_origin text,
  role text,
  name_disclosure text not null default 'not_asked',
  supplier_name text,
  relationship_length text,
  strengths jsonb not null default '[]',
  satisfaction text,
  basis text,
  verified_at date,
  created_at timestamptz not null default now()
);

create table sourcing_problem (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default 'PRB-' || lpad(nextval('problem_code_seq')::text, 4, '0'),
  business_id uuid not null references business(id) on delete cascade,
  requirement_id uuid references product_requirement(id) on delete cascade,
  current_source_id uuid references current_source(id) on delete set null,
  category text not null,
  description text not null,
  basis text not null,
  frequency text not null,
  severity text not null,
  impact_note text,
  current_workaround text,
  addressable_by_us text not null default 'unknown',
  status text not null default 'active',
  first_reported_at date not null default current_date,
  last_confirmed_at date not null default current_date,
  created_at timestamptz not null default now()
);

create table buying_condition (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id) on delete cascade,
  requirement_id uuid references product_requirement(id) on delete cascade,
  condition_type text not null,
  detail text not null,
  threshold_value double precision,
  threshold_unit text,
  importance text not null,
  exclusivity_scope text,
  our_position text,
  basis text,
  verified_at date,
  created_at timestamptz not null default now()
);

create table opportunity (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default 'OPP-' || lpad(nextval('opportunity_code_seq')::text, 4, '0'),
  business_id uuid not null references business(id) on delete cascade,
  title text not null,
  stage text not null default 'identified',
  commitment_level text not null default 'none',
  expected_purchase_date date,
  repeat_of_opportunity_id uuid references opportunity(id) on delete set null,
  lost_reason text,
  lost_reason_detail text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table opportunity_line (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunity(id) on delete cascade,
  requirement_id uuid not null references product_requirement(id) on delete cascade,
  quantity double precision not null,
  unit text not null default 'piece',
  expected_unit_price double precision,
  currency text not null default 'ETB'
);

create table opportunity_stage_history (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunity(id) on delete cascade,
  stage text not null,
  commitment_level text,
  note text,
  changed_at timestamptz not null default now()
);

create table interaction (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default 'INT-' || lpad(nextval('interaction_code_seq')::text, 4, '0'),
  business_id uuid not null references business(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  channel text not null,
  initiated_by text,
  purpose text not null,
  summary text not null,
  customer_statements text,
  our_observations text,
  our_interpretation text,
  customer_commitments text,
  our_commitments text,
  outcome text not null,
  opportunity_id uuid references opportunity(id) on delete set null,
  duration_minutes double precision,
  no_follow_up_reason text,
  created_at timestamptz not null default now()
);

create table interaction_contact (
  interaction_id uuid not null references interaction(id) on delete cascade,
  contact_id uuid not null references contact(id) on delete cascade,
  primary key (interaction_id, contact_id)
);

create table interaction_requirement (
  interaction_id uuid not null references interaction(id) on delete cascade,
  requirement_id uuid not null references product_requirement(id) on delete cascade,
  primary key (interaction_id, requirement_id)
);

create table follow_up (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default 'FUP-' || lpad(nextval('follow_up_code_seq')::text, 4, '0'),
  business_id uuid not null references business(id) on delete cascade,
  contact_id uuid references contact(id) on delete set null,
  requirement_id uuid references product_requirement(id) on delete cascade,
  opportunity_id uuid references opportunity(id) on delete cascade,
  created_from_interaction_id uuid references interaction(id) on delete set null,
  due_date date not null,
  due_time text,
  action_type text not null,
  purpose text not null,
  status text not null default 'open',
  origin text not null default 'manual',
  completed_at timestamptz,
  result_interaction_id uuid references interaction(id) on delete set null,
  created_at timestamptz not null default now()
);

create table tag (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table business_tag (
  business_id uuid not null references business(id) on delete cascade,
  tag_id uuid not null references tag(id) on delete cascade,
  primary key (business_id, tag_id)
);

create table value_history (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  field_group text not null,
  old_values jsonb not null,
  new_values jsonb not null,
  basis text,
  verified_at date,
  interaction_id uuid,
  changed_at timestamptz not null default now()
);

create index on branch (business_id);
create index on contact (business_id);
create index on contact (phone_primary);
create index on product_requirement (business_id);
create index on product_requirement (product_id);
create index on product_requirement (next_purchase_date);
create index on current_source (business_id);
create index on sourcing_problem (business_id);
create index on buying_condition (business_id);
create index on interaction (business_id, occurred_at desc);
create index on follow_up (status, due_date);
create index on opportunity (business_id);
create index on value_history (entity_type, entity_id)
`;

// Starting product categories (editable later). Regulated categories may need
// Ethiopian Food and Drug Authority registration — confirm before sourcing.
const CATEGORIES: [string, boolean, string[]][] = [
  ["Cosmetics & Beauty", true, ["Skin care", "Hair care", "Make-up", "Fragrance", "Nail care"]],
  ["Hair & Salon Supplies", false, ["Hair dryers & tools", "Clippers & trimmers", "Salon furniture", "Hair extensions & wigs", "Consumables"]],
  ["Electronics", false, ["Small appliances", "Audio", "Computer accessories", "Lighting", "Power & batteries"]],
  ["Mobile Accessories", false, ["Chargers & cables", "Cases & protectors", "Earphones & headsets", "Power banks", "Spare parts"]],
  ["Footwear", false, ["Men's", "Women's", "Children's", "Sports"]],
  ["Clothing & Apparel", false, ["Men's", "Women's", "Children's", "Uniforms & workwear"]],
  ["Household", false, ["Kitchen", "Cleaning", "Home décor"]],
  ["Stationery & Office", false, ["Paper products", "Writing", "Office equipment"]],
  ["Auto Parts", false, ["Spare parts", "Accessories", "Lubricants"]],
  ["Hardware & Tools", false, ["Hand tools", "Power tools", "Electrical fittings"]],
  ["Medical & Pharma", true, ["Medical devices", "Consumables"]],
  ["Food & Beverage", true, ["Packaged food", "Beverages"]],
  ["Other", false, []],
];

function esc(s: string) {
  return s.replace(/'/g, "''");
}

const SEED_CATEGORIES = CATEGORIES.map(([name, regulated, subs], i) => {
  const parent = `insert into product_category (name, is_regulated, sort_order) values ('${esc(name)}', ${regulated}, ${i});\n`;
  const children = subs
    .map(
      (s, j) =>
        `insert into product_category (name, parent_id, is_regulated, sort_order) select '${esc(s)}', id, ${regulated}, ${j} from product_category where name = '${esc(name)}' and parent_id is null;\n`,
    )
    .join("");
  return parent + children;
}).join("");

// 26 Nov 2026 — two-step login, settings, individual customers, buying groups.
// Additive only: existing rows keep their values (customer_kind defaults to 'business').
const CUSTOMER_REFINEMENTS = `
alter table app_user add column totp_secret text;
alter table app_user add column totp_enabled boolean not null default false;
alter table app_user add column totp_last_step bigint;
alter table app_user add column recovery_codes jsonb not null default '[]';
alter table user_session add column pending_2fa boolean not null default false;

create table app_setting (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table business add column customer_kind text not null default 'business';
alter table business add column merged_into_business_id uuid references business(id) on delete set null;

create sequence buying_group_code_seq;

create table buying_group (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default 'BG-' || lpad(nextval('buying_group_code_seq')::text, 4, '0'),
  name text not null,
  product_id uuid not null references product(id) on delete restrict,
  target_qty double precision,
  target_date date,
  status text not null default 'forming',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table buying_group_member (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references buying_group(id) on delete cascade,
  requirement_id uuid not null references product_requirement(id) on delete cascade,
  qty double precision not null,
  commitment text not null default 'interested',
  added_at timestamptz not null default now(),
  unique (group_id, requirement_id),
  check (qty > 0)
);

create index on business (customer_kind);
create index on buying_group (product_id);
create index on buying_group_member (requirement_id)
`;

// Phase 2 — suppliers (docs/Platform-Architecture.md §4.1). Additive only.
const SUPPLIERS = `
create sequence supplier_code_seq;

create table supplier (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default 'SUP-' || lpad(nextval('supplier_code_seq')::text, 4, '0'),
  display_name text not null,
  legal_name text,
  supplier_type text not null,
  country text not null default 'United Arab Emirates',
  city text,
  address text,
  website text,
  email text,
  phone text,
  whatsapp text,
  licence_number text,
  tax_number text,
  categories jsonb not null default '[]',
  brands text,
  capabilities text,
  currency text not null default 'AED',
  vat_note text,
  payment_terms text,
  deposit_terms text,
  credit_terms text,
  min_order_value double precision,
  typical_lead_time_days double precision,
  delivery_charges text,
  delivery_areas text,
  sample_policy text,
  return_policy text,
  warranty_terms text,
  export_capable text not null default 'unknown',
  verification_status text not null default 'unverified',
  licence_checked boolean not null default false,
  identity_checked boolean not null default false,
  address_checked boolean not null default false,
  authenticity_evidence boolean not null default false,
  bank_checked boolean not null default false,
  documents_collected text,
  verified_at date,
  verified_by text,
  verification_notes text,
  linked_business_id uuid references business(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table supplier_contact (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references supplier(id) on delete cascade,
  name text not null,
  position text,
  role text,
  phone text,
  whatsapp text,
  email text,
  preferred_channel text,
  is_active boolean not null default true,
  is_primary boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

create table supplier_offer (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references supplier(id) on delete cascade,
  product_id uuid references product(id) on delete set null,
  offer_name text not null,
  brand text,
  model_sku text,
  variant text,
  specification text,
  unit text not null default 'piece',
  origin_country text,
  condition text not null default 'new',
  stock_status text not null default 'unknown',
  moq double precision,
  available_qty double precision,
  lead_time_days double precision,
  local_delivery_charge double precision,
  return_terms text,
  warranty text,
  is_active boolean not null default true,
  last_checked_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table supplier_price (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references supplier_offer(id) on delete cascade,
  min_qty double precision not null default 1,
  unit_price double precision not null,
  currency text not null,
  tax_note text,
  valid_from date not null default current_date,
  valid_until date,
  source text,
  source_reference text,
  recorded_at timestamptz not null default now(),
  check (unit_price >= 0),
  check (min_qty > 0),
  check (valid_until is null or valid_until >= valid_from)
);

alter table interaction alter column business_id drop not null;
alter table interaction add column supplier_id uuid references supplier(id) on delete cascade;
alter table interaction add constraint interaction_has_owner check (business_id is not null or supplier_id is not null);
alter table follow_up alter column business_id drop not null;
alter table follow_up add column supplier_id uuid references supplier(id) on delete cascade;
alter table follow_up add constraint follow_up_has_owner check (business_id is not null or supplier_id is not null);
alter table current_source add column supplier_id uuid references supplier(id) on delete set null;

create index on supplier (verification_status);
create index on supplier (lower(display_name));
create index on supplier_contact (supplier_id);
create index on supplier_offer (supplier_id);
create index on supplier_offer (product_id);
create index on supplier_price (offer_id, min_qty, valid_from desc);
create index on interaction (supplier_id, occurred_at desc);
create index on follow_up (supplier_id)
`;

export const MIGRATIONS: { id: string; sql: string }[] = [
  { id: "001_init", sql: INIT },
  { id: "002_seed_categories", sql: SEED_CATEGORIES },
  { id: "003_customer_refinements", sql: CUSTOMER_REFINEMENTS },
  { id: "004_suppliers", sql: SUPPLIERS },
];
