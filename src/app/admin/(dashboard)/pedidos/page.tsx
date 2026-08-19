import { OrderBoard } from '@/components/order/order-board';
import { EmptyState } from '@/components/ui/stat';
import { requireSession } from '@/server/auth/guard';
import { listActiveOrders } from '@/server/repositories/orders';
import { getSettings } from '@/server/repositories/settings';

export const dynamic = 'force-dynamic';

export default async function OrdersPage() {
  const session = await requireSession();
  const settings = getSettings();

  if (!settings.pickupEnabled) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="type-display">Pedidos</h1>
        <EmptyState
          title="El módulo de pedidos está apagado"
          description="Actívalo en Ajustes para empezar a recibir pedidos desde el coche."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="type-display">{settings.pickupName}</h1>
        <p className="type-body mt-1 text-ink-muted">
          Deja esta pantalla abierta en la tablet del mostrador.
        </p>
      </div>

      <OrderBoard
        initialOrders={listActiveOrders()}
        acceptingOrders={settings.pickupAcceptingOrders}
        currency={settings.pickupCurrency}
        csrfToken={session.csrfToken}
      />
    </div>
  );
}
