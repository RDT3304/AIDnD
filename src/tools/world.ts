import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma, withTransaction } from "../db.js";
import { makeSummary, summarizeTableRoll } from "../summarize.js";
import { rollDice } from "../rng.js";

const locationSchema = z.object({
  campaign_id: z.string().cuid(),
  name: z.string().min(1),
  kind: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  stats: z.record(z.any()).optional()
});

const npcSchema = z.object({
  campaign_id: z.string().cuid(),
  name: z.string().min(1),
  role: z.string().optional(),
  disposition: z.string().optional(),
  biography: z.string().optional(),
  stat_block: z.record(z.any()).optional()
});

const questSchema = z.object({
  campaign_id: z.string().cuid(),
  title: z.string().min(1),
  status: z.string().default("open"),
  summary: z.string().optional(),
  details: z.record(z.any()).optional()
});

const tableCreateSchema = z.object({
  campaign_id: z.string().cuid().optional(),
  name: z.string().min(1),
  dice: z.string().min(1),
  scope: z.string().optional(),
  entries: z
    .array(
      z.object({
        range: z
          .tuple([z.number().int(), z.number().int()])
          .refine(([min, max]) => min <= max, { message: "range must be ascending" }),
        result: z.union([z.string(), z.record(z.any())])
      })
    )
    .min(1)
});

const tableRollSchema = z.object({
  table_id: z.string().cuid()
});

export function registerWorldTools(server: McpServer): void {
  server.tool("location.create", locationSchema, async (args) => {
    const { location, summary } = await withTransaction(async (tx) => {
      const created = await tx.location.create({
        data: {
          campaignId: args.campaign_id,
          name: args.name,
          kind: args.kind,
          description: args.description,
          tags: args.tags as Prisma.JsonValue,
          stats: args.stats as Prisma.JsonValue
        }
      });

      const logSummary = makeSummary(
        "Location created",
        `${created.name}`,
        args.kind ?? "unspecified kind"
      );

      await tx.eventLog.create({
        data: {
          campaignId: created.campaignId,
          type: "location.create",
          summary: logSummary,
          payload: {
            location_id: created.id,
            name: created.name,
            kind: created.kind
          } as Prisma.JsonValue
        }
      });

      return { location: created, summary: logSummary };
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
              location_id: location.id
            },
            null,
            2
          )
        }
      ]
    };
  });

  server.tool("npc.create", npcSchema, async (args) => {
    const { npc, summary } = await withTransaction(async (tx) => {
      const created = await tx.npc.create({
        data: {
          campaignId: args.campaign_id,
          name: args.name,
          role: args.role,
          disposition: args.disposition,
          biography: args.biography,
          statBlock: args.stat_block as Prisma.JsonValue
        }
      });

      const logSummary = makeSummary(
        "NPC created",
        `${created.name}`,
        created.role ?? "role unknown"
      );

      await tx.eventLog.create({
        data: {
          campaignId: created.campaignId,
          type: "npc.create",
          summary: logSummary,
          payload: {
            npc_id: created.id,
            name: created.name,
            role: created.role
          } as Prisma.JsonValue
        }
      });

      return { npc: created, summary: logSummary };
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
              npc_id: npc.id
            },
            null,
            2
          )
        }
      ]
    };
  });

  server.tool("quest.create", questSchema, async (args) => {
    const { quest, summary } = await withTransaction(async (tx) => {
      const created = await tx.quest.create({
        data: {
          campaignId: args.campaign_id,
          title: args.title,
          status: args.status ?? "open",
          summary: args.summary,
          details: args.details as Prisma.JsonValue
        }
      });

      const logSummary = makeSummary(
        "Quest created",
        `${created.title}`,
        created.status
      );

      await tx.eventLog.create({
        data: {
          campaignId: created.campaignId,
          type: "quest.create",
          summary: logSummary,
          payload: {
            quest_id: created.id,
            title: created.title,
            status: created.status
          } as Prisma.JsonValue
        }
      });

      return { quest: created, summary: logSummary };
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
              quest_id: quest.id
            },
            null,
            2
          )
        }
      ]
    };
  });

  server.tool("table.create", tableCreateSchema, async (args) => {
    const { table, summary } = await withTransaction(async (tx) => {
      const created = await tx.randomTable.create({
        data: {
          campaignId: args.campaign_id ?? null,
          name: args.name,
          dice: args.dice,
          scope: args.scope
        }
      });

      await tx.randomTableEntry.createMany({
        data: args.entries.map((entry) => ({
          tableId: created.id,
          min: entry.range[0],
          max: entry.range[1],
          result: entry.result as Prisma.JsonValue
        }))
      });

      const logSummary = makeSummary(
        "Random table created",
        `${created.name}`,
        `${args.entries.length} entries`
      );

      await tx.eventLog.create({
        data: {
          campaignId: created.campaignId ?? undefined,
          type: "table.create",
          summary: logSummary,
          payload: {
            table_id: created.id,
            dice: created.dice,
            entries: args.entries.length
          } as Prisma.JsonValue
        }
      });

      return { table: created, summary: logSummary };
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
              table_id: table.id
            },
            null,
            2
          )
        }
      ]
    };
  });

  server.tool("table.roll", tableRollSchema, async (args) => {
    const table = await prisma.randomTable.findUnique({
      where: { id: args.table_id },
      include: { entries: true }
    });

    if (!table) {
      throw new Error(`Random table ${args.table_id} not found`);
    }

    if (!table.entries.length) {
      throw new Error(`Random table ${table.name} has no entries`);
    }

    const rollResult = rollDice({ notation: table.dice });
    const match = table.entries.find(
      (entry) => rollResult.total >= entry.min && rollResult.total <= entry.max
    );

    return {
      content: [
        {
          type: "text",
          text: summarizeTableRoll(
            table.name,
            rollResult.total,
            match?.result ?? null
          )
        },
        {
          type: "text",
          text: JSON.stringify(
            {
              roll: rollResult.total,
              seed: rollResult.seed,
              result: match?.result ?? null
            },
            null,
            2
          )
        }
      ]
    };
  });
}
