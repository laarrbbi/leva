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
  pickupUrl: string | null;
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
