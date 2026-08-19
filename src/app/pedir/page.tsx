import { OrderPage } from '@/components/order/order-page';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Generic entry — the QR in the shop window, with no bay attached. */
export default async function PedirPage({ searchParams }: PageProps) {
  return <OrderPage bay={null} searchParams={await searchParams} />;
}
