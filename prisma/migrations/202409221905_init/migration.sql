-- CreateEnum
CREATE TYPE "CombatStatus" AS ENUM ('active', 'completed');

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT PRIMARY KEY,
    "title" TEXT NOT NULL,
    "system" TEXT NOT NULL DEFAULT '5e',
    "premise" TEXT,
    "tone" TEXT,
    "session_zero" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP DEFAULT NOW(),
    "updated_at" TIMESTAMP DEFAULT NOW()
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT PRIMARY KEY,
    "campaign_id" TEXT NOT NULL REFERENCES "Campaign"("id") ON DELETE CASCADE,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "scheduled_at" TIMESTAMP,
    "created_at" TIMESTAMP DEFAULT NOW()
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT PRIMARY KEY,
    "campaign_id" TEXT NOT NULL REFERENCES "Campaign"("id") ON DELETE CASCADE,
    "name" TEXT NOT NULL,
    "kind" TEXT,
    "description" TEXT,
    "tags" TEXT,
    "stats" TEXT,
    "created_at" TIMESTAMP DEFAULT NOW()
);

-- CreateTable
CREATE TABLE "Npc" (
    "id" TEXT PRIMARY KEY,
    "campaign_id" TEXT NOT NULL REFERENCES "Campaign"("id") ON DELETE CASCADE,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "disposition" TEXT,
    "biography" TEXT,
    "stat_block" TEXT,
    "created_at" TIMESTAMP DEFAULT NOW()
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT PRIMARY KEY,
    "campaign_id" TEXT NOT NULL REFERENCES "Campaign"("id") ON DELETE CASCADE,
    "name" TEXT NOT NULL,
    "rarity" TEXT,
    "description" TEXT,
    "data" TEXT,
    "created_at" TIMESTAMP DEFAULT NOW()
);

-- CreateTable
CREATE TABLE "Quest" (
    "id" TEXT PRIMARY KEY,
    "campaign_id" TEXT NOT NULL REFERENCES "Campaign"("id") ON DELETE CASCADE,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "summary" TEXT,
    "details" TEXT,
    "created_at" TIMESTAMP DEFAULT NOW()
);

-- CreateTable
CREATE TABLE "Encounter" (
    "id" TEXT PRIMARY KEY,
    "campaign_id" TEXT NOT NULL REFERENCES "Campaign"("id") ON DELETE CASCADE,
    "name" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL DEFAULT 'medium',
    "notes" TEXT,
    "metadata" TEXT,
    "created_at" TIMESTAMP DEFAULT NOW(),
    "updated_at" TIMESTAMP DEFAULT NOW()
);

-- CreateTable
CREATE TABLE "EncounterCombatant" (
    "id" TEXT PRIMARY KEY,
    "encounter_id" TEXT NOT NULL REFERENCES "Encounter"("id") ON DELETE CASCADE,
    "name" TEXT NOT NULL,
    "side" TEXT NOT NULL DEFAULT 'enemy',
    "base" TEXT,
    "created_at" TIMESTAMP DEFAULT NOW()
);

-- CreateTable
CREATE TABLE "Combat" (
    "id" TEXT PRIMARY KEY,
    "campaign_id" TEXT NOT NULL REFERENCES "Campaign"("id") ON DELETE CASCADE,
    "encounter_id" TEXT REFERENCES "Encounter"("id") ON DELETE SET NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "turn_index" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "CombatStatus" NOT NULL DEFAULT 'active',
    "initiative" TEXT,
    "created_at" TIMESTAMP DEFAULT NOW(),
    "updated_at" TIMESTAMP DEFAULT NOW()
);

-- CreateTable
CREATE TABLE "CombatantInCombat" (
    "id" TEXT PRIMARY KEY,
    "combat_id" TEXT NOT NULL REFERENCES "Combat"("id") ON DELETE CASCADE,
    "name" TEXT NOT NULL,
    "side" TEXT NOT NULL DEFAULT 'enemy',
    "max_hp" INTEGER NOT NULL DEFAULT 0,
    "current_hp" INTEGER NOT NULL DEFAULT 0,
    "temp_hp" INTEGER NOT NULL DEFAULT 0,
    "initiative" INTEGER NOT NULL DEFAULT 0,
    "conditions" TEXT,
    "notes" TEXT,
    "stats" TEXT,
    "created_at" TIMESTAMP DEFAULT NOW()
);

-- CreateTable
CREATE TABLE "RandomTable" (
    "id" TEXT PRIMARY KEY,
    "campaign_id" TEXT REFERENCES "Campaign"("id") ON DELETE SET NULL,
    "name" TEXT NOT NULL,
    "dice" TEXT NOT NULL,
    "scope" TEXT,
    "created_at" TIMESTAMP DEFAULT NOW()
);

-- CreateTable
CREATE TABLE "RandomTableEntry" (
    "id" TEXT PRIMARY KEY,
    "table_id" TEXT NOT NULL REFERENCES "RandomTable"("id") ON DELETE CASCADE,
    "min" INTEGER NOT NULL,
    "max" INTEGER NOT NULL,
    "result" TEXT NOT NULL,
    "created_at" TIMESTAMP DEFAULT NOW()
);

-- CreateTable
CREATE TABLE "RulesIndex" (
    "id" TEXT PRIMARY KEY,
    "system" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "created_at" TIMESTAMP DEFAULT NOW()
);

-- CreateTable
CREATE TABLE "Snapshot" (
    "id" TEXT PRIMARY KEY,
    "campaign_id" TEXT NOT NULL REFERENCES "Campaign"("id") ON DELETE CASCADE,
    "label" TEXT,
    "payload" TEXT NOT NULL,
    "created_at" TIMESTAMP DEFAULT NOW()
);

-- CreateTable
CREATE TABLE "EventLog" (
    "id" TEXT PRIMARY KEY,
    "campaign_id" TEXT REFERENCES "Campaign"("id") ON DELETE SET NULL,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "payload" TEXT,
    "created_at" TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX "Campaign_title_idx" ON "Campaign"("title");
CREATE INDEX "Session_campaign_idx" ON "Session"("campaign_id");
CREATE INDEX "Location_campaign_idx" ON "Location"("campaign_id");
CREATE INDEX "Location_name_idx" ON "Location"("name");
CREATE INDEX "Npc_campaign_idx" ON "Npc"("campaign_id");
CREATE INDEX "Npc_name_idx" ON "Npc"("name");
CREATE INDEX "Item_campaign_idx" ON "Item"("campaign_id");
CREATE INDEX "Quest_campaign_idx" ON "Quest"("campaign_id");
CREATE INDEX "Quest_status_idx" ON "Quest"("status");
CREATE INDEX "Encounter_campaign_idx" ON "Encounter"("campaign_id");
CREATE INDEX "EncounterCombatant_encounter_idx" ON "EncounterCombatant"("encounter_id");
CREATE INDEX "Combat_campaign_idx" ON "Combat"("campaign_id");
CREATE INDEX "Combat_encounter_idx" ON "Combat"("encounter_id");
CREATE INDEX "CombatantInCombat_combat_idx" ON "CombatantInCombat"("combat_id");
CREATE INDEX "CombatantInCombat_initiative_idx" ON "CombatantInCombat"("initiative");
CREATE INDEX "RandomTable_campaign_idx" ON "RandomTable"("campaign_id");
CREATE INDEX "RandomTable_name_idx" ON "RandomTable"("name");
CREATE INDEX "RandomTableEntry_table_idx" ON "RandomTableEntry"("table_id");
CREATE INDEX "RulesIndex_system_idx" ON "RulesIndex"("system");
CREATE INDEX "Snapshot_campaign_idx" ON "Snapshot"("campaign_id");
CREATE INDEX "EventLog_campaign_idx" ON "EventLog"("campaign_id");
CREATE INDEX "EventLog_type_idx" ON "EventLog"("type");
