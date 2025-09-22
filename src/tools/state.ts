import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma, withTransaction } from "../db.js";
import { makeSummary } from "../summarize.js";

const snapshotSchema = z.object({
  campaign_id: z.string().cuid(),
  label: z.string().optional()
});

const restoreSchema = z.object({
  snapshot_id: z.string().cuid()
});

const exportSchema = z.object({
  campaign_id: z.string().cuid(),
  format: z.enum(["json", "md"])
});

function serialize(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

export function registerStateTools(server: McpServer): void {
  server.tool("state.snapshot", snapshotSchema, async (args) => {
    const { snapshot, summary } = await withTransaction(async (tx) => {
      const campaign = await tx.campaign.findUnique({
        where: { id: args.campaign_id },
        include: {
          locations: true,
          npcs: true,
          quests: true,
          items: true,
          encounters: {
            include: {
              combatants: true
            }
          },
          combats: {
            include: {
              combatants: true
            }
          },
          randomTables: {
            include: {
              entries: true
            }
          },
          sessions: true
        }
      });

      if (!campaign) {
        throw new Error(`Campaign ${args.campaign_id} not found`);
      }

      const payload = serialize(campaign);

      const created = await tx.snapshot.create({
        data: {
          campaignId: args.campaign_id,
          label: args.label ?? null,
          payload
        }
      });

      const logSummary = makeSummary(
        "Snapshot created",
        campaign.title,
        args.label ?? "auto"
      );

      await tx.eventLog.create({
        data: {
          campaignId: campaign.id,
          type: "state.snapshot",
          summary: logSummary,
          payload: {
            snapshot_id: created.id,
            label: created.label
          } as Prisma.JsonValue
        }
      });

      return { snapshot: created, summary: logSummary };
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
              snapshot_id: snapshot.id,
              label: snapshot.label
            },
            null,
            2
          )
        }
      ]
    };
  });

  server.tool("state.restore", restoreSchema, async (args) => {
    const snapshot = await prisma.snapshot.findUnique({
      where: { id: args.snapshot_id },
      include: {
        campaign: {
          select: {
            title: true
          }
        }
      }
    });

    if (!snapshot) {
      throw new Error(`Snapshot ${args.snapshot_id} not found`);
    }

    const preview = {
      snapshot_id: snapshot.id,
      label: snapshot.label,
      campaign_id: snapshot.campaignId,
      campaign_title: snapshot.campaign?.title ?? "unknown",
      created_at: snapshot.createdAt
    };

    return {
      content: [
        {
          type: "text",
          text: makeSummary(
            "Snapshot loaded",
            preview.campaign_title,
            `snapshot ${snapshot.id}`
          )
        },
        {
          type: "text",
          text: JSON.stringify(
            {
              ok: true,
              preview,
              note: "Snapshot restore is read-only in this demo – apply manually as needed."
            },
            null,
            2
          )
        }
      ]
    };
  });

  server.tool("export.session_log", exportSchema, async (args) => {
    const events = await prisma.eventLog.findMany({
      where: { campaignId: args.campaign_id },
      orderBy: { createdAt: "asc" }
    });

    if (args.format === "json") {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                events: events.map((event) => ({
                  id: event.id,
                  type: event.type,
                  summary: event.summary,
                  created_at: event.createdAt,
                  payload: event.payload ?? null
                }))
              },
              null,
              2
            )
          }
        ]
      };
    }

    const markdown = [
      `# Session Log`,
      ``,
      ...events.map(
        (event) =>
          `- ${event.createdAt.toISOString()} [${event.type}] ${event.summary}`
      )
    ].join("\n");

    return {
      content: [
        {
          type: "text",
          text: markdown
        }
      ]
    };
  });
}
