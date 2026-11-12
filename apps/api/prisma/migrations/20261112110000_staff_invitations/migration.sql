-- Invitation d'un membre d'équipe à se connecter avec son propre compte.
ALTER TABLE "StaffMember"
  ADD COLUMN "inviteEmail" TEXT,
  ADD COLUMN "inviteTokenHash" TEXT,
  ADD COLUMN "inviteExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "StaffMember_inviteTokenHash_key" ON "StaffMember"("inviteTokenHash");

-- Un compte ne peut être rattaché qu'à une seule fiche professionnelle.
CREATE UNIQUE INDEX "StaffMember_one_profile_per_user" ON "StaffMember"("userId") WHERE "userId" IS NOT NULL;
