import { WishlistManager } from '@/components/admin/wishlist-manager';
import { requireSession } from '@/server/auth/guard';
import { listWishTally } from '@/server/repositories/feedback';
import { listSuggestions } from '@/server/repositories/suggestions';

export const dynamic = 'force-dynamic';

export default async function SuggestionsPage() {
  const session = await requireSession();

  const chosenCounts = Object.fromEntries(
    listWishTally(200).map((wish) => [wish.label.toLowerCase(), wish.count]),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="type-display">Wishlist</h1>
        <p className="type-body mt-1 max-w-prose text-ink-muted text-pretty">
          These appear as one-tap chips when a customer is asked what you should stock next. Keep
          them short — a chip that wraps to two lines stops looking tappable.
        </p>
      </div>

      <WishlistManager
        suggestions={listSuggestions(true)}
        chosenCounts={chosenCounts}
        csrfToken={session.csrfToken}
      />
    </div>
  );
}
