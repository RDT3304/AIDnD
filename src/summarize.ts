export function makeSummary(action: string, detail: string, extra?: string): string {
  const base = `${action}: ${detail}`;
  return extra ? `${base} – ${extra}` : base;
}

export function formatCounts(counts: Record<string, number>): string {
  return Object.entries(counts)
    .map(([key, value]) => `${key}:${value}`)
    .join(", ");
}

export function summarizeRoster(roster: Array<{ name: string; side: string }>): string {
  if (!roster.length) {
    return "empty roster";
  }

  const grouped = roster.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.side] = (acc[entry.side] ?? 0) + 1;
    return acc;
  }, {});
  const sides = Object.entries(grouped)
    .map(([side, qty]) => `${qty} ${side}`)
    .join(", ");
  return `${roster.length} combatants (${sides})`;
}

export function summarizeTableRoll(
  tableName: string,
  roll: number,
  result: unknown
): string {
  const rendered =
    typeof result === "string" ? result : JSON.stringify(result);
  return `Rolled ${tableName}: ${roll} → ${rendered}`;
}
