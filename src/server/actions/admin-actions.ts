'use server';

import { revalidatePath } from 'next/cache';

import { CSRF_FIELD, assertCsrf } from '@/server/auth/csrf';
import { recordAudit } from '@/server/repositories/audit';
import { upsertSettings } from '@/server/repositories/settings';
import { archiveStaff, createStaff, updateStaff } from '@/server/repositories/staff';
import {
  createSuggestion,
  deleteSuggestion,
  updateSuggestion,
} from '@/server/repositories/suggestions';
import { hashIp } from '@/server/security/hash';
import { RULES, consume } from '@/server/security/rate-limit';
import { getClientIp } from '@/server/security/request';
import {
  idSchema,
  settingsSchema,
  staffSchema,
  suggestionSchema,
} from '@/server/validation/schemas';
import type { ActiveSession } from '@/server/auth/session';

import { fail, ok, toFieldErrors, type ActionState } from './types';

/**
 * Common preamble for every authenticated mutation: prove the request is not
 * forged, then spend a rate-limit token. The limit is not about human speed —
 * it caps how much damage an automated script can do with a stolen session
 * cookie before anyone notices.
 */
async function beginMutation(
  formData: FormData,
): Promise<{ session: ActiveSession; ipHash: string | null } | ActionState> {
  let session: ActiveSession;
  try {
    session = await assertCsrf(formData.get(CSRF_FIELD)?.toString());
  } catch {
    return fail('Your session expired. Please sign in again.');
  }

  const ipHash = hashIp(await getClientIp());
  if (!consume(RULES.adminWrite, String(session.user.id)).allowed) {
    return fail('Too many changes at once. Please slow down.');
  }

  return { session, ipHash };
}

function isActionState(value: unknown): value is ActionState {
  return typeof value === 'object' && value !== null && 'status' in value;
}

// ---------------------------------------------------------------------------
// Store settings
// ---------------------------------------------------------------------------

export async function updateSettingsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const begun = await beginMutation(formData);
  if (isActionState(begun)) return begun;

  const parsed = settingsSchema.safeParse({
    slug: formData.get('slug'),
    storeName: formData.get('storeName'),
    welcomeHeadline: formData.get('welcomeHeadline'),
    welcomeSubline: formData.get('welcomeSubline'),
    thanksHeadline: formData.get('thanksHeadline'),
    thanksSubline: formData.get('thanksSubline'),
    googleReviewUrl: formData.get('googleReviewUrl'),
    googlePlaceId: formData.get('googlePlaceId'),
    askForStaffRating: formData.get('askForStaffRating'),
    askForWishes: formData.get('askForWishes'),
    askForComment: formData.get('askForComment'),
    pickupEnabled: formData.get('pickupEnabled'),
    pickupName: formData.get('pickupName'),
    pickupTagline: formData.get('pickupTagline'),
    pickupUrl: formData.get('pickupUrl'),
    pickupAcceptingOrders: formData.get('pickupAcceptingOrders'),
    pickupPrepMinutes: formData.get('pickupPrepMinutes'),
    pickupBayCount: formData.get('pickupBayCount'),
    pickupCurrency: formData.get('pickupCurrency'),
    pickupClosedMessage: formData.get('pickupClosedMessage'),
  });

  if (!parsed.success) {
    return fail('Please check the highlighted fields.', toFieldErrors(parsed.error.issues));
  }

  upsertSettings({
    ...parsed.data,
    googleReviewUrl: parsed.data.googleReviewUrl || null,
    googlePlaceId: parsed.data.googlePlaceId || null,
    pickupUrl: parsed.data.pickupUrl || null,
  });

  recordAudit({
    actorId: begun.session.user.id,
    actorEmail: begun.session.user.email,
    action: 'settings.updated',
    target: parsed.data.slug,
    // The Google URL is what a compromised admin would want to change, so it is
    // named explicitly in the trail rather than logged as "settings changed".
    // Both outbound links are named explicitly. They are what a compromised
    // admin would repoint, so "settings changed" would not be enough here.
    detail:
      `Google link: ${parsed.data.googleReviewUrl || 'not set'}; ` +
      `${parsed.data.pickupName || 'second platform'}: ` +
      `${parsed.data.pickupEnabled ? parsed.data.pickupUrl || 'not set' : 'off'}`,
    ipHash: begun.ipHash,
  });

  revalidatePath('/admin/settings');
  revalidatePath('/admin/tags');
  return ok('Saved.');
}

// ---------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------

export async function createStaffAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const begun = await beginMutation(formData);
  if (isActionState(begun)) return begun;

  const parsed = staffSchema.safeParse({
    name: formData.get('name'),
    accent: formData.get('accent'),
    isActive: 'true',
  });
  if (!parsed.success) {
    return fail('Please check the form.', toFieldErrors(parsed.error.issues));
  }

  const created = createStaff(parsed.data);

  recordAudit({
    actorId: begun.session.user.id,
    actorEmail: begun.session.user.email,
    action: 'staff.created',
    target: created.code,
    detail: created.name,
    ipHash: begun.ipHash,
  });

  revalidatePath('/admin/team');
  revalidatePath('/admin/tags');
  return ok(`${created.name} added.`);
}

export async function updateStaffAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const begun = await beginMutation(formData);
  if (isActionState(begun)) return begun;

  const id = idSchema.safeParse(formData.get('id'));
  const parsed = staffSchema.safeParse({
    name: formData.get('name'),
    accent: formData.get('accent'),
    isActive: formData.get('isActive'),
  });

  if (!id.success || !parsed.success) {
    return fail('Please check the form.', parsed.success ? {} : toFieldErrors(parsed.error.issues));
  }

  updateStaff(id.data, parsed.data);

  recordAudit({
    actorId: begun.session.user.id,
    actorEmail: begun.session.user.email,
    action: 'staff.updated',
    target: String(id.data),
    detail: `${parsed.data.name}${parsed.data.isActive ? '' : ' (hidden)'}`,
    ipHash: begun.ipHash,
  });

  revalidatePath('/admin/team');
  return ok('Saved.');
}

export async function archiveStaffAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const begun = await beginMutation(formData);
  if (isActionState(begun)) return begun;

  const id = idSchema.safeParse(formData.get('id'));
  if (!id.success) return fail('That person no longer exists.');

  archiveStaff(id.data);

  recordAudit({
    actorId: begun.session.user.id,
    actorEmail: begun.session.user.email,
    action: 'staff.archived',
    target: String(id.data),
    ipHash: begun.ipHash,
  });

  revalidatePath('/admin/team');
  revalidatePath('/admin/tags');
  return ok('Removed from the list. Their past ratings are kept.');
}

// ---------------------------------------------------------------------------
// Suggestion chips
// ---------------------------------------------------------------------------

export async function createSuggestionAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const begun = await beginMutation(formData);
  if (isActionState(begun)) return begun;

  const parsed = suggestionSchema.safeParse({
    label: formData.get('label'),
    isActive: 'true',
  });
  if (!parsed.success) {
    return fail('Please check the form.', toFieldErrors(parsed.error.issues));
  }

  const id = createSuggestion(parsed.data);

  recordAudit({
    actorId: begun.session.user.id,
    actorEmail: begun.session.user.email,
    action: 'suggestion.created',
    target: String(id),
    detail: parsed.data.label,
    ipHash: begun.ipHash,
  });

  revalidatePath('/admin/suggestions');
  return ok('Added.');
}

export async function updateSuggestionAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const begun = await beginMutation(formData);
  if (isActionState(begun)) return begun;

  const id = idSchema.safeParse(formData.get('id'));
  const parsed = suggestionSchema.safeParse({
    label: formData.get('label'),
    isActive: formData.get('isActive'),
  });

  if (!id.success || !parsed.success) {
    return fail('Please check the form.', parsed.success ? {} : toFieldErrors(parsed.error.issues));
  }

  updateSuggestion(id.data, parsed.data);

  recordAudit({
    actorId: begun.session.user.id,
    actorEmail: begun.session.user.email,
    action: 'suggestion.updated',
    target: String(id.data),
    detail: parsed.data.label,
    ipHash: begun.ipHash,
  });

  revalidatePath('/admin/suggestions');
  return ok('Saved.');
}

export async function deleteSuggestionAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const begun = await beginMutation(formData);
  if (isActionState(begun)) return begun;

  const id = idSchema.safeParse(formData.get('id'));
  if (!id.success) return fail('That suggestion no longer exists.');

  deleteSuggestion(id.data);

  recordAudit({
    actorId: begun.session.user.id,
    actorEmail: begun.session.user.email,
    action: 'suggestion.deleted',
    target: String(id.data),
    ipHash: begun.ipHash,
  });

  revalidatePath('/admin/suggestions');
  return ok('Deleted.');
}
