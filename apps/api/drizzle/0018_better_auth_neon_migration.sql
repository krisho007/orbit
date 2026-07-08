CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp with time zone,
	"refreshTokenExpiresAt" timestamp with time zone,
	"scope" text,
	"password" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_provider_account_unique" UNIQUE("providerId","accountId")
);
--> statement-breakpoint
CREATE TABLE "image_blobs" (
	"id" text PRIMARY KEY NOT NULL,
	"contactId" text,
	"contentType" text NOT NULL,
	"data" "bytea" NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
--> Convert the legacy Supabase `emailVerified` timestamp to the boolean shape
--> Better Auth expects. Existing rows: verified iff the timestamp was set.
ALTER TABLE "users" ALTER COLUMN "emailVerified" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "emailVerified" SET DATA TYPE boolean USING ("emailVerified" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "emailVerified" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "emailVerified" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_blobs" ADD CONSTRAINT "image_blobs_contactId_contacts_id_fk" FOREIGN KEY ("contactId") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_userId_idx" ON "accounts" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "image_blobs_contactId_idx" ON "image_blobs" USING btree ("contactId");--> statement-breakpoint
CREATE INDEX "sessions_userId_idx" ON "sessions" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "googleProviderToken";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "googleProviderRefreshToken";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "googleTokenExpiresAt";--> statement-breakpoint
--> Disable the Supabase-era RLS (migration 0012 enabled RLS with zero policies,
--> which only worked because Supabase's service role bypassed it). On Neon we
--> connect as the normal owner role, so RLS-with-no-policies would deny all
--> access. Tenant isolation is enforced in application code (eq(userId, ...)).
ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contacts" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tags" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "conversations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reminders" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "events" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "relationship_types" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "relationships" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assistant_conversations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contact_tags" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "conversation_participants" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reminder_participants" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "event_participants" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "social_links" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contact_images" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assistant_messages" DISABLE ROW LEVEL SECURITY;