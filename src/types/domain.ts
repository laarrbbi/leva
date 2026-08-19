import type { Accent } from '@/server/validation/schemas';

export type Source = 'qr' | 'nfc' | 'link';
export type Role = 'owner' | 'manager';

export interface StoreSettings {
  slug: string;
  storeName: string;
  welcomeHeadline: string;
  welcomeSubline: string;
  thanksHeadline: string;
  thanksSubline: string;
  googleReviewUrl: string | null;
  googlePlaceId: string | null;
  askForStaffRating: boolean;
  askForWishes: boolean;
  askForComment: boolean;
  pickupEnabled: boolean;
  pickupName: string;
  pickupTagline: string;
  /** Legacy: an external ordering link, used only when the built-in module is off. */
  pickupUrl: string | null;
  pickupAcceptingOrders: boolean;
  pickupPrepMinutes: number;
  pickupBayCount: number;
  pickupCurrency: string;
  pickupClosedMessage: string;
}

export interface StaffMember {
  id: number;
  code: string;
  name: string;
  initials: string;
  accent: Accent;
  isActive: boolean;
  sortOrder: number;
}

export interface Suggestion {
  id: number;
  label: string;
  isActive: boolean;
  sortOrder: number;
}

export interface FeedbackEntry {
  id: number;
  publicId: string;
  storeRating: number;
  staffId: number | null;
  staffName: string | null;
  staffRating: number | null;
  comment: string | null;
  source: Source;
  googleCtaClickedAt: string | null;
  createdAt: string;
  wishes: string[];
}

export interface StaffScore {
  id: number;
  name: string;
  initials: string;
  accent: Accent;
  isActive: boolean;
  ratingCount: number;
  averageRating: number | null;
}

export interface WishTally {
  label: string;
  count: number;
  isCustom: boolean;
}

export interface DashboardStats {
  totalFeedback: number;
  feedbackLast7Days: number;
  averageStoreRating: number | null;
  averageStaffRating: number | null;
  googleClickThroughRate: number | null;
  ratingHistogram: Array<{ rating: number; count: number }>;
}

// ---------------------------------------------------------------------------
// "Pedidos desde el coche" — the ordering module
// ---------------------------------------------------------------------------

export type OrderStatus =
  | 'pending_payment'
  | 'new'
  | 'preparing'
  | 'ready'
  | 'delivered'
  | 'cancelled';

export type PaymentMethod = 'terminal' | 'online';
export type PaymentStatus = 'due' | 'paid_terminal' | 'paid_online' | 'refunded';

export interface Category {
  id: number;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface Product {
  id: number;
  categoryId: number;
  name: string;
  description: string;
  /** Integer cents. Never a float — see migration 002. */
  priceCents: number;
  emoji: string;
  imageUrl: string | null;
  isSoldOut: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface MenuCategory extends Category {
  products: Product[];
}

export interface OrderItem {
  id: number;
  productId: number | null;
  /** Copied at order time so a later price change cannot rewrite this ticket. */
  name: string;
  priceCents: number;
  quantity: number;
  notes: string | null;
}

export interface Order {
  id: number;
  publicToken: string;
  dailyNumber: number;
  serviceDate: string;
  status: OrderStatus;
  bay: string | null;
  vehicle: string;
  customerName: string;
  phone: string | null;
  notes: string | null;
  totalCents: number;
  currency: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  source: Source;
  createdAt: string;
  acceptedAt: string | null;
  readyAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  items: OrderItem[];
}

/** What the customer's tracking page needs — deliberately no payment detail. */
export interface OrderTracking {
  publicToken: string;
  dailyNumber: number;
  status: OrderStatus;
  bay: string | null;
  totalCents: number;
  currency: string;
  paymentStatus: PaymentStatus;
  createdAt: string;
  acceptedAt: string | null;
  readyAt: string | null;
  deliveredAt: string | null;
  prepMinutes: number;
}

export interface PickupSettings {
  enabled: boolean;
  name: string;
  tagline: string;
  acceptingOrders: boolean;
  prepMinutes: number;
  bayCount: number;
  currency: string;
  closedMessage: string;
}

export interface DailySummary {
  serviceDate: string;
  orderCount: number;
  deliveredCount: number;
  cancelledCount: number;
  revenueCents: number;
  paidOnlineCents: number;
  collectedAtCarCents: number;
  outstandingCents: number;
  averageTicketCents: number;
  averagePrepMinutes: number | null;
  topProducts: Array<{ name: string; quantity: number }>;
}
