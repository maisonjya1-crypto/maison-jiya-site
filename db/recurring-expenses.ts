import { businessDateKey } from "../lib/accounting-dates";

export type RecurringExpenseSchedule = {
  id: number;
  category: string;
  label: string;
  amount: number;
  account: string;
  dayOfMonth: number;
  startDate: string;
  endDate: string | null;
  note: string;
  isActive: number | boolean;
  createdAt: string;
};

function monthKeyFromDate(value: string) {
  return value.slice(0, 7);
}

function addMonths(monthKey: string, delta: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1, 12));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function recurringOccurrenceDate(monthKey: string, requestedDay: number) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) throw new Error("Mois récurrent invalide.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error("Mois récurrent invalide.");
  const safeDay = Math.max(1, Math.min(31, Math.round(requestedDay)));
  const lastDay = new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
  return `${monthKey}-${String(Math.min(safeDay, lastDay)).padStart(2, "0")}`;
}

function isoDatePlusDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function recurringOccurrenceDates(
  schedule: Pick<RecurringExpenseSchedule, "startDate" | "endDate" | "dayOfMonth" | "isActive" | "createdAt">,
  today: string,
  horizonDays = 60,
) {
  if (!schedule.isActive) return [];
  const createdDate = businessDateKey(schedule.createdAt);
  const lowerBound = [schedule.startDate, createdDate].sort().reverse()[0];
  const horizon = isoDatePlusDays(today, horizonDays);
  const firstMonth = monthKeyFromDate(lowerBound);
  const lastMonth = monthKeyFromDate(horizon);
  const result: Array<{ period: string; expenseDate: string }> = [];

  for (let offset = 0; offset < 240; offset += 1) {
    const period = addMonths(firstMonth, offset);
    if (period > lastMonth) break;
    const expenseDate = recurringOccurrenceDate(period, schedule.dayOfMonth);
    if (expenseDate < lowerBound || expenseDate > horizon) continue;
    if (schedule.endDate && expenseDate > schedule.endDate) continue;
    result.push({ period, expenseDate });
  }
  return result;
}

export async function ensureRecurringExpenseOccurrences(database: D1Database, today = businessDateKey(new Date()), horizonDays = 60) {
  const schedules = (await database.prepare(`
    SELECT
      id, category, label, amount, account,
      day_of_month AS dayOfMonth,
      start_date AS startDate,
      end_date AS endDate,
      note, is_active AS isActive,
      created_at AS createdAt
    FROM recurring_expenses
    WHERE is_active = 1
  `).all<RecurringExpenseSchedule>()).results;

  const statements = [] as ReturnType<typeof database.prepare>[];
  for (const schedule of schedules) {
    for (const occurrence of recurringOccurrenceDates(schedule, today, horizonDays)) {
      statements.push(database.prepare(`
        INSERT OR IGNORE INTO expenses (
          category, label, amount, account,
          payment_status, paid_at, expense_date, note,
          recurring_expense_id, recurring_period, created_at
        ) VALUES (?, ?, ?, ?, 'À payer', NULL, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).bind(
        schedule.category,
        schedule.label,
        Number(schedule.amount || 0),
        schedule.account || "Banque",
        occurrence.expenseDate,
        schedule.note || "",
        schedule.id,
        occurrence.period,
      ));
    }
  }
  if (statements.length) await database.batch(statements);
  return statements.length;
}

export async function removeFutureRecurringOccurrences(database: D1Database, recurringExpenseId: number, today = businessDateKey(new Date())) {
  await database.prepare(`
    DELETE FROM expenses
    WHERE recurring_expense_id = ?
      AND expense_date >= ?
      AND payment_status <> 'Payé'
  `).bind(recurringExpenseId, today).run();
}
