-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roasts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "coffee_name" TEXT NOT NULL,
    "origin" TEXT,
    "variety" TEXT,
    "process" TEXT,
    "roast_date" DATE NOT NULL,
    "batch_size_g" INTEGER,
    "roast_level" TEXT,
    "roast_time_s" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cupping_sessions" (
    "id" UUID NOT NULL,
    "roast_id" UUID NOT NULL,
    "cupped_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scoring_schema_version" TEXT NOT NULL,
    "overall_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cupping_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cupping_scores" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "attribute_key" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "descriptor" TEXT,

    CONSTRAINT "cupping_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "stripe_customer_id" TEXT,
    "stripe_subscription_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'trialing',
    "price_id" TEXT,
    "trial_ends_at" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "roasts_user_id_roast_date_idx" ON "roasts"("user_id", "roast_date");

-- CreateIndex
CREATE INDEX "cupping_sessions_roast_id_idx" ON "cupping_sessions"("roast_id");

-- CreateIndex
CREATE UNIQUE INDEX "cupping_scores_session_id_attribute_key_key" ON "cupping_scores"("session_id", "attribute_key");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_user_id_key" ON "subscriptions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripe_customer_id_key" ON "subscriptions"("stripe_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripe_subscription_id_key" ON "subscriptions"("stripe_subscription_id");

-- AddForeignKey
ALTER TABLE "roasts" ADD CONSTRAINT "roasts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cupping_sessions" ADD CONSTRAINT "cupping_sessions_roast_id_fkey" FOREIGN KEY ("roast_id") REFERENCES "roasts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cupping_scores" ADD CONSTRAINT "cupping_scores_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "cupping_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

