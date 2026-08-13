import { createSession, createUser, destroySession, getAuthenticatedUser, sessionCookie, usersExist, verifyLogin } from "../../auth";

type AuthPayload = { action?: string; username?: string; displayName?: string; password?: string; confirmation?: string };

function message(error: unknown) {
  return error instanceof Error ? error.message : "Une erreur est survenue.";
}

function hasValidOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export async function GET(request: Request) {
  try {
    const [configured, user] = await Promise.all([usersExist(), getAuthenticatedUser(request)]);
    return Response.json({ configured, user });
  } catch (error) {
    console.error("Maison Jiya auth status failed", error);
    return Response.json({ error: "La connexion est momentanément indisponible." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!hasValidOrigin(request)) return Response.json({ error: "Origine de la requête refusée." }, { status: 403 });
    const payload = (await request.json()) as AuthPayload;
    if (payload.action === "logout") {
      await destroySession(request);
      return Response.json({ ok: true }, { headers: { "set-cookie": sessionCookie("", 0) } });
    }

    if (payload.action === "bootstrap") {
      if (await usersExist()) return Response.json({ error: "Le compte principal est déjà configuré." }, { status: 409 });
      if (payload.password !== payload.confirmation) return Response.json({ error: "Les deux mots de passe ne correspondent pas." }, { status: 400 });
      const user = await createUser({
        username: payload.username || "Maison Jiya",
        displayName: payload.displayName || "Maison Jiya",
        password: payload.password || "",
        role: "admin",
      });
      const session = await createSession(user.id);
      return Response.json({ configured: true, user }, { headers: { "set-cookie": sessionCookie(session.token) } });
    }

    if (payload.action === "login") {
      const user = await verifyLogin(payload.username || "", payload.password || "");
      const session = await createSession(user.id);
      return Response.json({ configured: true, user }, { headers: { "set-cookie": sessionCookie(session.token) } });
    }

    return Response.json({ error: "Action inconnue." }, { status: 400 });
  } catch (error) {
    const errorMessage = message(error);
    const status = errorMessage.startsWith("Trop d’essais") ? 429 : 400;
    return Response.json({ error: errorMessage }, { status });
  }
}
