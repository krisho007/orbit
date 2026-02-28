CREATE TYPE "UserPlan" AS ENUM ('free', 'paid');
ALTER TABLE "users" ADD COLUMN "plan" "UserPlan" DEFAULT 'free' NOT NULL;
