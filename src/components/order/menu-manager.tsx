'use client';

import { AdminForm, ConfirmSubmitButton, FormBanner, SubmitButton } from '@/components/admin/form';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { EmptyState } from '@/components/ui/stat';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';
import {
  clearSoldOutAction,
  createCategoryAction,
  createProductAction,
  deleteCategoryAction,
  deleteProductAction,
  toggleSoldOutAction,
  updateCategoryAction,
  updateProductAction,
} from '@/server/actions/order-actions';
import type { Category, Product } from '@/types/domain';

/**
 * Menu management for the counter tablet.
 *
 * The one control that matters during service is "Agotado hoy": it is a single
 * large tap that removes an item from every phone in the car park instantly. It
 * gets more visual weight than editing a price, because it is used a hundred
 * times more often.
 */
export function MenuManager({
  categories,
  products,
  currency,
  csrfToken,
}: {
  categories: readonly Category[];
  products: readonly Product[];
  currency: string;
  csrfToken: string;
}) {
  const soldOutCount = products.filter((product) => product.isSoldOut).length;

  return (
    <div className="flex flex-col gap-6">
      {soldOutCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-caution-soft p-4">
          <p className="type-body text-caution">
            {soldOutCount} {soldOutCount === 1 ? 'producto agotado' : 'productos agotados'} hoy.
          </p>
          <AdminForm action={clearSoldOutAction} csrfToken={csrfToken}>
            {() => <SubmitButton variant="secondary" size="sm">Todo disponible otra vez</SubmitButton>}
          </AdminForm>
        </div>
      ) : null}

      <Card>
        <CardHeader title="Nueva categoría" description="Pan, Bollería, Tartas, Café…" />
        <CardBody className="pt-2">
          <AdminForm action={createCategoryAction} csrfToken={csrfToken} resetOnSuccess>
            {(state) => (
              <>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <Field label="Nombre" htmlFor="new-category" error={state.fieldErrors?.name}>
                      <Input id="new-category" name="name" required maxLength={60} placeholder="Bollería" />
                    </Field>
                  </div>
                  <SubmitButton pendingLabel="Creando…">Crear</SubmitButton>
                </div>
                <FormBanner state={state} />
              </>
            )}
          </AdminForm>
        </CardBody>
      </Card>

      {categories.length === 0 ? (
        <EmptyState
          title="La carta está vacía"
          description="Crea una categoría y añade tus primeros productos. Los clientes no verán nada hasta entonces."
        />
      ) : null}

      {categories.map((category) => {
        const items = products.filter((product) => product.categoryId === category.id);

        return (
          <Card key={category.id}>
            <CardBody className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 border-b border-line/60 pb-4 sm:flex-row sm:items-end">
                <AdminForm
                  action={updateCategoryAction}
                  csrfToken={csrfToken}
                  className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-end"
                >
                  {(state) => (
                    <>
                      <input type="hidden" name="id" value={category.id} />
                      <div className="flex-1">
                        <Field
                          label="Categoría"
                          htmlFor={`category-${category.id}`}
                          error={state.fieldErrors?.name}
                        >
                          <Input
                            id={`category-${category.id}`}
                            name="name"
                            defaultValue={category.name}
                            required
                            maxLength={60}
                          />
                        </Field>
                      </div>
                      <label className="flex items-center gap-2 pb-2.5">
                        <input
                          type="checkbox"
                          name="isActive"
                          value="true"
                          defaultChecked={category.isActive}
                          className="h-4 w-4 accent-[var(--brand)]"
                        />
                        <span className="type-caption text-ink">Visible</span>
                      </label>
                      <SubmitButton variant="secondary" size="sm">
                        Guardar
                      </SubmitButton>
                      <FormBanner state={state} />
                    </>
                  )}
                </AdminForm>

                <AdminForm action={deleteCategoryAction} csrfToken={csrfToken}>
                  {() => (
                    <>
                      <input type="hidden" name="id" value={category.id} />
                      <ConfirmSubmitButton
                        confirmMessage={`¿Eliminar "${category.name}" y sus ${items.length} productos? Los pedidos antiguos se conservan.`}
                        pendingLabel="Eliminando…"
                      >
                        Eliminar
                      </ConfirmSubmitButton>
                    </>
                  )}
                </AdminForm>
              </div>

              <ul className="flex flex-col gap-2.5">
                {items.map((product) => (
                  <li key={product.id}>
                    <ProductRow product={product} currency={currency} csrfToken={csrfToken} />
                  </li>
                ))}
              </ul>

              <NewProductForm categoryId={category.id} csrfToken={csrfToken} />
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}

function ProductRow({
  product,
  currency,
  csrfToken,
}: {
  product: Product;
  currency: string;
  csrfToken: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-field bg-surface-sunken p-3 lg:flex-row lg:items-end',
        product.isSoldOut && 'ring-1 ring-caution/40',
      )}
    >
      <AdminForm
        action={updateProductAction}
        csrfToken={csrfToken}
        className="flex flex-1 flex-col gap-3 lg:flex-row lg:items-end"
      >
        {(state) => (
          <>
            <input type="hidden" name="id" value={product.id} />
            <input type="hidden" name="categoryId" value={product.categoryId} />
            <input type="hidden" name="isActive" value={product.isActive ? 'true' : 'false'} />

            <div className="w-16">
              <Field label="Icono" htmlFor={`emoji-${product.id}`}>
                <Input
                  id={`emoji-${product.id}`}
                  name="emoji"
                  defaultValue={product.emoji}
                  maxLength={8}
                  className="text-center text-lg"
                />
              </Field>
            </div>

            <div className="flex-1">
              <Field label="Nombre" htmlFor={`pname-${product.id}`} error={state.fieldErrors?.name}>
                <Input
                  id={`pname-${product.id}`}
                  name="name"
                  defaultValue={product.name}
                  required
                  maxLength={80}
                />
              </Field>
            </div>

            <div className="flex-1">
              <Field label="Descripción" htmlFor={`pdesc-${product.id}`}>
                <Input
                  id={`pdesc-${product.id}`}
                  name="description"
                  defaultValue={product.description}
                  maxLength={160}
                />
              </Field>
            </div>

            <div className="w-28">
              <Field
                label="Precio"
                htmlFor={`pprice-${product.id}`}
                error={state.fieldErrors?.priceCents}
              >
                <Input
                  id={`pprice-${product.id}`}
                  name="price"
                  inputMode="decimal"
                  defaultValue={(product.priceCents / 100).toFixed(2)}
                  required
                />
              </Field>
            </div>

            <SubmitButton variant="secondary" size="sm">
              Guardar
            </SubmitButton>
            <FormBanner state={state} />
          </>
        )}
      </AdminForm>

      <div className="flex items-center gap-2">
        {/*
          The service-time control. A whole button rather than a checkbox,
          because it is tapped mid-rush with one hand.
        */}
        <AdminForm action={toggleSoldOutAction} csrfToken={csrfToken}>
          {() => (
            <>
              <input type="hidden" name="id" value={product.id} />
              <input type="hidden" name="soldOut" value={product.isSoldOut ? 'false' : 'true'} />
              <SubmitButton
                variant={product.isSoldOut ? 'secondary' : 'danger'}
                size="sm"
                pendingLabel="…"
              >
                {product.isSoldOut ? 'Reponer' : 'Agotado hoy'}
              </SubmitButton>
            </>
          )}
        </AdminForm>

        <AdminForm action={deleteProductAction} csrfToken={csrfToken}>
          {() => (
            <>
              <input type="hidden" name="id" value={product.id} />
              <ConfirmSubmitButton
                confirmMessage={`¿Eliminar "${product.name}"? Los pedidos antiguos lo conservan.`}
                pendingLabel="…"
              >
                Eliminar
              </ConfirmSubmitButton>
            </>
          )}
        </AdminForm>

        <span className="type-numeric type-caption ml-auto font-semibold lg:ml-0">
          {formatMoney(product.priceCents, currency)}
        </span>
      </div>
    </div>
  );
}

function NewProductForm({ categoryId, csrfToken }: { categoryId: number; csrfToken: string }) {
  return (
    <AdminForm action={createProductAction} csrfToken={csrfToken} resetOnSuccess>
      {(state) => (
        <>
          <div className="flex flex-col gap-3 rounded-field border border-dashed border-line p-3 lg:flex-row lg:items-end">
            <input type="hidden" name="categoryId" value={categoryId} />
            <input type="hidden" name="isActive" value="true" />

            <div className="w-16">
              <Field label="Icono" htmlFor={`new-emoji-${categoryId}`}>
                <Input
                  id={`new-emoji-${categoryId}`}
                  name="emoji"
                  maxLength={8}
                  placeholder="🥐"
                  className="text-center text-lg"
                />
              </Field>
            </div>

            <div className="flex-1">
              <Field
                label="Producto nuevo"
                htmlFor={`new-name-${categoryId}`}
                error={state.fieldErrors?.name}
              >
                <Input
                  id={`new-name-${categoryId}`}
                  name="name"
                  maxLength={80}
                  placeholder="Croissant de mantequilla"
                  required
                />
              </Field>
            </div>

            <div className="flex-1">
              <Field label="Descripción" htmlFor={`new-desc-${categoryId}`}>
                <Input
                  id={`new-desc-${categoryId}`}
                  name="description"
                  maxLength={160}
                  placeholder="Hojaldre 48 h"
                />
              </Field>
            </div>

            <div className="w-28">
              <Field
                label="Precio"
                htmlFor={`new-price-${categoryId}`}
                error={state.fieldErrors?.priceCents}
                hint="1,90"
              >
                <Input
                  id={`new-price-${categoryId}`}
                  name="price"
                  inputMode="decimal"
                  placeholder="1,90"
                  required
                />
              </Field>
            </div>

            <SubmitButton pendingLabel="Añadiendo…">Añadir</SubmitButton>
          </div>
          <FormBanner state={state} />
        </>
      )}
    </AdminForm>
  );
}
