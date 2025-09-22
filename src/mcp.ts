import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { registerDiceTool } from "./tools/dice.js";
import { registerCampaignTools } from "./tools/campaign.js";
import { registerWorldTools } from "./tools/world.js";
import { registerEncounterTools } from "./tools/encounter.js";
import { registerCombatTools } from "./tools/combat.js";
import { registerStateTools } from "./tools/state.js";
import { registerResources } from "./resources/resources.js";

const VERSION = "0.1.0";

export async function createMcpServer(): Promise<McpServer> {
  const server = new McpServer(
    {
      name: "mcp-dm-server",
      version: VERSION
    },
    {
      instructions:
        "Model Context Protocol DM Server. Use the dice, campaign, world, encounter, combat, and state tools to manage games. Fetch prompts and resources for guidance.",
      capabilities: {
        tools: {
          listChanged: true
        },
        prompts: {
          listChanged: true
        },
        resources: {
          listChanged: true
        }
      }
    }
  );

  registerDiceTool(server);
  registerCampaignTools(server);
  registerWorldTools(server);
  registerEncounterTools(server);
  registerCombatTools(server);
  registerStateTools(server);
  registerResources(server);

  server.prompt("dm_style_guide", async () => ({
    description: "Baseline AI Dungeon Master style reminders.",
    messages: [
      {
        role: "assistant",
        content: {
          type: "text",
          text: [
            "You are an evocative but concise AI Dungeon Master.",
            "Maintain continuity with the campaign canon supplied by the tools.",
            "Blend cinematic description with clear tactical options and consequences.",
            "Offer at least two actionable player choices or prompt for clarification.",
            "Balance pacing: spotlight all players, escalate stakes steadily."
          ].join("\n")
        }
      }
    ]
  }));

  return server;
}
