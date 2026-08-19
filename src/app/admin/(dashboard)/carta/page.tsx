import { MenuManager } from '@/components/order/menu-manager';
import { EmptyState } from '@/components/ui/stat';
import { requireSession } from '@/server/auth/guard';
import { listCategories, listProducts } from '@/server/repositories/menu';
import { getSettings } from '@/server/repositories/settings';

export const dynamic = 'force-dynamic';

export default async function MenuPage() {
  const session = await requireSession();
  const settings = getSettings();

  if (!settings.pickupEnabled) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="type-display">Carta</h1>
        <EmptyState
          title="El módulo de pedidos está apagado"
          description="Actívalo en Ajustes para gestionar la carta."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="type-display">Carta</h1>
        <p className="type-body mt-1 max-w-prose text-ink-muted text-pretty">
          Lo que marques como agotado desaparece de la carta al instante, en todos los móviles del
          aparcamiento.
        </p>
      </div>

      <MenuManager
        categories={listCategories(true)}
        products={listProducts(true)}
        currency={settings.pickupCurrency}
        csrfToken={session.csrfToken}
      />
    </div>
  );
}
