'use server';

import { revalidatePath } from 'next/cache';

import { CSRF_FIELD, assertCsrf } from '@/server/auth/csrf';
import type { ActiveSession } from '@/server/auth/session';
import { recordAudit } from '@/server/repositories/audit';
import {
  clearAllSoldOut,
  createCategory,
  createProduct,
  deleteCategory,
  deleteProduct,
  setProductSoldOut,
  updateCategory,
  updateProduct,
} from '@/server/repositories/menu';
import { findOrderById, markPaidAtTerminal, transitionOrder } from '@/server/repositories/orders';
import { setAcceptingOrders } from '@/server/repositories/settings';
import { hashIp } from '@/server/security/hash';
import { RULES, consume } from '@/server/security/rate-limit';
import { getClientIp } from '@/server/security/request';
import {
  categorySchema,
  idSchema,
  orderTransitionSchema,
  productSchema,
} from '@/server/validation/schemas';

import { fail, ok, toFieldErrors, type ActionState } from './types';

/** Same preamble as the other admin mutations: prove intent, then spend budget. */
async function begin(
  formData: FormData,
): Promise<{ session: ActiveSession; ipHash: string | null } | ActionState> {
  let session: ActiveSession;
  try {
    session = await assertCsrf(formData.get(CSRF_FIELD)?.toString());
  } catch {
    return fail('Tu sesión ha caducado. Vuelve a entrar.');
  }

  if (!consume(RULES.adminWrite, String(session.user.id)).allowed) {
    return fail('Demasiados cambios seguidos. Espera un momento.');
  }

  return { session, ipHash: hashIp(await getClientIp()) };
}

function isActionState(value: unknown): value is ActionState {
  return typeof value === 'object' && value !== null && 'status' in value;
}

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------

/**
 * Advances an order.
 *
 * The `from` status travels with the request and is checked inside the UPDATE,
 * so a stale tablet — one showing a card another member of staff already moved
 * — fails harmlessly instead of dragging the order backwards.
 */
export async function transitionOrderAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const begun = await begin(formData);
  if (isActionState(begun)) return begun;

  const parsed = orderTransitionSchema.safeParse({
    orderId: formData.get('orderId'),
    from: formData.get('from'),
    to: formData.get('to'),
  });
  if (!parsed.success) return fail('Ese pedido ya no está donde creías.');

  const moved = transitionOrder(parsed.data.orderId, parsed.data.from, parsed.data.to);
  if (!moved) return fail('Otra persona ya ha movido este pedido. Refresca la pantalla.');

  const order = findOrderById(parsed.data.orderId);

  recordAudit({
    actorId: begun.session.user.id,
    actorEmail: begun.session.user.email,
    action: `order.${parsed.data.to}`,
    target: order ? `#${order.dailyNumber}` : String(parsed.data.orderId),
    ipHash: begun.ipHash,
  });

  revalidatePath('/admin/pedidos');
  return ok('Hecho.');
}

/** Records collection at the car. Separate from delivery: bread and money are different things. */
export async function markPaidAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const begun = await begin(formData);
  if (isActionState(begun)) return begun;

  const orderId = idSchema.safeParse(formData.get('orderId'));
  if (!orderId.success) return fail('Pedido no encontrado.');

  if (!markPaidAtTerminal(orderId.data, begun.session.user.id)) {
    return fail('Ese pedido ya estaba cobrado.');
  }

  const order = findOrderById(orderId.data);
  recordAudit({
    actorId: begun.session.user.id,
    actorEmail: begun.session.user.email,
    action: 'order.paid_terminal',
    target: order ? `#${order.dailyNumber}` : String(orderId.data),
    detail: order ? `${(order.totalCents / 100).toFixed(2)} ${order.currency}` : null,
    ipHash: begun.ipHash,
  });

  revalidatePath('/admin/pedidos');
  return ok('Cobrado.');
}

/**
 * The pause button.
 *
 * Deliberately its own action with no other fields: it gets pressed during a
 * rush, and a pause that depended on a valid settings form would fail exactly
 * when the counter needs it.
 */
export async function setAcceptingOrdersAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const begun = await begin(formData);
  if (isActionState(begun)) return begun;

  const accepting = formData.get('accepting') === 'true';
  setAcceptingOrders(accepting);

  recordAudit({
    actorId: begun.session.user.id,
    actorEmail: begun.session.user.email,
    action: accepting ? 'orders.resumed' : 'orders.paused',
    ipHash: begun.ipHash,
  });

  revalidatePath('/admin/pedidos');
  revalidatePath('/admin/carta');
  return ok(accepting ? 'Aceptando pedidos.' : 'Pedidos en pausa.');
}

// ---------------------------------------------------------------------------
// The menu
// ---------------------------------------------------------------------------

export async function createCategoryAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const begun = await begin(formData);
  if (isActionState(begun)) return begun;

  const parsed = categorySchema.safeParse({
    name: formData.get('name'),
    isActive: 'true',
  });
  if (!parsed.success) return fail('Revisa el formulario.', toFieldErrors(parsed.error.issues));

  const id = createCategory(parsed.data.name);
  recordAudit({
    actorId: begun.session.user.id,
    actorEmail: begun.session.user.email,
    action: 'category.created',
    target: String(id),
    detail: parsed.data.name,
    ipHash: begun.ipHash,
  });

  revalidatePath('/admin/carta');
  return ok('Categoría creada.');
}

export async function updateCategoryAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const begun = await begin(formData);
  if (isActionState(begun)) return begun;

  const id = idSchema.safeParse(formData.get('id'));
  const parsed = categorySchema.safeParse({
    name: formData.get('name'),
    isActive: formData.get('isActive'),
  });
  if (!id.success || !parsed.success) {
    return fail('Revisa el formulario.', parsed.success ? {} : toFieldErrors(parsed.error.issues));
  }

  updateCategory(id.data, parsed.data);
  recordAudit({
    actorId: begun.session.user.id,
    actorEmail: begun.session.user.email,
    action: 'category.updated',
    target: String(id.data),
    detail: parsed.data.name,
    ipHash: begun.ipHash,
  });

  revalidatePath('/admin/carta');
  return ok('Guardado.');
}

export async function deleteCategoryAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const begun = await begin(formData);
  if (isActionState(begun)) return begun;

  const id = idSchema.safeParse(formData.get('id'));
  if (!id.success) return fail('Esa categoría ya no existe.');

  deleteCategory(id.data);
  recordAudit({
    actorId: begun.session.user.id,
    actorEmail: begun.session.user.email,
    action: 'category.deleted',
    target: String(id.data),
    ipHash: begun.ipHash,
  });

  revalidatePath('/admin/carta');
  return ok('Categoría eliminada.');
}

function readProductForm(formData: FormData) {
  return productSchema.safeParse({
    categoryId: formData.get('categoryId'),
    name: formData.get('name'),
    description: formData.get('description') ?? '',
    priceCents: formData.get('price'),
    emoji: formData.get('emoji') ?? '',
    imageUrl: formData.get('imageUrl') ?? '',
    isActive: formData.get('isActive') ?? 'true',
  });
}

export async function createProductAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const begun = await begin(formData);
  if (isActionState(begun)) return begun;

  const parsed = readProductForm(formData);
  if (!parsed.success) return fail('Revisa el formulario.', toFieldErrors(parsed.error.issues));

  const id = createProduct({ ...parsed.data, imageUrl: parsed.data.imageUrl || null });
  recordAudit({
    actorId: begun.session.user.id,
    actorEmail: begun.session.user.email,
    action: 'product.created',
    target: String(id),
    detail: `${parsed.data.name} · ${(parsed.data.priceCents / 100).toFixed(2)}`,
    ipHash: begun.ipHash,
  });

  revalidatePath('/admin/carta');
  return ok('Producto añadido.');
}

export async function updateProductAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const begun = await begin(formData);
  if (isActionState(begun)) return begun;

  const id = idSchema.safeParse(formData.get('id'));
  const parsed = readProductForm(formData);
  if (!id.success || !parsed.success) {
    return fail('Revisa el formulario.', parsed.success ? {} : toFieldErrors(parsed.error.issues));
  }

  updateProduct(id.data, { ...parsed.data, imageUrl: parsed.data.imageUrl || null });

  // Price changes are named in the trail: it is the one menu edit with money
  // attached, and the one an owner will want to check after the fact.
  recordAudit({
    actorId: begun.session.user.id,
    actorEmail: begun.session.user.email,
    action: 'product.updated',
    target: String(id.data),
    detail: `${parsed.data.name} · ${(parsed.data.priceCents / 100).toFixed(2)}`,
    ipHash: begun.ipHash,
  });

  revalidatePath('/admin/carta');
  return ok('Guardado.');
}

export async function toggleSoldOutAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const begun = await begin(formData);
  if (isActionState(begun)) return begun;

  const id = idSchema.safeParse(formData.get('id'));
  if (!id.success) return fail('Ese producto ya no existe.');

  const soldOut = formData.get('soldOut') === 'true';
  setProductSoldOut(id.data, soldOut);

  revalidatePath('/admin/carta');
  return ok(soldOut ? 'Marcado como agotado.' : 'Vuelve a estar disponible.');
}

export async function clearSoldOutAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const begun = await begin(formData);
  if (isActionState(begun)) return begun;

  const restored = clearAllSoldOut();
  recordAudit({
    actorId: begun.session.user.id,
    actorEmail: begun.session.user.email,
    action: 'products.sold_out_cleared',
    detail: `${restored} productos`,
    ipHash: begun.ipHash,
  });

  revalidatePath('/admin/carta');
  return ok(restored === 0 ? 'No había nada agotado.' : `${restored} productos disponibles otra vez.`);
}

export async function deleteProductAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const begun = await begin(formData);
  if (isActionState(begun)) return begun;

  const id = idSchema.safeParse(formData.get('id'));
  if (!id.success) return fail('Ese producto ya no existe.');

  deleteProduct(id.data);
  recordAudit({
    actorId: begun.session.user.id,
    actorEmail: begun.session.user.email,
    action: 'product.deleted',
    target: String(id.data),
    ipHash: begun.ipHash,
  });

  revalidatePath('/admin/carta');
  return ok('Producto eliminado.');
}
