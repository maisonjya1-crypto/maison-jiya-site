import { getAuthenticatedUser } from "../../../auth";
import { getRawDb } from "../../../../db";
import { ensurePlatformUpgrades } from "../../../../db/platform-upgrades";

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return Response.json({ error: "Connexion requise." }, { status: 401 });

  try {
    const result = await ensurePlatformUpgrades(await getRawDb());
    return Response.json({ ok: true, identityRestored: result.identityRestored });
  } catch (error) {
    console.error("Maison Jiya platform bootstrap failed", error);
    return Response.json({ error: "Initialisation de la plateforme impossible." }, { status: 500 });
  }
}
