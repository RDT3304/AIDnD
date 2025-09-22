import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma, withTransaction } from "../db.js";
import { makeSummary, summarizeRoster } from "../summarize.js";

type JsonRecord = Record<string, unknown>;

const rosterMemberSchema = z.object({
  name: z.string().min(1),
  side: z.string().min(1),
  base: z.record(z.any()).optional()
});

const startSchema = z
  .object({
    campaign_id: z.string().cuid(),
    encounter_id: z.string().cuid().optional(),
    roster: z.array(rosterMemberSchema).optional()
  })
  .refine(
    (input) =>
      Boolean(input.encounter_id) || (input.roster?.length ?? 0) > 0,
    {
      message: "Provide encounter_id or roster"
    }
  );

const applySchema = z.object({
  combat_id: z.string().cuid(),
  target: z.string().cuid(),
  action: z.enum([
    "damage",
    "heal",
    "temp_hp",
    "add_condition",
    "remove_condition",
    "custom_note"
  ]),
  value: z.union([z.number().int(), z.string()]).optional(),
  condition: z.string().optional()
});

const nextTurnSchema = z.object({
  combat_id: z.string().cuid(),
  version: z.number().int().positive()
});

function numeric(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return Math.trunc(parsed);
    }
  }
  return undefined;
}

function extractHp(base: JsonRecord | undefined): { max: number; current: number } {
  if (!base) {
    return { max: 0, current: 0 };
  }

  const hpField = base.hp as JsonRecord | number | undefined;

  const maxCandidates = [
    numeric(base.maxHp),
    numeric(base.max_hp),
    numeric(base.hp_max),
    numeric(base.hit_points),
    typeof hpField === "object" ? numeric((hpField as JsonRecord).max) : numeric(hpField)
  ];
  const currentCandidates = [
    numeric(base.currentHp),
    numeric(base.current_hp),
    numeric(base.hp_current),
    typeof hpField === "object" ? numeric((hpField as JsonRecord).current) : numeric(hpField)
  ];

  const max = maxCandidates.find((value) => value !== undefined) ?? 0;
  const current =
    currentCandidates.find((value) => value !== undefined) ?? max;

  return {
    max,
    current
  };
}

function extractInitiative(base: JsonRecord | undefined, index: number, size: number): number {
  if (!base) {
    return (size - index) * 10;
  }

  const candidates = [
    numeric(base.initiative),
    numeric(base.initiative_bonus),
    numeric(base.initiativeBonus),
    numeric(base.dex_mod),
    numeric(base.dexMod)
  ];

  const first = candidates.find((value) => value !== undefined);
  return first ?? (size - index) * 10;
}

export function registerCombatTools(server: McpServer): void {
  server.tool("combat.start", startSchema, async (args) => {
    const { combat, combatants, summary } = await withTransaction(async (tx) => {
      let roster = args.roster ?? [];

      if ((!roster || roster.length === 0) && args.encounter_id) {
        const encounter = await tx.encounter.findUnique({
          where: { id: args.encounter_id },
          include: { combatants: true }
        });
        if (!encounter) {
          throw new Error(`Encounter ${args.encounter_id} not found`);
        }
        roster = encounter.combatants.map((member) => ({
          name: member.name,
          side: member.side,
          base: (member.base ?? undefined) as JsonRecord | undefined
        }));
      }

      if (!roster.length) {
        throw new Error("No combatants provided");
      }

      const combatRecord = await tx.combat.create({
        data: {
          campaignId: args.campaign_id,
          encounterId: args.encounter_id ?? null,
          round: 1,
          turnIndex: 0,
          version: 1,
          status: "active",
          initiative: {
            roster_size: roster.length
          } as Prisma.JsonValue
        }
      });

      const combatantsCreated = await Promise.all(
        roster.map(async (member, index) => {
          const base = member.base as JsonRecord | undefined;
          const hp = extractHp(base);
          const initiative = extractInitiative(base, index, roster.length);

          return tx.combatantInCombat.create({
            data: {
              combatId: combatRecord.id,
              name: member.name,
              side: member.side,
              maxHp: hp.max,
              currentHp: hp.current,
              tempHp: 0,
              initiative,
              conditions: [] as Prisma.JsonValue,
              notes: null,
              stats: (member.base ?? null) as Prisma.JsonValue
            }
          });
        })
      );

      const order = [...combatantsCreated].sort((a, b) => b.initiative - a.initiative);

      const logSummary = makeSummary(
        "Combat started",
        `${combatRecord.id}`,
        summarizeRoster(
          roster.map((member) => ({ name: member.name, side: member.side }))
        )
      );

      await tx.eventLog.create({
        data: {
          campaignId: combatRecord.campaignId,
          type: "combat.start",
          summary: logSummary,
          payload: {
            combat_id: combatRecord.id,
            combatants: order.map((entry) => ({
              id: entry.id,
              name: entry.name,
              side: entry.side,
              initiative: entry.initiative
            }))
          } as Prisma.JsonValue
        }
      });

      return { combat: combatRecord, combatants: order, summary: logSummary };
    });

    return {
      content: [
        {
          type: "text",
          text: summary
        },
        {
          type: "text",
          text: JSON.stringify(
            {
              combat_id: combat.id,
              round: combat.round,
              version: combat.version,
              initiative_order: combatants.map((entry) => ({
                id: entry.id,
                name: entry.name,
                side: entry.side,
                initiative: entry.initiative
              }))
            },
            null,
            2
          )
        }
      ]
    };
  });

  server.tool("combat.apply", applySchema, async (args) => {
    const { updated, summary } = await withTransaction(async (tx) => {
      const combatant = await tx.combatantInCombat.findUnique({
        where: { id: args.target },
        include: {
          combat: {
            select: {
              id: true,
              campaignId: true
            }
          }
        }
      });

      if (!combatant) {
        throw new Error(`Combatant ${args.target} not found`);
      }
      if (combatant.combatId !== args.combat_id) {
        throw new Error("Combatant does not belong to the specified combat");
      }

      let conditions: string[] = Array.isArray(combatant.conditions)
        ? (combatant.conditions as string[])
        : [];

      let currentHp = combatant.currentHp;
      let tempHp = combatant.tempHp;
      let notes = combatant.notes ?? null;

      switch (args.action) {
        case "damage": {
          const value = typeof args.value === "number" ? Math.max(args.value, 0) : 0;
          let remaining = value;
          if (tempHp > 0) {
            const absorbed = Math.min(tempHp, remaining);
            tempHp -= absorbed;
            remaining -= absorbed;
          }
          currentHp = Math.max(0, currentHp - remaining);
          break;
        }
        case "heal": {
          const value = typeof args.value === "number" ? Math.max(args.value, 0) : 0;
          currentHp = Math.min(combatant.maxHp, currentHp + value);
          break;
        }
        case "temp_hp": {
          const value = typeof args.value === "number" ? Math.max(args.value, 0) : 0;
          tempHp = value;
          break;
        }
        case "add_condition": {
          if (!args.condition) {
            throw new Error("condition is required for add_condition");
          }
          if (!conditions.includes(args.condition)) {
            conditions = [...conditions, args.condition];
          }
          break;
        }
        case "remove_condition": {
          if (!args.condition) {
            throw new Error("condition is required for remove_condition");
          }
          conditions = conditions.filter((item) => item !== args.condition);
          break;
        }
        case "custom_note": {
          const text = typeof args.value === "string" ? args.value : args.condition ?? "";
          notes = text;
          break;
        }
        default:
          break;
      }

      const updatedCombatant = await tx.combatantInCombat.update({
        where: { id: combatant.id },
        data: {
          currentHp,
          tempHp,
          conditions,
          notes
        }
      });

      const logSummary = makeSummary(
        `Combat ${args.action}`,
        `${updatedCombatant.name}`,
        `hp ${updatedCombatant.currentHp}/${updatedCombatant.maxHp}`
      );

      await tx.eventLog.create({
        data: {
          campaignId: combatant.combat.campaignId,
          type: `combat.${args.action}`,
          summary: logSummary,
          payload: {
            combat_id: combatant.combat.id,
            combatant_id: updatedCombatant.id,
            action: args.action,
            value: args.value ?? null,
            condition: args.condition ?? null
          } as Prisma.JsonValue
        }
      });

      return { updated: updatedCombatant, summary: logSummary };
    });

    return {
      content: [
        {
          type: "text",
          text: summary
        },
        {
          type: "text",
          text: JSON.stringify(
            {
              ok: true,
              target: {
                id: updated.id,
                current_hp: updated.currentHp,
                temp_hp: updated.tempHp,
                conditions: updated.conditions
              }
            },
            null,
            2
          )
        }
      ]
    };
  });

  server.tool("combat.next_turn", nextTurnSchema, async (args) => {
    const { combat, active, summary } = await withTransaction(async (tx) => {
      const current = await tx.combat.findUnique({
        where: { id: args.combat_id },
        include: {
          combatants: {
            orderBy: [
              { initiative: "desc" },
              { createdAt: "asc" }
            ]
          }
        }
      });

      if (!current) {
        throw new Error(`Combat ${args.combat_id} not found`);
      }

      if (current.version !== args.version) {
        throw new Error("Version conflict – fetch latest combat state before advancing");
      }

      const totalCombatants = current.combatants.length;
      if (totalCombatants === 0) {
        throw new Error("Cannot advance turn with no combatants");
      }

      const nextIndex = (current.turnIndex + 1) % totalCombatants;
      const nextRound = nextIndex === 0 ? current.round + 1 : current.round;

      const updatedCount = await tx.combat.updateMany({
        where: { id: current.id, version: current.version },
        data: {
          turnIndex: nextIndex,
          round: nextRound,
          version: { increment: 1 }
        }
      });

      if (updatedCount.count === 0) {
        throw new Error("Version conflict – state changed concurrently");
      }

      const refreshed = await tx.combat.findUnique({
        where: { id: current.id },
        include: {
          combatants: {
            orderBy: [
              { initiative: "desc" },
              { createdAt: "asc" }
            ]
          }
        }
      });

      if (!refreshed) {
        throw new Error("Failed to load combat after advance");
      }

      const activeCombatant = refreshed.combatants[nextIndex];

      const logSummary = makeSummary(
        "Combat next turn",
        `${activeCombatant?.name ?? "n/a"}`,
        `round ${refreshed.round}, turn ${nextIndex + 1}`
      );

      await tx.eventLog.create({
        data: {
          campaignId: refreshed.campaignId,
          type: "combat.next_turn",
          summary: logSummary,
          payload: {
            combat_id: refreshed.id,
            round: refreshed.round,
            turn_index: refreshed.turnIndex,
            active: activeCombatant?.id ?? null
          } as Prisma.JsonValue
        }
      });

      return { combat: refreshed, active: activeCombatant, summary: logSummary };
    });

    return {
      content: [
        {
          type: "text",
          text: summary
        },
        {
          type: "text",
          text: JSON.stringify(
            {
              active: active
                ? {
                    id: active.id,
                    name: active.name,
                    side: active.side,
                    current_hp: active.currentHp,
                    temp_hp: active.tempHp
                  }
                : null,
              round: combat.round,
              turn_index: combat.turnIndex,
              version: combat.version
            },
            null,
            2
          )
        }
      ]
    };
  });
}
