export type AllocationPolicy = {
  reinvestment: number;
  salary: number;
  emergency: number;
};

export const DEFAULT_ALLOCATION_POLICY: AllocationPolicy = {
  reinvestment: 50,
  salary: 30,
  emergency: 20,
};

function boundedPercent(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

export function allocationPolicyFromSettings(settings: Record<string, string | number | null | undefined>): AllocationPolicy {
  const candidate = {
    reinvestment: boundedPercent(settings.reinvestment_allocation, DEFAULT_ALLOCATION_POLICY.reinvestment),
    salary: boundedPercent(settings.salary_allocation, DEFAULT_ALLOCATION_POLICY.salary),
    emergency: boundedPercent(settings.emergency_allocation, DEFAULT_ALLOCATION_POLICY.emergency),
  };
  const total = candidate.reinvestment + candidate.salary + candidate.emergency;
  return total === 100 ? candidate : DEFAULT_ALLOCATION_POLICY;
}

export function allocationAmounts(contribution: number, policy: AllocationPolicy) {
  const safeContribution = Math.max(0, Math.round(Number(contribution || 0) * 100) / 100);
  const reinvestment = Math.floor(safeContribution * policy.reinvestment) / 100;
  const salary = Math.floor(safeContribution * policy.salary) / 100;
  const emergency = Math.round((safeContribution - reinvestment - salary) * 100) / 100;
  return { reinvestment, salary, emergency };
}
