import { getSession } from '@/server/auth/session';
import { listOrdersForDate, serviceDateToday } from '@/server/repositories/orders';
import { serviceDateSchema } from '@/server/validation/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Escapes one CSV field.
 *
 * The leading-character guard is the important half: a spreadsheet treats a
 * cell starting with `=`, `+`, `-` or `@` as a formula, so a customer who names
 * their car `=cmd|'/c calc'!A1` would otherwise get code execution on the
 * bookkeeper's machine when they open the export. Prefixing a single quote
 * makes the cell inert text.
 */
function csvField(value: string | number | null): string {
  if (value === null) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

/**
 * Daily close as CSV, for the bookkeeper.
 *
 * Authenticated: these rows carry customer names, vehicles and phone numbers.
 */
export async function GET(request: Request): Promise<Response> {
  if (!(await getSession())) return new Response(null, { status: 401 });

  const requested = new URL(request.url).searchParams.get('fecha') ?? '';
  const parsed = serviceDateSchema.safeParse(requested);
  const serviceDate = parsed.success ? parsed.data : serviceDateToday();

  const orders = listOrdersForDate(serviceDate);

  const header = [
    'numero',
    'fecha',
    'hora',
    'estado',
    'plaza',
    'vehiculo',
    'cliente',
    'telefono',
    'articulos',
    'total_eur',
    'metodo_pago',
    'estado_pago',
  ];

  const rows = orders.map((order) =>
    [
      order.dailyNumber,
      order.serviceDate,
      new Date(order.createdAt).toISOString().slice(11, 16),
      order.status,
      order.bay ?? '',
      order.vehicle,
      order.customerName,
      order.phone ?? '',
      order.items.map((item) => `${item.quantity}x ${item.name}`).join('; '),
      // Comma decimal separator for a Spanish spreadsheet locale; the field is
      // quoted, so it cannot break the column layout.
      (order.totalCents / 100).toFixed(2).replace('.', ','),
      order.paymentMethod,
      order.paymentStatus,
    ]
      .map(csvField)
      .join(','),
  );

  // A UTF-8 BOM so Excel opens accented names correctly instead of as mojibake.
  const body = `﻿${[header.map(csvField).join(','), ...rows].join('\r\n')}\r\n`;

  return new Response(body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="pedidos-${serviceDate}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
