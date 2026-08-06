-- DropIndex
DROP INDEX "users_tenant_id_email_key";

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
