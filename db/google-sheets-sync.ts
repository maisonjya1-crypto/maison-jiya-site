export type GoogleSheetsSyncState = {
  status: "pending" | "processing" | "retrying" | "synced" | "unconfigured";
  currentVersion: number;
  syncedVersion: number;
  pendingChanges: number;
  attemptCount: number;
  lastEventAt: string | null;
  lastAttemptAt: string | null;
  lastSyncAt: string | null;
  nextAttemptAt: string | null;
  lastError: string;
};

export type GoogleSheetsSyncLog = {
  id: number;
  eventId: string;
  version: number;
  status: "processing" | "retrying" | "synced" | "covered";
  attemptCount: number;
  httpStatus: number | null;
  firstAttemptAt: string;
  lastAttemptAt: string;
  syncedAt: string | null;
  nextAttemptAt: string | null;
  lastError: string;
};

const CORE_SYNC_TABLES = [
  "users",
  "customers",
  "orders",
  "products",
  "stock_movements",
  "inventory_counts",
  "purchases",
  "expenses",
  "ad_performance",
  "capital_ledger",
  "order_status_history",
  "carrier_events",
] as const;

const STOREFRONT_SYNC_TABLES = [
  "storefront_product_settings",
  "storefront_offers",
  "storefront_offer_items",
  "storefront_media",
] as const;

let schemaReady: Promise<void> | null = null;
let storefrontTriggersReady: Promise<void> | null = null;

const syncStateUpsert = `
  INSERT INTO google_sheets_sync_state (
    id, current_version, synced_version, status, last_event_at, next_attempt_at, updated_at
  ) VALUES (1, 1, 0, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  ON CONFLICT(id) DO UPDATE SET
    current_version = google_sheets_sync_state.current_version + 1,
    status = CASE
      WHEN google_sheets_sync_state.status = 'processing' THEN 'processing'
      ELSE 'pending'
    END,
    last_event_at = CURRENT_TIMESTAMP,
    next_attempt_at = CASE
      WHEN google_sheets_sync_state.status = 'retrying'
        AND datetime(google_sheets_sync_state.next_attempt_at) > datetime('now')
      THEN google_sheets_sync_state.next_attempt_at
      ELSE CURRENT_TIMESTAMP
    END,
    updated_at = CURRENT_TIMESTAMP
`;

function triggerName(table: string, operation: string) {
  return `google_sheets_sync_${table}_${operation}`;
}

function tableTriggerStatements(database: D1Database, table: string, condition = "") {
  return ["insert", "update", "delete"].map((operation) => database.prepare(`
    CREATE TRIGGER IF NOT EXISTS ${triggerName(table, operation)}
    AFTER ${operation.toUpperCase()} ON ${table}
    ${condition ? `WHEN ${condition.replaceAll("ROW", operation === "delete" ? "OLD" : "NEW")}` : ""}
    BEGIN
      ${syncStateUpsert};
    END
  `));
}

async function initializeGoogleSheetsSyncSchema(database: D1Database) {
  await database.batch([
    database.prepare(`
      CREATE TABLE IF NOT EXISTS google_sheets_sync_state (
        id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
        current_version INTEGER DEFAULT 0 NOT NULL,
        synced_version INTEGER DEFAULT 0 NOT NULL,
        status TEXT DEFAULT 'pending' NOT NULL,
        attempt_count INTEGER DEFAULT 0 NOT NULL,
        last_event_at TEXT,
        last_attempt_at TEXT,
        last_sync_at TEXT,
        next_attempt_at TEXT,
        last_error TEXT DEFAULT '' NOT NULL,
        active_event_id TEXT DEFAULT '' NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `),
    database.prepare(`
      CREATE TABLE IF NOT EXISTS google_sheets_sync_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        event_id TEXT NOT NULL UNIQUE,
        version INTEGER NOT NULL,
        status TEXT NOT NULL,
        attempt_count INTEGER DEFAULT 0 NOT NULL,
        http_status INTEGER,
        first_attempt_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        last_attempt_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        synced_at TEXT,
        next_attempt_at TEXT,
        last_error TEXT DEFAULT '' NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `),
    database.prepare("CREATE INDEX IF NOT EXISTS google_sheets_sync_log_version_idx ON google_sheets_sync_log (version)"),
    database.prepare("CREATE INDEX IF NOT EXISTS google_sheets_sync_log_status_idx ON google_sheets_sync_log (status, next_attempt_at)"),
  ]);

  await database.prepare(`
    INSERT INTO google_sheets_sync_state (
      id, current_version, synced_version, status, last_event_at, next_attempt_at, updated_at
    ) VALUES (1, 1, 0, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO NOTHING
  `).run();

  await database.batch([
    ...CORE_SYNC_TABLES.flatMap((table) => tableTriggerStatements(database, table)),
    ...tableTriggerStatements(
      database,
      "settings",
      "ROW.key NOT LIKE 'security_%' AND ROW.key <> 'backup_webhook_url'",
    ),
  ]);
}

export async function ensureGoogleSheetsSyncSchema(database: D1Database) {
  if (!schemaReady) schemaReady = initializeGoogleSheetsSyncSchema(database);
  try {
    await schemaReady;
  } catch (error) {
    schemaReady = null;
    throw error;
  }
}

export async function ensureStorefrontGoogleSheetsSyncTriggers(database: D1Database) {
  await ensureGoogleSheetsSyncSchema(database);
  if (!storefrontTriggersReady) {
    storefrontTriggersReady = database.batch(STOREFRONT_SYNC_TABLES.flatMap((table) => tableTriggerStatements(database, table))).then(() => undefined);
  }
  try {
    await storefrontTriggersReady;
  } catch (error) {
    storefrontTriggersReady = null;
    throw error;
  }
}

export async function markGoogleSheetsSyncPending(database: D1Database) {
  await ensureGoogleSheetsSyncSchema(database);
  await database.prepare(syncStateUpsert).run();
}

function validWebhook(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname === "script.google.com"
      && /^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname)
      && !url.search
      && !url.hash;
  } catch {
    return false;
  }
}

function retryDelaySeconds(attempt: number) {
  return Math.min(21_600, 15 * (2 ** Math.min(Math.max(attempt - 1, 0), 10)));
}

function retryAt(attempt: number) {
  return new Date(Date.now() + retryDelaySeconds(attempt) * 1000).toISOString();
}

function safeError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/https?:\/\/\S+/gi, "[adresse masquée]")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 500);
}

type RawSyncState = {
  currentVersion: number;
  syncedVersion: number;
  status: string;
  attemptCount: number;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
};

async function rawState(database: D1Database) {
  return database.prepare(`
    SELECT
      current_version AS currentVersion,
      synced_version AS syncedVersion,
      status,
      attempt_count AS attemptCount,
      last_attempt_at AS lastAttemptAt,
      next_attempt_at AS nextAttemptAt
    FROM google_sheets_sync_state
    WHERE id = 1
  `).first<RawSyncState>();
}

async function syncConfiguration(database: D1Database) {
  return database.prepare(`
    SELECT
      MAX(CASE WHEN key = 'security_backup_webhook_url' THEN value END) AS webhookUrl,
      MAX(CASE WHEN key = 'security_backup_token_hash' THEN value END) AS tokenHash
    FROM settings
    WHERE key IN ('security_backup_webhook_url', 'security_backup_token_hash')
  `).first<{ webhookUrl: string | null; tokenHash: string | null }>();
}

export async function processGoogleSheetsSyncQueue(database: D1Database, options: { force?: boolean } = {}) {
  await ensureGoogleSheetsSyncSchema(database);
  const state = await rawState(database);
  const configuration = await syncConfiguration(database);
  if (!configuration?.webhookUrl || !validWebhook(configuration.webhookUrl) || !/^[a-f0-9]{64}$/i.test(configuration.tokenHash || "")) {
    await database.prepare(`
      UPDATE google_sheets_sync_state
      SET status = 'unconfigured', active_event_id = '', next_attempt_at = NULL,
          last_error = '', updated_at = CURRENT_TIMESTAMP
      WHERE id = 1 AND status <> 'processing'
    `).run();
    return { status: "unconfigured" as const };
  }
  if (!state || state.currentVersion <= state.syncedVersion) {
    await database.prepare(`
      UPDATE google_sheets_sync_state
      SET status = 'synced', attempt_count = 0, next_attempt_at = NULL,
          last_error = '', active_event_id = '', updated_at = CURRENT_TIMESTAMP
      WHERE id = 1 AND status <> 'processing'
    `).run();
    return { status: "synced" as const };
  }

  const force = options.force ? 1 : 0;
  const targetVersion = state.currentVersion;
  const eventId = `maison-jiya-google-sheets-v${targetVersion}`;
  const attempt = state.attemptCount + 1;
  const now = new Date().toISOString();

  const claim = await database.prepare(`
    UPDATE google_sheets_sync_state
    SET status = 'processing', attempt_count = attempt_count + 1,
        last_attempt_at = ?, active_event_id = ?, last_error = '', updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
      AND current_version = ?
      AND current_version > synced_version
      AND (? = 1 OR next_attempt_at IS NULL OR datetime(next_attempt_at) <= datetime('now'))
      AND (
        status <> 'processing'
        OR last_attempt_at IS NULL
        OR datetime(last_attempt_at) <= datetime('now', '-2 minutes')
      )
  `).bind(now, eventId, targetVersion, force).run();
  if (!claim.meta.changes) return { status: "deferred" as const };

  await database.prepare(`
    INSERT INTO google_sheets_sync_log (
      event_id, version, status, attempt_count, first_attempt_at, last_attempt_at, created_at, updated_at
    ) VALUES (?, ?, 'processing', 1, ?, ?, ?, ?)
    ON CONFLICT(event_id) DO UPDATE SET
      status = 'processing',
      attempt_count = google_sheets_sync_log.attempt_count + 1,
      last_attempt_at = excluded.last_attempt_at,
      next_attempt_at = NULL,
      last_error = '',
      updated_at = excluded.updated_at
  `).bind(eventId, targetVersion, now, now, now, now).run();

  let responseStatus: number | null = null;
  try {
    const response = await fetch(configuration.webhookUrl, {
      method: "POST",
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
      headers: {
        "content-type": "application/json; charset=utf-8",
        "user-agent": "Maison-Jiya-Sync/2.0",
        "x-idempotency-key": eventId,
        "x-maison-jiya-event-id": eventId,
        "x-maison-jiya-version": String(targetVersion),
      },
      body: JSON.stringify({
        source: "maison-jiya",
        event_id: eventId,
        version: targetVersion,
        mode: "full-snapshot",
        occurred_at: now,
      }),
    });
    responseStatus = response.status;
    const responseHost = new URL(response.url).hostname;
    if (
      response.status < 200
      || response.status >= 300
      || !["script.google.com", "script.googleusercontent.com"].includes(responseHost)
    ) throw new Error(`Google Apps Script a répondu HTTP ${response.status}.`);

    const syncedAt = new Date().toISOString();
    await database.batch([
      database.prepare(`
        UPDATE google_sheets_sync_state
        SET synced_version = CASE WHEN synced_version < ? THEN ? ELSE synced_version END,
            status = CASE WHEN current_version > ? THEN 'pending' ELSE 'synced' END,
            attempt_count = 0,
            last_sync_at = ?,
            next_attempt_at = CASE WHEN current_version > ? THEN CURRENT_TIMESTAMP ELSE NULL END,
            last_error = '', active_event_id = '', updated_at = CURRENT_TIMESTAMP
        WHERE id = 1 AND active_event_id = ?
      `).bind(targetVersion, targetVersion, targetVersion, syncedAt, targetVersion, eventId),
      database.prepare(`
        UPDATE google_sheets_sync_log
        SET status = 'covered', synced_at = ?, next_attempt_at = NULL,
            last_error = '', updated_at = ?
        WHERE version < ? AND status IN ('processing', 'retrying')
      `).bind(syncedAt, syncedAt, targetVersion),
      database.prepare(`
        UPDATE google_sheets_sync_log
        SET status = 'synced', http_status = ?, synced_at = ?, next_attempt_at = NULL,
            last_error = '', updated_at = ?
        WHERE event_id = ?
      `).bind(response.status, syncedAt, syncedAt, eventId),
    ]);
    return { status: "synced" as const, eventId, version: targetVersion };
  } catch (error) {
    const message = safeError(error);
    const nextAttemptAt = retryAt(attempt);
    await database.batch([
      database.prepare(`
        UPDATE google_sheets_sync_state
        SET status = 'retrying', next_attempt_at = ?, last_error = ?,
            active_event_id = '', updated_at = CURRENT_TIMESTAMP
        WHERE id = 1 AND active_event_id = ?
      `).bind(nextAttemptAt, message, eventId),
      database.prepare(`
        UPDATE google_sheets_sync_log
        SET status = 'retrying', http_status = ?, next_attempt_at = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP
        WHERE event_id = ?
      `).bind(responseStatus, nextAttemptAt, message, eventId),
    ]);
    console.error("Maison Jiya Google Sheets sync deferred", { eventId, version: targetVersion, message });
    return { status: "retrying" as const, eventId, version: targetVersion, nextAttemptAt };
  }
}

export async function getGoogleSheetsSyncSnapshot(database: D1Database, logLimit = 20) {
  await ensureGoogleSheetsSyncSchema(database);
  const [state, logs] = await Promise.all([
    database.prepare(`
      SELECT
        status,
        current_version AS currentVersion,
        synced_version AS syncedVersion,
        current_version - synced_version AS pendingChanges,
        attempt_count AS attemptCount,
        last_event_at AS lastEventAt,
        last_attempt_at AS lastAttemptAt,
        last_sync_at AS lastSyncAt,
        next_attempt_at AS nextAttemptAt,
        last_error AS lastError
      FROM google_sheets_sync_state
      WHERE id = 1
    `).first<GoogleSheetsSyncState>(),
    database.prepare(`
      SELECT
        id,
        event_id AS eventId,
        version,
        status,
        attempt_count AS attemptCount,
        http_status AS httpStatus,
        first_attempt_at AS firstAttemptAt,
        last_attempt_at AS lastAttemptAt,
        synced_at AS syncedAt,
        next_attempt_at AS nextAttemptAt,
        last_error AS lastError
      FROM google_sheets_sync_log
      ORDER BY id DESC
      LIMIT ?
    `).bind(Math.max(1, Math.min(logLimit, 100))).all<GoogleSheetsSyncLog>(),
  ]);
  return {
    state: state || {
      status: "pending",
      currentVersion: 0,
      syncedVersion: 0,
      pendingChanges: 0,
      attemptCount: 0,
      lastEventAt: null,
      lastAttemptAt: null,
      lastSyncAt: null,
      nextAttemptAt: null,
      lastError: "",
    },
    logs: logs.results,
  };
}
