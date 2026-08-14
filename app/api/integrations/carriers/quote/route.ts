import { quoteCarrierRates } from "../../../../../db/carriers";
import { getAuthenticatedUser } from "../../../../auth";

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return Response.json({ error: "Connexion requise." }, { status: 401 });
  const city = new URL(request.url).searchParams.get("city")?.trim() || "";
  if (!city || city.length > 100) return Response.json({ error: "Ville de destination invalide." }, { status: 400 });
  try {
    return Response.json(await quoteCarrierRates(city), {
      headers: { "cache-control": "private, max-age=300", "x-content-type-options": "nosniff" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Comparaison indisponible.";
    return Response.json({ error: message }, { status: 502 });
  }
}
