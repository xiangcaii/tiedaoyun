-- Add config JSON column to roles for custom row/field-level policies
-- (HLD §7.2 data + field-level permission, plan T9).

-- AlterTable
ALTER TABLE "roles"
  ADD COLUMN "config" JSONB NOT NULL DEFAULT '{}'::jsonb;
