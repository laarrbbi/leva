'use client';

import { AdminForm, ConfirmSubmitButton, FormBanner, SubmitButton } from '@/components/admin/form';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { EmptyState } from '@/components/ui/stat';
import { LIMITS } from '@/lib/constants';
import {
  createSuggestionAction,
  deleteSuggestionAction,
  updateSuggestionAction,
} from '@/server/actions/admin-actions';
import type { Suggestion } from '@/types/domain';

/**
 * Client boundary for the wishlist screen. See `team-manager.tsx` for why the
 * boundary sits here rather than inside the page.
 */
export function WishlistManager({
  suggestions,
  chosenCounts,
  csrfToken,
}: {
  suggestions: readonly Suggestion[];
  /** Lower-cased label to the number of times customers picked it. */
  chosenCounts: Record<string, number>;
  csrfToken: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title="Add a chip" />
        <CardBody className="pt-2">
          <AdminForm action={createSuggestionAction} csrfToken={csrfToken} resetOnSuccess>
            {(state) => (
              <>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <Field
                      label="Label"
                      htmlFor="new-suggestion"
                      error={state.fieldErrors?.label}
                      hint="For example: oat milk, larger sizes, later opening"
                    >
                      <Input
                        id="new-suggestion"
                        name="label"
                        required
                        maxLength={LIMITS.suggestionLabelMaxLength}
                        placeholder="Oat milk"
                      />
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

      {suggestions.length === 0 ? (
        <EmptyState
          title="No chips yet"
          description="Without chips, customers can still type an answer — but far fewer of them will."
        />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {suggestions.map((suggestion) => (
            <li key={suggestion.id}>
              <Card>
                <CardBody className="flex flex-col gap-3 py-4 sm:flex-row sm:items-end">
                  <AdminForm
                    action={updateSuggestionAction}
                    csrfToken={csrfToken}
                    className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-end"
                  >
                    {(state) => (
                      <>
                        <input type="hidden" name="id" value={suggestion.id} />

                        <div className="flex-1">
                          <Field
                            label="Label"
                            htmlFor={`label-${suggestion.id}`}
                            error={state.fieldErrors?.label}
                            hint={`Chosen ${chosenCounts[suggestion.label.toLowerCase()] ?? 0} times`}
                          >
                            <Input
                              id={`label-${suggestion.id}`}
                              name="label"
                              defaultValue={suggestion.label}
                              required
                              maxLength={LIMITS.suggestionLabelMaxLength}
                            />
                          </Field>
                        </div>

                        <label className="flex items-center gap-2 pb-2.5">
                          <input
                            type="checkbox"
                            name="isActive"
                            value="true"
                            defaultChecked={suggestion.isActive}
                            className="h-4 w-4 accent-[var(--brand)]"
                          />
                          <span className="type-caption text-ink">Show</span>
                        </label>

                        <SubmitButton variant="secondary" size="sm">
                          Save
                        </SubmitButton>
                        <FormBanner state={state} />
                      </>
                    )}
                  </AdminForm>

                  <AdminForm action={deleteSuggestionAction} csrfToken={csrfToken}>
                    {() => (
                      <>
                        <input type="hidden" name="id" value={suggestion.id} />
                        <ConfirmSubmitButton
                          confirmMessage={`Delete "${suggestion.label}"? Answers customers already gave are kept.`}
                          pendingLabel="Deleting…"
                        >
                          Delete
                        </ConfirmSubmitButton>
                      </>
                    )}
                  </AdminForm>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
