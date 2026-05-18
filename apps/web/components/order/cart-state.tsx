'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export interface CartModifierSnapshot {
  id: string;
  name: string;
  priceDeltaCents: number;
}

export interface CartItem {
  /** Stable client-side line id (uuid-ish) — distinct from menuItemId. */
  lineId: string;
  menuItemId: string;
  name: string;
  unitPriceCents: number;
  modifiersTotalCents: number;
  quantity: number;
  modifierIds: string[];
  modifiers: CartModifierSnapshot[];
  notes?: string;
}

export interface CartState {
  tenantSlug: string;
  locationSlug: string;
  /**
   * QR-at-table slug, derived from the `?table=` search param on the public
   * order page. When set, the order is dine-in (not pickup) — the drawer
   * surfaces this in its UI and forwards it to `submitOnlineOrder`.
   */
  tableSlug: string | null;
  items: CartItem[];
}

export interface CartActions {
  addItem: (item: Omit<CartItem, 'lineId'>) => void;
  removeItem: (lineId: string) => void;
  setQuantity: (lineId: string, quantity: number) => void;
  clear: () => void;
}

interface CartContextValue extends CartState, CartActions {
  totalCents: number;
  itemCount: number;
  /**
   * True once we've finished reading from sessionStorage on mount. UIs that
   * branch on `items.length === 0` should defer rendering an empty state
   * until this flag flips, otherwise they flash the empty UI on the first
   * paint of every navigation.
   */
  hydrated: boolean;
}

const CartContext = createContext<CartContextValue | null>(null);

function storageKey(tenantSlug: string, locationSlug: string): string {
  return `fnb.online-cart.${tenantSlug}.${locationSlug}`;
}

function makeLineId(): string {
  // Lightweight unique id; doesn't have to be a real UUID — purely client-side.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readPersisted(tenantSlug: string, locationSlug: string): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(storageKey(tenantSlug, locationSlug));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CartItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (i): i is CartItem =>
        i != null &&
        typeof i.lineId === 'string' &&
        typeof i.menuItemId === 'string' &&
        typeof i.quantity === 'number',
    );
  } catch {
    return [];
  }
}

function writePersisted(tenantSlug: string, locationSlug: string, items: CartItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(storageKey(tenantSlug, locationSlug), JSON.stringify(items));
  } catch {
    // ignore quota errors
  }
}

export function CartProvider({
  tenantSlug,
  locationSlug,
  tableSlug = null,
  children,
}: {
  tenantSlug: string;
  locationSlug: string;
  tableSlug?: string | null;
  children: ReactNode;
}): React.JSX.Element {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from sessionStorage after mount (avoids SSR mismatch). The
  // `hydrated` state flips once we've read; consumers that show an "empty
  // cart" UI should wait for this to avoid flashing on every navigation
  // (the SPA navigation re-mounts this provider, so each page transition
  // would otherwise show a one-frame "Your cart is empty" before the read
  // completes).
  useEffect(() => {
    setItems(readPersisted(tenantSlug, locationSlug));
    setHydrated(true);
  }, [tenantSlug, locationSlug]);

  // Gate persistence on the `hydrated` STATE (not a ref). Using a ref here
  // races in React strict-mode dev: a synchronous `ref = true` inside the
  // hydration effect lets the persist effect — which runs in the same
  // effect phase right after — fire with `items: []` (the pre-hydration
  // value still captured in its closure), wiping sessionStorage. Gating
  // on state means the persist effect only sees `hydrated: true` after
  // React has committed the hydrated `items` to the next render.
  useEffect(() => {
    if (!hydrated) return;
    writePersisted(tenantSlug, locationSlug, items);
  }, [hydrated, tenantSlug, locationSlug, items]);

  const addItem = useCallback((item: Omit<CartItem, 'lineId'>): void => {
    setItems((prev) => [...prev, { ...item, lineId: makeLineId() }]);
  }, []);
  const removeItem = useCallback((lineId: string): void => {
    setItems((prev) => prev.filter((i) => i.lineId !== lineId));
  }, []);
  const setQuantity = useCallback((lineId: string, quantity: number): void => {
    setItems((prev) =>
      prev
        .map((i) => (i.lineId === lineId ? { ...i, quantity: Math.max(0, quantity) } : i))
        .filter((i) => i.quantity > 0),
    );
  }, []);
  const clear = useCallback((): void => setItems([]), []);

  const totalCents = useMemo(
    () =>
      items.reduce(
        (sum, i) => sum + (i.unitPriceCents + i.modifiersTotalCents) * i.quantity,
        0,
      ),
    [items],
  );
  const itemCount = useMemo(
    () => items.reduce((sum, i) => sum + i.quantity, 0),
    [items],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      tenantSlug,
      locationSlug,
      tableSlug,
      items,
      addItem,
      removeItem,
      setQuantity,
      clear,
      totalCents,
      itemCount,
      hydrated,
    }),
    [
      tenantSlug,
      locationSlug,
      tableSlug,
      items,
      addItem,
      removeItem,
      setQuantity,
      clear,
      totalCents,
      itemCount,
      hydrated,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within <CartProvider>');
  return ctx;
}
