import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { withTransaction } from "../db.js";
import { makeSummary, summarizeRoster } from "../summarize.js";

const rosterMemberSchema = z.object({
  name: z.string().min(1),
  side: z.string().min(1),
  base: z.record(z.any()).optional()
});

const encounterSchema = z.object({
  campaign_id: z.string().cuid(),
  name: z.string().min(1),
  difficulty: z.string().default("medium"),
  roster: z.array(rosterMemberSchema).min(1),
  notes: z.string().optional()
});

export function registerEncounterTools(server: McpServer): void {
  server.tool("encounter.build", encounterSchema, async (args) => {
    const { encounter, summary } = await withTransaction(async (tx) => {
      const created = await tx.encounter.create({
        data: {
          campaignId: args.campaign_id,
          name: args.name,
          difficulty: args.difficulty ?? "medium",
          notes: args.notes ?? null,
          metadata: {
            roster_size: args.roster.length
          } as Prisma.JsonValue
        }
      });

      await Promise.all(
        args.roster.map((member) =>
          tx.encounterCombatant.create({
            data: {
              encounterId: created.id,
              name: member.name,
              side: member.side,
              base: (member.base ?? null) as Prisma.JsonValue
            }
          })
        )
      );

      const logSummary = makeSummary(
        "Encounter built",
        `${created.name}`,
        summarizeRoster(args.roster)
      );

      await tx.eventLog.create({
        data: {
          campaignId: created.campaignId,
          type: "encounter.build",
          summary: logSummary,
          payload: {
            encounter_id: created.id,
            difficulty: created.difficulty,
            roster: args.roster.map((member) => ({
              name: member.name,
              side: member.side
            }))
          } as Prisma.JsonValue
        }
      });

      return { encounter: created, summary: logSummary };
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
              encounter_id: encounter.id
            },
            null,
            2
          )
        }
      ]
    };
  });
}
