import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma, withTransaction } from "../db.js";
import { formatCounts, makeSummary } from "../summarize.js";

const createSchema = z.object({
  title: z.string().min(1, "Title is required"),
  system: z.string().default("5e"),
  premise: z.string().optional(),
  tone: z.string().optional(),
  session_zero: z.string().optional()
});

const updateSchema = z
  .object({
    id: z.string().cuid("Campaign id must be a CUID"),
    patch: z
      .object({
        title: z.string().min(1).optional(),
        system: z.string().optional(),
        premise: z.string().nullable().optional(),
        tone: z.string().nullable().optional(),
        session_zero: z.string().nullable().optional()
      })
      .refine((obj) => Object.keys(obj).length > 0, {
        message: "patch must include at least one mutating field"
      })
  });

const getSchema = z.object({
  id: z.string().cuid("Campaign id must be a CUID")
});

const listSchema = z.object({
  q: z.string().min(2).optional()
});

type CampaignCounts = {
  sessions: number;
  locations: number;
  npcs: number;
  quests: number;
  encounters: number;
  combats: number;
  randomTables: number;
};

function countsFromAggregate(count: {
  sessions: number;
  locations: number;
  npcs: number;
  quests: number;
  encounters: number;
  combats: number;
  randomTables: number;
}): CampaignCounts {
  return {
    sessions: count.sessions,
    locations: count.locations,
    npcs: count.npcs,
    quests: count.quests,
    encounters: count.encounters,
    combats: count.combats,
    randomTables: count.randomTables
  };
}

export function registerCampaignTools(server: McpServer): void {
  server.tool("campaign.create", createSchema, async (args) => {
    const { campaign, summary } = await withTransaction(async (tx) => {
      const created = await tx.campaign.create({
        data: {
          title: args.title,
          system: args.system ?? "5e",
          premise: args.premise,
          tone: args.tone,
          sessionZero: args.session_zero ?? null
        }
      });

      const logSummary = makeSummary(
        "Campaign created",
        `${created.title} (${created.system})`
      );

      await tx.eventLog.create({
        data: {
          campaignId: created.id,
          type: "campaign.create",
          summary: logSummary,
          payload: {
            title: created.title,
            system: created.system,
            premise: created.premise,
            tone: created.tone
          } as Prisma.JsonValue
        }
      });

      return { campaign: created, summary: logSummary };
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
              campaign_id: campaign.id,
              version: campaign.version
            },
            null,
            2
          )
        }
      ]
    };
  });

  server.tool("campaign.update", updateSchema, async (args) => {
    const { campaign, summary } = await withTransaction(async (tx) => {
      const data: Prisma.CampaignUpdateInput = {};
      if (args.patch.title !== undefined) data.title = args.patch.title;
      if (args.patch.system !== undefined) data.system = args.patch.system;
      if (args.patch.premise !== undefined) data.premise = args.patch.premise;
      if (args.patch.tone !== undefined) data.tone = args.patch.tone;
      if (args.patch.session_zero !== undefined) {
        data.sessionZero = args.patch.session_zero;
      }
      data.version = { increment: 1 };

      await tx.campaign.update({
        where: { id: args.id },
        data
      });

      const hydrated = await tx.campaign.findUnique({
        where: { id: args.id },
        include: {
          _count: {
            select: {
              sessions: true,
              locations: true,
              npcs: true,
              quests: true,
              encounters: true,
              combats: true,
              randomTables: true
            }
          }
        }
      });

      if (!hydrated) {
        throw new Error(`Campaign ${args.id} not found after update`);
      }

      const logSummary = makeSummary(
        "Campaign updated",
        `${hydrated.title} v${hydrated.version}`
      );

      await tx.eventLog.create({
        data: {
          campaignId: hydrated.id,
          type: "campaign.update",
          summary: logSummary,
          payload: args.patch as Prisma.JsonValue
        }
      });

      return { campaign: hydrated, summary: logSummary };
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
              version: campaign.version,
              counts: countsFromAggregate(campaign._count)
            },
            null,
            2
          )
        }
      ]
    };
  });

  server.tool("campaign.get", getSchema, async (args) => {
    const campaign = await prisma.campaign.findUnique({
      where: { id: args.id },
      include: {
        _count: {
          select: {
            sessions: true,
            locations: true,
            npcs: true,
            quests: true,
            encounters: true,
            combats: true,
            randomTables: true
          }
        }
      }
    });

    if (!campaign) {
      throw new Error(`Campaign ${args.id} not found`);
    }

    const counts = countsFromAggregate(campaign._count);

    return {
      content: [
        {
          type: "text",
          text: makeSummary(
            "Campaign fetched",
            `${campaign.title} (${campaign.system})`,
            formatCounts(counts)
          )
        },
        {
          type: "text",
          text: JSON.stringify(
            {
              campaign: {
                id: campaign.id,
                title: campaign.title,
                system: campaign.system,
                premise: campaign.premise,
                tone: campaign.tone,
                session_zero: campaign.sessionZero,
                version: campaign.version,
                created_at: campaign.createdAt,
                updated_at: campaign.updatedAt
              },
              related_counts: counts
            },
            null,
            2
          )
        }
      ]
    };
  });

  server.tool("campaign.list", listSchema, async (args) => {
    const campaigns = await prisma.campaign.findMany({
      where: args.q
        ? {
            OR: [
              { title: { contains: args.q, mode: "insensitive" } },
              { premise: { contains: args.q, mode: "insensitive" } }
            ]
          }
        : undefined,
      orderBy: { updatedAt: "desc" },
      take: 50
    });

    return {
      content: [
        {
          type: "text",
          text: `Found ${campaigns.length} campaign(s)`
        },
        {
          type: "text",
          text: JSON.stringify(
            {
              items: campaigns.map((c) => ({
                id: c.id,
                title: c.title,
                system: c.system,
                created_at: c.createdAt,
                updated_at: c.updatedAt
              }))
            },
            null,
            2
          )
        }
      ]
    };
  });
}
