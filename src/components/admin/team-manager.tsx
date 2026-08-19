'use client';

import { AdminForm, ConfirmSubmitButton, FormBanner, SubmitButton } from '@/components/admin/form';
import { StaffAvatar } from '@/components/review/staff-picker';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { EmptyState } from '@/components/ui/stat';
import { LIMITS } from '@/lib/constants';
import { formatAverage, formatRelativeCount } from '@/lib/format';
import {
  archiveStaffAction,
  createStaffAction,
  updateStaffAction,
} from '@/server/actions/admin-actions';
import { ACCENTS } from '@/server/validation/schemas';
import type { StaffMember, StaffScore } from '@/types/domain';

/**
 * Client boundary for the team screen.
 *
 * `AdminForm` uses a render prop so each field can show its own error, and a
 * function cannot be handed from a Server Component to a Client Component — so
 * the boundary is drawn here and the page passes only plain data across it.
 */
export function TeamManager({
  staff,
  scores,
  csrfToken,
}: {
  staff: readonly StaffMember[];
  scores: readonly StaffScore[];
  csrfToken: string;
}) {
  const scoreById = new Map(scores.map((score) => [score.id, score]));

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title="Add someone" />
        <CardBody className="pt-2">
          <AdminForm action={createStaffAction} csrfToken={csrfToken} resetOnSuccess>
            {(state) => (
              <>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <Field label="Name" htmlFor="new-staff-name" error={state.fieldErrors?.name}>
                      <Input
                        id="new-staff-name"
                        name="name"
                        required
                        maxLength={LIMITS.staffNameMaxLength}
                        placeholder="Marta"
                      />
                    </Field>
                  </div>

                  <div className="w-full sm:w-40">
                    <Field label="Colour" htmlFor="new-staff-accent">
                      <select
                        id="new-staff-accent"
                        name="accent"
                        defaultValue="indigo"
                        className="w-full rounded-field bg-surface px-3.5 py-2.5 text-ink ring-1 ring-line focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      >
                        {ACCENTS.map((accent) => (
                          <option key={accent} value={accent}>
                            {accent}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  <SubmitButton pendingLabel="Adding…">Add</SubmitButton>
                </div>
                <FormBanner state={state} />
              </>
            )}
          </AdminForm>
        </CardBody>
      </Card>

      {staff.length === 0 ? (
        <EmptyState
          title="No one on the team yet"
          description="Add the people who serve customers. Each one gets their own tag under Tags."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {staff.map((person) => {
            const score = scoreById.get(person.id);

            return (
              <li key={person.id}>
                <Card>
                  <CardBody className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <StaffAvatar
                        initials={person.initials}
                        accent={person.accent}
                        className="h-11 w-11 shrink-0 text-sm"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="type-heading truncate">{person.name}</p>
                        <p className="type-caption">
                          {formatRelativeCount(score?.ratingCount ?? 0, 'rating')}
                          {score?.averageRating != null
                            ? ` · ${formatAverage(score.averageRating)} average`
                            : ''}
                        </p>
                      </div>
                      <code className="type-caption rounded-field bg-surface-sunken px-2 py-1 text-ink-subtle">
                        {person.code}
                      </code>
                    </div>

                    <div className="flex flex-col gap-3 border-t border-line/60 pt-4 sm:flex-row sm:items-end">
                      <AdminForm
                        action={updateStaffAction}
                        csrfToken={csrfToken}
                        className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-end"
                      >
                        {(state) => (
                          <>
                            <input type="hidden" name="id" value={person.id} />
                            <input type="hidden" name="accent" value={person.accent} />

                            <div className="flex-1">
                              <Field
                                label="Name"
                                htmlFor={`name-${person.id}`}
                                error={state.fieldErrors?.name}
                              >
                                <Input
                                  id={`name-${person.id}`}
                                  name="name"
                                  defaultValue={person.name}
                                  required
                                  maxLength={LIMITS.staffNameMaxLength}
                                />
                              </Field>
                            </div>

                            <label className="flex items-center gap-2 pb-2.5">
                              <input
                                type="checkbox"
                                name="isActive"
                                value="true"
                                defaultChecked={person.isActive}
                                className="h-4 w-4 accent-[var(--brand)]"
                              />
                              <span className="type-caption text-ink">Show to customers</span>
                            </label>

                            <SubmitButton variant="secondary" size="sm">
                              Save
                            </SubmitButton>
                            <FormBanner state={state} />
                          </>
                        )}
                      </AdminForm>

                      <AdminForm action={archiveStaffAction} csrfToken={csrfToken}>
                        {() => (
                          <>
                            <input type="hidden" name="id" value={person.id} />
                            <ConfirmSubmitButton
                              confirmMessage={`Remove ${person.name} from the list? Their past ratings are kept.`}
                            >
                              Remove
                            </ConfirmSubmitButton>
                          </>
                        )}
                      </AdminForm>
                    </div>
                  </CardBody>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
