'use client';

import { useEffect } from 'react';
import { useQuery } from 'urql';
import { TrackOnlineOrderDocument } from '@/lib/graphql/generated/graphql';
import { useCart } from './cart-state';

/**
 * Renders nothing. Mounted on the customer's menu page so that a stale
 * "open tab" in localStorage gets cleaned up the next time they scan
 * the QR. Without this, a ticket the staff closed on the POS leaves
 * the customer's device thinking they still have a tab open: the
 * checkout page would keep showing "Adding to your order" forever.
 *
 * Behaviour:
 *   - No cached tab → nothing to do.
 *   - Cached tab + the server returns a ticket whose status isn't
 *     OPEN (CLOSED, VOIDED) → drop the tab.
 *   - Cached tab + the server returns null (token not found, e.g.
 *     wiped from the DB) → drop the tab.
 *   - Network error → leave the tab alone. Avoid clearing on transient
 *     failures so the customer doesn't lose their continuation just
 *     because their connection blinked.
 */
export function TableTabValidator(): null {
  const { tableTab, forgetTableTab } = useCart();
  const [{ data, error }] = useQuery({
    query: TrackOnlineOrderDocument,
    variables: { token: tableTab?.trackingToken ?? '' },
    pause: !tableTab,
    requestPolicy: 'network-only',
  });

  useEffect(() => {
    if (!tableTab) return;
    if (error) return;
    if (!data) return;
    const tracking = data.trackOnlineOrder;
    if (!tracking) {
      // Token resolved to nothing — the request was deleted, expired,
      // or the customer cleared their browser data on a different
      // device. Either way the cached tab is unusable.
      forgetTableTab();
      return;
    }
    if (tracking.ticketStatus && tracking.ticketStatus !== 'OPEN') {
      forgetTableTab();
    }
  }, [tableTab, data, error, forgetTableTab]);

  return null;
}
