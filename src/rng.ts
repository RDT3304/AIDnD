import seedrandom from "seedrandom";
import { randomUUID } from "node:crypto";

export type AdvantageMode = "normal" | "adv" | "dis";

export type RollOptions = {
  notation: string;
  advantage?: AdvantageMode;
  explode?: boolean;
  seed?: string;
};

export type RollResult = {
  rolls: number[];
  total: number;
  text: string;
  seed: string;
};

const tokenPattern = /[+-]?[^+-]+/g;

class DiceNotationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiceNotationError";
  }
}

function rollWithExplosion(
  rng: seedrandom.prng,
  sides: number,
  explode: boolean
): { total: number; detail: number[] } {
  const detail: number[] = [];
  let roll = Math.floor(rng() * sides) + 1;
  detail.push(roll);
  let total = roll;

  if (explode) {
    while (roll === sides) {
      roll = Math.floor(rng() * sides) + 1;
      detail.push(roll);
      total += roll;
    }
  }

  return { total, detail };
}

function parseDiceToken(token: string) {
  const match = token.toLowerCase().match(/^([+-]?)(\d*)d(\d+)$/);
  if (!match) {
    throw new DiceNotationError(`Unsupported dice token "${token}"`);
  }

  const sign = match[1] === "-" ? -1 : 1;
  const count = match[2] ? parseInt(match[2], 10) : 1;
  const sides = parseInt(match[3], 10);

  if (count <= 0 || sides <= 0) {
    throw new DiceNotationError(`Dice token "${token}" must have positive count and sides`);
  }

  return { sign, count, sides };
}

export function rollDice(options: RollOptions): RollResult {
  const advantage = options.advantage ?? "normal";
  const explode = options.explode ?? false;
  const rawNotation = options.notation.trim();
  if (!rawNotation) {
    throw new DiceNotationError("Dice notation cannot be empty");
  }

  const compact = rawNotation.replace(/\s+/g, "");
  const tokens = compact.match(tokenPattern);
  if (!tokens || tokens.length === 0) {
    throw new DiceNotationError(`Unable to parse dice notation "${rawNotation}"`);
  }

  const seed = options.seed ?? randomUUID();
  const rng = seedrandom(seed);

  const diceTokens = tokens.filter((token) => token.toLowerCase().includes("d"));
  const modifierTokens = tokens.filter((token) => !token.toLowerCase().includes("d"));

  let total = 0;
  const rolls: number[] = [];
  const breakdown: string[] = [];
  let advantageHandled = false;
  let advantageNote: string | undefined;

  for (const token of diceTokens) {
    const { sign, count, sides } = parseDiceToken(token);

    const qualifiesForAdvantage =
      advantage !== "normal" && diceTokens.length === 1 && count === 1 && sides === 20;

    if (qualifiesForAdvantage && !advantageHandled) {
      const first = rollWithExplosion(rng, sides, explode);
      const second = rollWithExplosion(rng, sides, explode);
      const picked =
        advantage === "adv"
          ? Math.max(first.total, second.total)
          : Math.min(first.total, second.total);

      const contribution = sign * picked;
      total += contribution;
      rolls.push(sign * first.total, sign * second.total);
      breakdown.push(
        `${sign < 0 ? "-" : ""}1d${sides}(${advantage}) => [${first.total}, ${second.total}] → ${contribution}`
      );
      advantageNote = `Advantage applied (${advantage}); selected ${picked}`;
      advantageHandled = true;
      continue;
    }

    const termRolls: number[] = [];
    for (let i = 0; i < count; i += 1) {
      const result = rollWithExplosion(rng, sides, explode);
      termRolls.push(result.total);
      rolls.push(sign * result.total);
      total += sign * result.total;
    }

    const signPrefix = sign < 0 ? "-" : "+";
    breakdown.push(`${signPrefix}${count}d${sides} => ${termRolls.join(sign < 0 ? ", -" : ", ")}`);
  }

  for (const token of modifierTokens) {
    const value = parseInt(token, 10);
    if (Number.isNaN(value)) {
      throw new DiceNotationError(`Unsupported modifier token "${token}"`);
    }
    total += value;
    rolls.push(value);
    breakdown.push(`${value >= 0 ? "+" : ""}${value}`);
  }

  const summaryParts = [`Roll ${rawNotation}`];
  if (explode) {
    summaryParts.push("exploding");
  }
  if (advantageNote) {
    summaryParts.push(advantageNote);
  }

  const text = `${summaryParts.join(" ")} → ${total} [${breakdown.join("; ")}]`;

  return {
    rolls,
    total,
    text,
    seed
  };
}
