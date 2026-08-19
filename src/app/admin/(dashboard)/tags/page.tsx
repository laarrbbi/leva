import { NfcWriter } from '@/components/admin/nfc-writer';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/stat';
import { requireSession } from '@/server/auth/guard';
import { getSettings } from '@/server/repositories/settings';
import { listStaff } from '@/server/repositories/staff';
import { buildTags, type Tag } from '@/server/services/tags';

export const dynamic = 'force-dynamic';

export default async function TagsPage() {
  await requireSession();

  const settings = getSettings();
  const staff = listStaff();
  const tags = await buildTags(settings, staff);

  return (
    <div className="flex flex-col gap-8">
      <div className="print:hidden">
        <h1 className="type-display">Tags</h1>
        <p className="type-body mt-1 max-w-prose text-ink-muted text-pretty">
          Print a QR code, or write the same link to a blank NFC sticker. Both open exactly the same
          page — NFC is just faster for someone already holding their phone.
        </p>
      </div>

      <section className="flex flex-col gap-4">
        <SectionTitle
          title="Review tag"
          hint="Stick this on the counter, the receipt holder or the door."
        />
        <TagCard tag={tags.store} featured />
      </section>

      <section className="flex flex-col gap-4">
        <SectionTitle
          title={tags.platform ? tags.platform.title : 'Second platform'}
          hint={
            tags.platform
              ? 'Its own code, separate from the review tag.'
              : 'Not set up yet.'
          }
        />
        {tags.platform ? (
          <TagCard tag={tags.platform} featured />
        ) : (
          <div className="print:hidden">
            <EmptyState
              title="No second tag yet"
              description="Turn on “Pedidos desde el coche” under Settings and a separate QR code appears here — plus one poster per parking bay."
            />
          </div>
        )}
      </section>

      {tags.bays.length > 0 ? (
        <section className="flex flex-col gap-4">
          <SectionTitle
            title="Un cartel por plaza"
            hint="El pedido llega con el número de plaza, así nadie tiene que buscar el coche."
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tags.bays.map((tag) => (
              <TagCard key={tag.id} tag={tag} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-4">
        <SectionTitle
          title="Per-person tags"
          hint="Optional. Skips the “who helped you?” step, so the rating always lands on the right person."
        />

        {tags.people.length === 0 ? (
          <div className="print:hidden">
            <EmptyState
              title="No team members yet"
              description="Add people under Team and a tag for each of them appears here."
            />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {tags.people.map((tag) => (
              <TagCard key={tag.id} tag={tag} />
            ))}
          </div>
        )}
      </section>

      <aside className="type-caption rounded-card bg-surface-sunken p-5 text-pretty print:hidden">
        <p className="font-semibold text-ink">Before you print a hundred of them</p>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-4">
          <li>Scan each code with a real phone first — a code that is too small fails in low light.</li>
          <li>Print at 3 cm across or larger, in black on white. Coloured backgrounds break scanners.</li>
          <li>
            Changing the tag address under Settings makes every printed code stop working. Reprint
            before you change it, not after.
          </li>
          <li>Lock your NFC tags read-only once written, or anyone can rewrite them in your shop.</li>
        </ul>
      </aside>
    </div>
  );
}

function SectionTitle({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="print:hidden">
      <h2 className="type-heading">{title}</h2>
      <p className="type-caption mt-0.5 text-pretty">{hint}</p>
    </div>
  );
}

function TagCard({ tag, featured = false }: { tag: Tag; featured?: boolean }) {
  return (
    <Card className="break-inside-avoid">
      <CardBody className="flex flex-col items-center gap-4 text-center">
        <div className="flex items-center gap-2">
          <h3 className="type-heading">{tag.title}</h3>
          {tag.kind === 'platform' ? <Badge tone="brand">platform</Badge> : null}
        </div>
        <p className="type-caption -mt-3 text-pretty">{tag.subtitle}</p>

        {/*
          A plain <img> on a data: URI. next/image would add a loader and a
          layout wrapper for an asset that is already inline and already sized.
        */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={tag.qrDataUri}
          alt={`QR code for ${tag.title}`}
          width={featured ? 220 : 160}
          height={featured ? 220 : 160}
          className="rounded-field bg-white p-2 ring-1 ring-line"
        />

        <code className="type-caption block w-full break-all rounded-field bg-surface-sunken px-3 py-2 text-ink-subtle">
          {tag.url}
        </code>

        <div className="print:hidden">
          <NfcWriter url={tag.nfcUrl} label={tag.title} />
        </div>
      </CardBody>
    </Card>
  );
}
