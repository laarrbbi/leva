'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { LIMITS } from '@/lib/constants';
import type { StaffMember, StoreSettings, Suggestion } from '@/types/domain';

import { StaffAvatar, StaffPicker } from './staff-picker';
import { StarRating } from './star-rating';
import { WishPicker } from './wish-picker';

type StepId = 'store' | 'staff' | 'wishes' | 'comment';

export interface ReviewFlowProps {
  settings: StoreSettings;
  staff: readonly StaffMember[];
  suggestions: readonly Suggestion[];
  visitToken: string;
  /** Set when the customer scanned a tag belonging to one person. */
  presetStaff: StaffMember | null;
  source: 'qr' | 'nfc' | 'link';
}

/**
 * How long the chosen star stays on screen before the flow moves on.
 *
 * Long enough that the tap is visibly acknowledged, short enough that it never
 * feels like waiting. Advancing instantly reads as a glitch; a second reads as
 * a slow app.
 */
const AUTO_ADVANCE_MS = 420;

export function ReviewFlow({
  settings,
  staff,
  suggestions,
  visitToken,
  presetStaff,
  source,
}: ReviewFlowProps) {
  const steps = useMemo<StepId[]>(() => {
    const list: StepId[] = ['store'];
    if (settings.askForStaffRating && (presetStaff || staff.length > 0)) list.push('staff');
    if (settings.askForWishes) list.push('wishes');
    if (settings.askForComment) list.push('comment');
    return list;
  }, [settings, staff.length, presetStaff]);

  const [stepIndex, setStepIndex] = useState(0);
  const [storeRating, setStoreRating] = useState<number | null>(null);
  const [staffId, setStaffId] = useState<number | null>(presetStaff?.id ?? null);
  const [staffRating, setStaffRating] = useState<number | null>(null);
  const [selectedSuggestions, setSelectedSuggestions] = useState<number[]>([]);
  const [customWish, setCustomWish] = useState('');
  const [comment, setComment] = useState('');

  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [publicId, setPublicId] = useState<string | null>(null);

  const startedAt = useRef(Date.now());
  const honeypot = useRef<HTMLInputElement>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear a pending auto-advance on unmount so it cannot fire into a dead tree.
  useEffect(() => () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
  }, []);

  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

  const goNext = useCallback(() => {
    setStepIndex((current) => Math.min(current + 1, steps.length - 1));
  }, [steps.length]);

  const goBack = useCallback(() => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    setStepIndex((current) => Math.max(current - 1, 0));
  }, []);

  const scheduleAdvance = useCallback(() => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    advanceTimer.current = setTimeout(goNext, AUTO_ADVANCE_MS);
  }, [goNext]);

  const selectedStaff = presetStaff ?? staff.find((person) => person.id === staffId) ?? null;

  const submit = useCallback(async () => {
    if (storeRating === null) return;
    setStatus('sending');
    setErrorMessage(null);

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          visitToken,
          storeRating,
          staffCode: selectedStaff?.code ?? null,
          staffRating,
          comment: comment.trim() || null,
          suggestionIds: selectedSuggestions,
          customWish: customWish.trim() || null,
          source,
          website: honeypot.current?.value ?? '',
          elapsedMs: Date.now() - startedAt.current,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        setErrorMessage(body?.message ?? 'We could not save that. Please try again.');
        setStatus('error');
        return;
      }

      const body = (await response.json()) as { publicId: string };
      setPublicId(body.publicId);
      setStatus('done');
    } catch {
      setErrorMessage('No connection. Check your signal and try again.');
      setStatus('error');
    }
  }, [
    comment,
    customWish,
    selectedStaff,
    selectedSuggestions,
    source,
    staffRating,
    storeRating,
    visitToken,
  ]);

  if (status === 'done') {
    return <ThankYou settings={settings} publicId={publicId} storeRating={storeRating ?? 0} />;
  }

  const canContinue =
    step === 'store'
      ? storeRating !== null
      : step === 'staff'
        ? selectedStaff !== null
        : true;

  return (
    <div className="flex w-full flex-col gap-6">
      <StepDots total={steps.length} current={stepIndex} />

      {/*
        `key` forces a remount per step so the enter animation replays. The
        wrapper keeps a min-height so the card does not jolt as steps of
        different heights swap in.
      */}
      <div key={step} className="step-enter flex min-h-[13rem] flex-col justify-center gap-5">
        {step === 'store' ? (
          <>
            <Prompt title={settings.welcomeHeadline} subtitle={settings.welcomeSubline} />
            <StarRating
              name="store-rating"
              label="Rate your visit"
              value={storeRating}
              onChange={(value) => {
                setStoreRating(value);
                if (steps.length > 1) scheduleAdvance();
              }}
            />
          </>
        ) : null}

        {step === 'staff' ? (
          <>
            <Prompt
              title={selectedStaff ? `How did ${selectedStaff.name} do?` : 'Who helped you today?'}
              subtitle={selectedStaff ? 'Only the owner sees this.' : 'Tap the person who served you.'}
            />

            {presetStaff ? (
              <div className="flex flex-col items-center gap-3">
                <StaffAvatar
                  initials={presetStaff.initials}
                  accent={presetStaff.accent}
                  className="h-14 w-14 text-lg"
                />
                <p className="type-heading">{presetStaff.name}</p>
              </div>
            ) : (
              <StaffPicker staff={staff} selectedId={staffId} onSelect={setStaffId} />
            )}

            {selectedStaff ? (
              <StarRating
                name="staff-rating"
                label={`Rate ${selectedStaff.name}`}
                value={staffRating}
                onChange={setStaffRating}
                size="md"
              />
            ) : null}
          </>
        ) : null}

        {step === 'wishes' ? (
          <>
            <Prompt
              title="What should we stock next?"
              subtitle="Something you looked for and did not find."
            />
            <WishPicker
              suggestions={suggestions}
              selectedIds={selectedSuggestions}
              onToggle={(id) =>
                setSelectedSuggestions((current) =>
                  current.includes(id)
                    ? current.filter((value) => value !== id)
                    : current.length < LIMITS.maxWishesPerFeedback
                      ? [...current, id]
                      : current,
                )
              }
              customWish={customWish}
              onCustomWishChange={setCustomWish}
            />
          </>
        ) : null}

        {step === 'comment' ? (
          <>
            <Prompt title="Anything else?" subtitle="Optional — and it goes straight to the owner." />
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              maxLength={LIMITS.commentMaxLength}
              rows={4}
              placeholder="What would have made today better?"
              className={cn(
                'w-full resize-none rounded-field bg-surface px-4 py-3 text-ink',
                'ring-1 ring-line placeholder:text-ink-subtle',
                'transition-[box-shadow] duration-hover ease-out-strong',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand',
              )}
            />
            <p className="type-caption -mt-4 text-right tabular-nums">
              {comment.length}/{LIMITS.commentMaxLength}
            </p>
          </>
        ) : null}
      </div>

      {errorMessage ? (
        <p role="alert" className="type-caption rounded-field bg-critical-soft px-4 py-3 text-critical">
          {errorMessage}
        </p>
      ) : null}

      {/*
        Honeypot. Hidden from people and from assistive tech, but present in the
        DOM for a bot that fills every input it finds.
      */}
      <input
        ref={honeypot}
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        className="sr-only"
        style={{ position: 'absolute', left: '-9999px' }}
      />

      {/*
        On the first step there is nothing to go back to, so the primary action
        takes the full width instead of floating alone against the right edge.
      */}
      <div className="flex items-center gap-3">
        {stepIndex > 0 ? (
          <Button type="button" variant="ghost" onClick={goBack} disabled={status === 'sending'}>
            Back
          </Button>
        ) : null}

        {isLast ? (
          <Button
            type="button"
            size="md"
            onClick={submit}
            disabled={!canContinue || status === 'sending'}
            className="flex-1"
          >
            {status === 'sending' ? 'Sending…' : 'Send feedback'}
          </Button>
        ) : (
          <Button
            type="button"
            size="md"
            onClick={goNext}
            disabled={!canContinue}
            className="flex-1"
          >
            Continue
          </Button>
        )}
      </div>
    </div>
  );
}

function Prompt({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="text-center">
      <h1 className="type-title text-balance">{title}</h1>
      {subtitle ? <p className="type-caption mt-1.5 text-pretty">{subtitle}</p> : null}
    </div>
  );
}

/**
 * Progress dots.
 *
 * The current dot widens into a bar rather than changing colour alone — a size
 * change is legible at a glance and does not depend on colour vision.
 */
function StepDots({ total, current }: { total: number; current: number }) {
  if (total < 2) return null;

  return (
    <div className="flex justify-center gap-1.5" aria-hidden>
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          className={cn(
            'h-1.5 rounded-pill',
            'transition-[width,background-color] duration-step ease-out-strong',
            index === current ? 'w-6 bg-brand' : 'w-1.5 bg-line-strong',
          )}
        />
      ))}
    </div>
  );
}

/**
 * Confirmation and the Google hand-off.
 *
 * The Google button is shown to every customer regardless of the rating they
 * just gave. Filtering it by score ("review gating") violates Google's policies
 * and consumer-protection rules in the EU and US, and risks the store's entire
 * review history being removed. The private rating is what the owner acts on;
 * the public invitation is the same for everyone.
 */
function ThankYou({
  settings,
  publicId,
  storeRating,
}: {
  settings: StoreSettings;
  publicId: string | null;
  storeRating: number;
}) {
  const handleGoogleClick = () => {
    if (!publicId) return;
    // Fire-and-forget: the customer must never wait on our analytics before
    // Google opens. `keepalive` lets it complete after the page is backgrounded.
    void fetch(`/api/feedback/${publicId}/google-click`, {
      method: 'POST',
      keepalive: true,
    }).catch(() => undefined);
  };

  return (
    <div className="step-enter flex flex-col items-center gap-6 text-center">
      <SuccessMark />

      <div>
        <h1 className="type-display text-balance">{settings.thanksHeadline}</h1>
        <p className="type-body mt-2 text-pretty text-ink-muted">{settings.thanksSubline}</p>
      </div>

      {settings.googleReviewUrl ? (
        <div className="flex w-full flex-col items-center gap-3">
          <a
            href={settings.googleReviewUrl}
            target="_blank"
            // noopener/noreferrer: without them the opened tab can navigate this
            // one via window.opener, and the Referer would leak the tag URL.
            rel="noopener noreferrer"
            onClick={handleGoogleClick}
            className={cn(
              'pressable inline-flex h-14 w-full items-center justify-center gap-2.5',
              'rounded-pill bg-brand px-7 font-semibold text-white shadow-[var(--shadow-card)]',
              'transition-[background-color,transform] duration-press ease-out-strong',
              'hover:bg-brand-hover',
            )}
          >
            <GoogleGlyph />
            Leave a Google review
          </a>
          <p className="type-caption max-w-xs text-pretty">
            {storeRating >= 4
              ? 'It takes 15 seconds and helps other people find us.'
              : 'Your public review is yours to write — say exactly what you experienced.'}
          </p>
        </div>
      ) : (
        <p className="type-caption">Your feedback has been recorded.</p>
      )}
    </div>
  );
}

/**
 * The check draws itself in.
 *
 * A single stroke animation on `stroke-dashoffset` — the mark arrives the way a
 * pen would draw it, which reads as completion rather than as a static icon
 * that was always there.
 */
function SuccessMark() {
  return (
    <svg viewBox="0 0 52 52" className="h-16 w-16" aria-hidden>
      <circle
        cx="26"
        cy="26"
        r="24"
        className="fill-positive-soft stroke-positive"
        strokeWidth="2"
        pathLength={1}
        style={{
          strokeDasharray: 1,
          strokeDashoffset: 0,
          animation: 'draw-circle 460ms var(--ease-out-strong) both',
        }}
      />
      <path
        d="M15 27l8 8 15-16"
        fill="none"
        className="stroke-positive"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        style={{
          strokeDasharray: 1,
          animation: 'draw-check 340ms var(--ease-out-strong) 220ms both',
        }}
      />
      <style>{`
        @keyframes draw-circle { from { stroke-dashoffset: 1; opacity: 0.4 } to { stroke-dashoffset: 0; opacity: 1 } }
        @keyframes draw-check  { from { stroke-dashoffset: 1 } to { stroke-dashoffset: 0 } }
        @media (prefers-reduced-motion: reduce) {
          circle, path { animation: none !important; stroke-dashoffset: 0 !important; }
        }
      `}</style>
    </svg>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path
        fill="#FFC107"
        d="M21.8 10.2H12v3.9h5.6a5 5 0 0 1-2.1 3.2v2.7h3.4c2-1.9 3.1-4.6 3.1-7.8 0-.7-.1-1.4-.2-2z"
      />
      <path
        fill="#4CAF50"
        d="M12 22c2.7 0 5-.9 6.7-2.4l-3.4-2.6c-.9.6-2 1-3.3 1-2.6 0-4.8-1.7-5.5-4.1H3v2.6A10 10 0 0 0 12 22z"
      />
      <path fill="#2196F3" d="M6.5 13.9a6 6 0 0 1 0-3.8V7.5H3a10 10 0 0 0 0 9l3.5-2.6z" />
      <path
        fill="#F44336"
        d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3 7.5l3.5 2.6C7.2 7.6 9.4 5.9 12 5.9z"
      />
    </svg>
  );
}
