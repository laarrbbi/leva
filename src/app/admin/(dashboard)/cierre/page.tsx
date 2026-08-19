import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState, Stat } from '@/components/ui/stat';
import { formatClock, formatMoney } from '@/lib/format';
import { requireSession } from '@/server/auth/guard';
import { getDailySummary, listOrdersForDate, serviceDateToday } from '@/server/repositories/orders';
import { getSettings } from '@/server/repositories/settings';
import { serviceDateSchema } from '@/server/validation/schemas';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DailyClosePage({ searchParams }: PageProps) {
  await requireSession();
  const settings = getSettings();
  const query = await searchParams;

  // The date comes from the URL, so parse rather than trust — it goes straight
  // into a query and into the page heading.
  const requested = typeof query.fecha === 'string' ? query.fecha : '';
  const parsed = serviceDateSchema.safeParse(requested);
  const serviceDate = parsed.success ? parsed.data : serviceDateToday();

  const summary = getDailySummary(serviceDate);
  const orders = listOrdersForDate(serviceDate);
  const currency = settings.pickupCurrency;

  const previous = shiftDate(serviceDate, -1);
  const next = shiftDate(serviceDate, 1);
  const isToday = serviceDate === serviceDateToday();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="type-display">Cierre del día</h1>
          <p className="type-body mt-1 text-ink-muted type-numeric">{serviceDate}</p>
        </div>

        <nav aria-label="Cambiar día" className="flex items-center gap-2">
          <Link
            href={`/admin/cierre?fecha=${previous}`}
            className="pressable rounded-pill bg-surface px-3 py-1.5 text-[0.8125rem] font-medium ring-1 ring-line"
          >
            ← Día anterior
          </Link>
          {!isToday ? (
            <Link
              href={`/admin/cierre?fecha=${next}`}
              className="pressable rounded-pill bg-surface px-3 py-1.5 text-[0.8125rem] font-medium ring-1 ring-line"
            >
              Día siguiente →
            </Link>
          ) : null}
          <a
            href={`/api/panel/cierre?fecha=${serviceDate}`}
            className="pressable rounded-pill bg-brand px-3 py-1.5 text-[0.8125rem] font-semibold text-white"
          >
            Descargar CSV
          </a>
        </nav>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pedidos" value={summary.orderCount} hint={`${summary.deliveredCount} entregados`} />
        <Stat label="Facturado" value={formatMoney(summary.revenueCents, currency)} tone="positive" />
        <Stat label="Ticket medio" value={formatMoney(summary.averageTicketCents, currency)} />
        <Stat
          label="Tiempo medio"
          value={summary.averagePrepMinutes === null ? '—' : `${Math.round(summary.averagePrepMinutes)} min`}
          hint="de pedido a entrega"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Cuadre de caja"
            description="Compara la fila del datáfono con el total de tu TPV."
          />
          <CardBody className="pt-2">
            <dl className="flex flex-col divide-y divide-line/60">
              <Row label="Cobrado en el coche (datáfono)" value={formatMoney(summary.collectedAtCarCents, currency)} />
              <Row label="Pagado online" value={formatMoney(summary.paidOnlineCents, currency)} />
              <Row
                label="Pendiente de cobro"
                value={formatMoney(summary.outstandingCents, currency)}
                tone={summary.outstandingCents > 0 ? 'caution' : undefined}
              />
              <Row label="Cancelados" value={String(summary.cancelledCount)} />
            </dl>

            {summary.outstandingCents > 0 ? (
              <p className="type-caption mt-3 rounded-field bg-caution-soft px-3 py-2 text-caution text-pretty">
                Hay pedidos entregados sin marcar como cobrados. Revísalos antes de cuadrar.
              </p>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Lo más vendido" />
          <CardBody className="pt-2">
            {summary.topProducts.length === 0 ? (
              <EmptyState title="Sin ventas" description="Todavía no hay pedidos este día." />
            ) : (
              <ul className="flex flex-col divide-y divide-line/60">
                {summary.topProducts.map((product) => (
                  <li key={product.name} className="flex items-baseline justify-between gap-3 py-2">
                    <span className="type-body min-w-0 truncate">{product.name}</span>
                    <span className="type-numeric shrink-0 font-semibold">{product.quantity}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </section>

      <Card>
        <CardHeader title="Pedidos del día" />
        <CardBody className="pt-2">
          {orders.length === 0 ? (
            <EmptyState title="Ningún pedido" description="Nadie ha pedido desde el coche este día." />
          ) : (
            <ul className="flex flex-col divide-y divide-line/60">
              {orders.map((order) => (
                <li key={order.id} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="type-numeric w-12 shrink-0 font-semibold">#{order.dailyNumber}</span>
                  <span className="type-caption w-14 shrink-0 type-numeric">
                    {formatClock(order.createdAt)}
                  </span>
                  <span className="type-body min-w-0 flex-1 truncate">
                    {order.bay ? `Plaza ${order.bay} · ` : ''}
                    {order.vehicle}
                  </span>
                  <Badge
                    tone={
                      order.status === 'delivered'
                        ? 'positive'
                        : order.status === 'cancelled'
                          ? 'critical'
                          : 'neutral'
                    }
                  >
                    {STATUS_LABEL[order.status]}
                  </Badge>
                  <Badge tone={order.paymentStatus === 'due' ? 'caution' : 'positive'}>
                    {order.paymentStatus === 'due' ? 'sin cobrar' : 'cobrado'}
                  </Badge>
                  <span className="type-numeric w-20 shrink-0 text-right font-semibold">
                    {formatMoney(order.totalCents, currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  pending_payment: 'sin pagar',
  new: 'nuevo',
  preparing: 'preparando',
  ready: 'listo',
  delivered: 'entregado',
  cancelled: 'cancelado',
};

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'caution';
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5">
      <dt className="type-body text-ink-muted">{label}</dt>
      <dd className={`type-numeric font-semibold ${tone === 'caution' ? 'text-caution' : ''}`}>
        {value}
      </dd>
    </div>
  );
}

/** Day arithmetic on the YYYY-MM-DD string, in UTC to avoid a DST off-by-one. */
function shiftDate(serviceDate: string, days: number): string {
  const date = new Date(`${serviceDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
