'use client';

import { useQuery } from 'urql';
import { ViewerDocument } from '@/lib/graphql/generated/graphql';

/**
 * Convenience hook that returns the currently signed-in viewer's id, or null
 * while the viewer query is in flight or unauthenticated. Consumed by client
 * components that need to disable self-actions (e.g. "remove me").
 */
export function useViewerId(): string | null {
  const [{ data }] = useQuery({
    query: ViewerDocument,
    requestPolicy: 'cache-first',
  });
  return data?.viewer?.id ?? null;
}
