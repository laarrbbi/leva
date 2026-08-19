/** Shape every server action returns, consumed by `useActionState` in forms. */
export interface ActionState {
  status: 'idle' | 'success' | 'error';
  message?: string;
  /** Field-level messages, keyed by form field name. */
  fieldErrors?: Record<string, string>;
}

export const IDLE: ActionState = { status: 'idle' };

export function ok(message: string): ActionState {
  return { status: 'success', message };
}

export function fail(message: string, fieldErrors?: Record<string, string>): ActionState {
  return { status: 'error', message, fieldErrors };
}

/** Flattens a Zod issue list into `{ fieldName: firstMessage }`. */
export function toFieldErrors(
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? '_');
    errors[key] ??= issue.message;
  }
  return errors;
}
