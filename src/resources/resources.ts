import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { prisma } from "../db.js";

export function registerResources(server: McpServer): void {
  server.resource(
    "campaign_overview",
    "res://overview",
    {
      title: "Campaign overview",
      description: "Markdown summary of all campaigns with basic stats.",
      mimeType: "text/markdown"
    },
    async () => {
      const campaigns = await prisma.campaign.findMany({
        orderBy: { updatedAt: "desc" },
        include: {
          _count: {
            select: {
              locations: true,
              npcs: true,
              quests: true,
              encounters: true,
              combats: true
            }
          }
        }
      });

      const lines = campaigns.map((campaign) => {
        const counts = campaign._count;
        return [
          `## ${campaign.title}`,
          `System: ${campaign.system}`,
          campaign.premise ? `Premise: ${campaign.premise}` : "_No premise recorded._",
          `Counts: locations ${counts.locations}, NPCs ${counts.npcs}, quests ${counts.quests}, encounters ${counts.encounters}, combats ${counts.combats}`,
          ""
        ].join("\n");
      });

      const markdown =
        ["# Campaign Overview", ""].concat(lines.length ? lines : ["_No campaigns found._"]).join("\n");

      return {
        contents: [
          {
            type: "text",
            text: markdown
          }
        ]
      };
    }
  );

  const campaignTemplate = new ResourceTemplate("res://campaign/{id}", {
    list: async () => {
      const campaigns = await prisma.campaign.findMany({
        orderBy: { title: "asc" }
      });
      return {
        resources: campaigns.map((campaign) => ({
          name: `campaign.${campaign.id}`,
          title: campaign.title,
          uri: `res://campaign/${campaign.id}`,
          description: campaign.premise ?? "",
          mimeType: "text/markdown"
        }))
      };
    }
  });

  server.resource(
    "campaign_detail",
    campaignTemplate,
    {
      title: "Campaign detail",
      description: "Markdown snapshot of a specific campaign.",
      mimeType: "text/markdown"
    },
    async (_uri, variables) => {
      const rawId = variables["id"];
      const campaignId = Array.isArray(rawId) ? rawId[0] : rawId;
      if (!campaignId) {
        return {
          contents: [
            {
              type: "text",
              text: "Missing campaign id."
            }
          ]
        };
      }

      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        include: {
          locations: true,
          npcs: true,
          quests: true
        }
      });

      if (!campaign) {
        return {
          contents: [
            {
              type: "text",
              text: `Campaign ${campaignId} not found.`
            }
          ]
        };
      }

      const markdownLines = [
        `# ${campaign.title}`,
        ``,
        campaign.premise ?? "_No premise recorded._",
        ``,
        `## Locations`,
        ...(campaign.locations.length
          ? campaign.locations.map(
              (loc) => `- ${loc.name}${loc.kind ? ` (${loc.kind})` : ""}`
            )
          : ["_No locations recorded._"]),
        ``,
        `## NPCs`,
        ...(campaign.npcs.length
          ? campaign.npcs.map(
              (npc) => `- ${npc.name}${npc.role ? ` – ${npc.role}` : ""}`
            )
          : ["_No NPCs recorded._"]),
        ``,
        `## Quests`,
        ...(campaign.quests.length
          ? campaign.quests.map((quest) => `- ${quest.title} [${quest.status}]`)
          : ["_No quests recorded._"])
      ];

      return {
        contents: [
          {
            type: "text",
            text: markdownLines.join("\n")
          }
        ]
      };
    }
  );
}
