import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import { rollDice } from "../rng.js";

export function registerDiceTool(server: McpServer): void {
  const schema = z.object({
    notation: z.string().min(1, "Provide a dice notation such as 2d6+3"),
    advantage: z.enum(["normal", "adv", "dis"]).optional(),
    explode: z.boolean().optional(),
    seed: z.string().optional()
  });

  server.tool("dice.roll", schema, async (args) => {
    const result = rollDice(args);
    const body = {
      rolls: result.rolls,
      total: result.total,
      text: result.text,
      seed: result.seed
    };

    return {
      content: [
        {
          type: "text",
          text: `${result.text} (seed: ${result.seed})`
        },
        {
          type: "text",
          text: JSON.stringify(body, null, 2)
        }
      ]
    };
  });
}
