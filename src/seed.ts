import { prisma } from "./db.js";

async function main() {
  const existing = await prisma.campaign.findFirst({
    where: { title: "Demo Campaign" }
  });

  if (existing) {
    console.log("Demo campaign already exists – skipping seed.");
    return;
  }

  const campaign = await prisma.campaign.create({
    data: {
      title: "Demo Campaign",
      system: "5e",
      premise: "A frontier town besieged by planar anomalies.",
      tone: "Hopeful sword-and-sorcery",
      sessionZero:
        "Lines: torture, harm to children. Veils: body horror. Goals: collaborative heroic fantasy."
    }
  });

  await prisma.location.create({
    data: {
      campaignId: campaign.id,
      name: "Glimmerford",
      kind: "Town",
      description: "A trade outpost perched on the edge of the Silver Mire.",
      tags: ["trade", "planar anomaly"]
    }
  });

  await prisma.npc.create({
    data: {
      campaignId: campaign.id,
      name: "Captain Elira Thorn",
      role: "Town Guard Captain",
      disposition: "Wary ally",
      biography:
        "Elira commands the Glimmerford guard with iron discipline and harbors a secret pact with the Mire spirits."
    }
  });

  await prisma.quest.create({
    data: {
      campaignId: campaign.id,
      title: "Seal the Rift",
      status: "open",
      summary: "Locate the arcane keystones required to stabilize the Silver Mire rift."
    }
  });

  console.log(`Seeded campaign ${campaign.id}`);
}

main()
  .catch((err) => {
    console.error("Seed failed", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
