CREATE TABLE "public"."deals" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "merchant_id"      uuid,
  "business_name"    text                     NOT NULL,
  "title"            text                     NOT NULL,
  "description"      text,
  "discount_percent" integer,
  "expires_at"       timestamp with time zone,
  "active"           boolean                  DEFAULT true,
  "created_at"       timestamp with time zone DEFAULT now(),
  CONSTRAINT "deals_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."deals"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."deals"
  ADD CONSTRAINT "deals_merchant_id_fkey" FOREIGN KEY (merchant_id) REFERENCES auth.users(id);

CREATE POLICY "Anyone can view active deals" ON "public"."deals"
  FOR SELECT
  TO PUBLIC
  USING ((active = true));

CREATE POLICY "Public active deals select" ON "public"."deals"
  FOR SELECT
  TO PUBLIC
  USING ((active = true));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."deals" TO "anon", "authenticated", "postgres", "service_role";

