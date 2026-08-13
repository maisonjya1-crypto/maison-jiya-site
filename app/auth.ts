import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { loginAttempts, userSessions, users } from "../db/schema";

export type AppUser = {
  id: number;
  username: string;
  displayName: string;
  role: "admin" | "editor" | "viewer";
};

export const SESSION_COOKIE = "mj_session";
const SESSION_SECONDS = 12 * 60 * 60;
const PASSWORD_ITERATIONS = 150_000;
const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

export function normalizeUsername(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("fr");
}

export function validatePassword(password: string) {
  return password.length >= 9 && password.length <= 128 && /[A-Za-zÀ-ÿ]/.test(password) && /\d/.test(password);
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

async function passwordHash(password: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const saltBuffer = salt.buffer instanceof ArrayBuffer
    ? salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength)
    : Uint8Array.from(salt).buffer;
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBuffer, iterations: PASSWORD_ITERATIONS },
    material,
    256,
  );
  return bytesToBase64Url(new Uint8Array(bits));
}

function constantTimeEqual(left: string, right: string) {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function cookieValue(request: Request, name: string) {
  const cookies = request.headers.get("cookie") || "";
  for (const part of cookies.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) return decodeURIComponent(rawValue.join("="));
  }
  return "";
}

export function sessionCookie(token: string, maxAge = SESSION_SECONDS) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export async function usersExist() {
  const db = await getDb();
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(users);
  return Number(row?.count || 0) > 0;
}

export async function createUser(input: { username: string; displayName: string; password: string; role: AppUser["role"] }) {
  const db = await getDb();
  const username = normalizeUsername(input.username);
  const displayName = input.displayName.trim().replace(/\s+/g, " ");
  if (username.length < 2 || username.length > 50 || displayName.length < 2 || displayName.length > 80) {
    throw new Error("Le nom d’utilisateur doit contenir entre 2 et 50 caractères.");
  }
  if (!validatePassword(input.password)) {
    throw new Error("Le mot de passe doit contenir au moins 9 caractères, une lettre et un chiffre.");
  }
  if (!["admin", "editor", "viewer"].includes(input.role)) throw new Error("Rôle invalide.");
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const hash = await passwordHash(input.password, salt);
  const [created] = await db.insert(users).values({
    username,
    displayName,
    role: input.role,
    passwordHash: hash,
    passwordSalt: bytesToBase64Url(salt),
    isActive: true,
  }).returning({ id: users.id, username: users.username, displayName: users.displayName, role: users.role });
  if (!created) throw new Error("Le compte n’a pas été créé.");
  return { ...created, role: created.role as AppUser["role"] };
}

export async function updateUserPassword(userId: number, password: string) {
  if (!validatePassword(password)) throw new Error("Le mot de passe doit contenir au moins 9 caractères, une lettre et un chiffre.");
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const hash = await passwordHash(password, salt);
  const db = await getDb();
  await db.update(users).set({ passwordHash: hash, passwordSalt: bytesToBase64Url(salt), updatedAt: new Date().toISOString() }).where(eq(users.id, userId));
  await db.delete(userSessions).where(eq(userSessions.userId, userId));
}

async function blockedUntil(username: string) {
  const db = await getDb();
  const [row] = await db.select().from(loginAttempts).where(eq(loginAttempts.username, username)).limit(1);
  if (!row?.blockedUntil) return 0;
  return new Date(row.blockedUntil).getTime();
}

async function recordFailure(username: string) {
  const db = await getDb();
  const [row] = await db.select().from(loginAttempts).where(eq(loginAttempts.username, username)).limit(1);
  const now = Date.now();
  const startedAt = row ? new Date(row.windowStartedAt).getTime() : now;
  const withinWindow = Number.isFinite(startedAt) && startedAt + ATTEMPT_WINDOW_MS > now;
  const count = withinWindow ? row!.attemptCount + 1 : 1;
  const windowStartedAt = new Date(withinWindow ? startedAt : now).toISOString();
  const nextBlock = count >= MAX_ATTEMPTS ? new Date(now + ATTEMPT_WINDOW_MS).toISOString() : null;
  await db.insert(loginAttempts).values({ username, attemptCount: count, windowStartedAt, blockedUntil: nextBlock })
    .onConflictDoUpdate({ target: loginAttempts.username, set: { attemptCount: count, windowStartedAt, blockedUntil: nextBlock } });
  return nextBlock ? new Date(nextBlock).getTime() : 0;
}

export async function verifyLogin(rawUsername: string, password: string) {
  const username = normalizeUsername(rawUsername);
  const currentBlock = await blockedUntil(username);
  if (currentBlock > Date.now()) {
    const minutes = Math.max(1, Math.ceil((currentBlock - Date.now()) / 60_000));
    throw new Error(`Trop d’essais. Réessayez dans ${minutes} minute(s).`);
  }
  const db = await getDb();
  const [row] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  let suppliedHash = "";
  if (row) {
    try {
      suppliedHash = await passwordHash(password, base64UrlToBytes(row.passwordSalt));
    } catch {
      suppliedHash = "";
    }
  } else {
    const dummySalt = new Uint8Array(16);
    await passwordHash(password, dummySalt);
  }
  if (!row || !row.isActive || !constantTimeEqual(suppliedHash, row.passwordHash)) {
    const newBlock = await recordFailure(username);
    throw new Error(newBlock > Date.now() ? "Trop d’essais incorrects. Accès bloqué pendant 15 minutes." : "Nom d’utilisateur ou mot de passe incorrect.");
  }
  await db.delete(loginAttempts).where(eq(loginAttempts.username, username));
  return { id: row.id, username: row.username, displayName: row.displayName, role: row.role as AppUser["role"] };
}

export async function createSession(userId: number) {
  const db = await getDb();
  const token = randomToken();
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
  await db.insert(userSessions).values({ userId, tokenHash, expiresAt });
  return { token, expiresAt };
}

export async function getAuthenticatedUser(request: Request): Promise<AppUser | null> {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const db = await getDb();
  const [row] = await db.select({
    sessionId: userSessions.id,
    expiresAt: userSessions.expiresAt,
    id: users.id,
    username: users.username,
    displayName: users.displayName,
    role: users.role,
    isActive: users.isActive,
  }).from(userSessions).innerJoin(users, eq(userSessions.userId, users.id)).where(eq(userSessions.tokenHash, tokenHash)).limit(1);
  if (!row || !row.isActive || new Date(row.expiresAt).getTime() <= Date.now()) {
    if (row) await db.delete(userSessions).where(eq(userSessions.id, row.sessionId));
    return null;
  }
  return { id: row.id, username: row.username, displayName: row.displayName, role: row.role as AppUser["role"] };
}

export async function destroySession(request: Request) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return;
  const db = await getDb();
  await db.delete(userSessions).where(eq(userSessions.tokenHash, await sha256(token)));
}
