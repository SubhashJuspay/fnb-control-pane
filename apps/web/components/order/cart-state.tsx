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
  /**
   * Kiosk mode: when true (URL `?kiosk=1`), the drawer collects payment via
   * a paired POS terminal before submitting. The submit mutation sets
   * `paymentMode: PAY_AT_KIOSK` and the kiosk shows a "Reading card…"
   * overlay until the terminal returns a result.
   */
  kioskMode: boolean;
  items: CartItem[];
}

/**
 * Per-table "open tab" memory, persisted in localStorage and keyed by
 * (tenant, location, table). Lets a returning customer skip the
 * name/phone form and resume tracking the same ticket on subsequent
 * orders. Cleared when the ticket closes.
 *
 * Only used for dine-in (tableSlug present) — pickup orders are
 * single-shot and don't benefit from this.
 */
export interface CustomerInfo {
  customerName: string;
  customerPhone: string;
}

export interface TableTabState {
  /** Captured the first time the customer submits — reused on the next. */
  customer: CustomerInfo;
  /** Most recent tracking token; the menu page uses this to show
   *  a "you have an open tab" banner + deep-link to /track/. */
  trackingToken: string;
  /** Short order number from the open ticket — purely for UI affordance. */
  shortNumber: number;
}

export interface CartActions {
  addItem: (item: Omit<CartItem, 'lineId'>) => void;
  removeItem: (lineId: string) => void;
  setQuantity: (lineId: string, quantity: number) => void;
  clear: () => void;
  /** Persist the customer's details + the latest tracking token for the
   *  current table. No-op when there is no tableSlug. */
  rememberTableTab: (state: TableTabState) => void;
  /** Wipe the per-table memory — called when the ticket closes or a
   *  fresh tab is needed. No-op when there is no tableSlug. */
  forgetTableTab: () => void;
}

interface CartContextValue extends CartState, CartActions {
  totalCents: number;
  itemCount: number;
  /** Persisted "open tab" memory for the current table, or null when
   *  none yet exists / pickup mode. */
  tableTab: TableTabState | null;
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

/**
 * Persistent (localStorage, *not* sessionStorage) key for the per-table
 * tab memory. Survives tab close + browser restart so a customer can
 * close their phone between courses and resume on the same tab.
 */
function tableTabKey(
  tenantSlug: string,
  locationSlug: string,
  tableSlug: string,
): string {
  return `fnb.table-tab.${tenantSlug}.${locationSlug}.${tableSlug}`;
}

function readTableTab(
  tenantSlug: string,
  locationSlug: string,
  tableSlug: string | null,
): TableTabState | null {
  if (!tableSlug) return null;
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(
      tableTabKey(tenantSlug, locationSlug, tableSlug),
    );
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TableTabState>;
    if (
      parsed == null ||
      typeof parsed !== 'object' ||
      typeof parsed.trackingToken !== 'string' ||
      typeof parsed.shortNumber !== 'number' ||
      parsed.customer == null ||
      typeof parsed.customer !== 'object' ||
      typeof parsed.customer.customerName !== 'string' ||
      typeof parsed.customer.customerPhone !== 'string'
    ) {
      return null;
    }
    return {
      customer: parsed.customer,
      trackingToken: parsed.trackingToken,
      shortNumber: parsed.shortNumber,
    };
  } catch {
    return null;
  }
}

function writeTableTab(
  tenantSlug: string,
  locationSlug: string,
  tableSlug: string | null,
  state: TableTabState | null,
): void {
  if (!tableSlug) return;
  if (typeof window === 'undefined') return;
  const key = tableTabKey(tenantSlug, locationSlug, tableSlug);
  try {
    if (state === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, JSON.stringify(state));
    }
  } catch {
    // ignore quota / privacy-mode errors
  }
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
  kioskMode = false,
  children,
}: {
  tenantSlug: string;
  locationSlug: string;
  tableSlug?: string | null;
  kioskMode?: boolean;
  children: ReactNode;
}): React.JSX.Element {
  const [items, setItems] = useState<CartItem[]>([]);
  const [tableTab, setTableTab] = useState<TableTabState | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from session/localStorage after mount (avoids SSR mismatch).
  // The `hydrated` state flips once we've read; consumers that show an
  // "empty cart" UI should wait for this to avoid flashing on every
  // navigation (the SPA navigation re-mounts this provider, so each page
  // transition would otherwise show a one-frame "Your cart is empty"
  // before the read completes).
  useEffect(() => {
    setItems(readPersisted(tenantSlug, locationSlug));
    setTableTab(readTableTab(tenantSlug, locationSlug, tableSlug));
    setHydrated(true);
  }, [tenantSlug, locationSlug, tableSlug]);

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

  const rememberTableTab = useCallback(
    (state: TableTabState): void => {
      setTableTab(state);
      writeTableTab(tenantSlug, locationSlug, tableSlug, state);
    },
    [tenantSlug, locationSlug, tableSlug],
  );
  const forgetTableTab = useCallback((): void => {
    setTableTab(null);
    writeTableTab(tenantSlug, locationSlug, tableSlug, null);
  }, [tenantSlug, locationSlug, tableSlug]);

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
      kioskMode,
      items,
      addItem,
      removeItem,
      setQuantity,
      clear,
      rememberTableTab,
      forgetTableTab,
      tableTab,
      totalCents,
      itemCount,
      hydrated,
    }),
    [
      tenantSlug,
      locationSlug,
      tableSlug,
      kioskMode,
      items,
      addItem,
      removeItem,
      setQuantity,
      clear,
      rememberTableTab,
      forgetTableTab,
      tableTab,
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
