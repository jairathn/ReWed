export type Urgency = 'fresh' | 'yellow' | 'orange' | 'red';

/**
 * Map an open to-do's age (in days) to a visual urgency band.
 * 30 / 45 / 60 day thresholds match the dashboard color spec.
 */
export function urgencyForAge(ageDays: number): Urgency {
  if (ageDays >= 60) return 'red';
  if (ageDays >= 45) return 'orange';
  if (ageDays >= 30) return 'yellow';
  return 'fresh';
}

export function ageInDays(createdAt: string | Date): number {
  const ts = typeof createdAt === 'string' ? new Date(createdAt).getTime() : createdAt.getTime();
  return Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
}

export function annotate<T extends { created_at: string | Date; status: string }>(
  todo: T
): T & { age_days: number; urgency: Urgency } {
  const age = ageInDays(todo.created_at);
  return {
    ...todo,
    age_days: age,
    urgency: todo.status === 'open' ? urgencyForAge(age) : 'fresh',
  };
}
