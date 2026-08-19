import { OrderPage } from '@/components/order/order-page';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ bay: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Entry from a per-bay poster: `/pedir/p/3`.
 *
 * The bay travels in the path rather than a query string so the printed URL
 * under the QR reads as an address a human can retype from a car window.
 */
export default async function PedirEnPlazaPage({ params, searchParams }: PageProps) {
  const { bay } = await params;
  return <OrderPage bay={bay} searchParams={await searchParams} />;
}
