'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  children,
}: {
  tenantSlug: string;
  locationSlug: string;
  children: ReactNode;
}): React.JSX.Element {
  const [items, setItems] = useState<CartItem[]>([]);
  const hydratedRef = useRef(false);

  // Hydrate from sessionStorage after mount (avoids SSR mismatch).
  useEffect(() => {
    setItems(readPersisted(tenantSlug, locationSlug));
    hydratedRef.current = true;
  }, [tenantSlug, locationSlug]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    writePersisted(tenantSlug, locationSlug, items);
  }, [tenantSlug, locationSlug, items]);

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
      items,
      addItem,
      removeItem,
      setQuantity,
      clear,
      totalCents,
      itemCount,
    }),
    [tenantSlug, locationSlug, items, addItem, removeItem, setQuantity, clear, totalCents, itemCount],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within <CartProvider>');
  return ctx;
}
