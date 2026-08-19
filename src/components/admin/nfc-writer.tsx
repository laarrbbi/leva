'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

/**
 * Minimal Web NFC surface.
 *
 * Typed locally rather than pulled from a DOM lib: Web NFC is Chrome-on-Android
 * only, and `@types/web-nfc` would put a global on every file in the project for
 * one component.
 */
interface NdefWriter {
  write(message: { records: Array<{ recordType: string; data: string }> }): Promise<void>;
}

type Phase = 'idle' | 'waiting' | 'written' | 'unsupported' | 'error';

/**
 * Writes a tag's URL to a physical NFC sticker.
 *
 * Web NFC exists only in Chrome on Android, over HTTPS, and only inside a user
 * gesture — so this is strictly an enhancement. Everywhere else the owner still
 * has the URL and the QR code above, which is why an unsupported browser shows
 * a plain instruction instead of an error.
 */
export function NfcWriter({ url, label }: { url: string; label: string }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [detail, setDetail] = useState<string | null>(null);

  const write = async () => {
    const NDEFReaderCtor = (
      window as unknown as { NDEFReader?: new () => NdefWriter }
    ).NDEFReader;

    if (!NDEFReaderCtor) {
      setPhase('unsupported');
      return;
    }

    setPhase('waiting');
    setDetail(null);

    try {
      await new NDEFReaderCtor().write({ records: [{ recordType: 'url', data: url }] });
      setPhase('written');
    } catch (error) {
      // A user who declines the permission prompt is not an error worth shouting
      // about, but they do need to know nothing was written.
      setPhase('error');
      setDetail(error instanceof Error ? error.message : null);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={write}
        disabled={phase === 'waiting'}
      >
        {phase === 'waiting' ? 'Hold tag to phone…' : `Write NFC tag${label ? ` — ${label}` : ''}`}
      </Button>

      {phase !== 'idle' ? (
        <p
          aria-live="polite"
          className={cn(
            'type-caption',
            phase === 'written' && 'text-positive',
            phase === 'error' && 'text-critical',
          )}
        >
          {phase === 'waiting' ? 'Touch the blank tag to the back of your phone.' : null}
          {phase === 'written' ? 'Written. Test it by tapping the tag again.' : null}
          {phase === 'unsupported'
            ? 'This browser cannot write NFC tags. Use Chrome on Android, or write the link with any NFC tag app.'
            : null}
          {phase === 'error' ? `Nothing was written.${detail ? ` ${detail}` : ''}` : null}
        </p>
      ) : null}
    </div>
  );
}
