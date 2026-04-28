'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from 'urql';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
} from '@repo/ui';
import {
  SearchGuestsDocument,
  type SearchGuestsQuery,
} from '@/lib/graphql/generated/graphql';
import { NewGuestDialog } from './new-guest-dialog';

type GuestRow = NonNullable<NonNullable<SearchGuestsQuery['searchGuests']>[number]>;

export interface GuestPickerSelection {
  id: string;
  name: string;
  phone: string | null;
}

interface GuestPickerProps {
  open: boolean;
  onClose: () => void;
  onPick: (guest: GuestPickerSelection) => void;
}

const DEBOUNCE_MS = 200;

/**
 * Reusable typeahead picker. Exposes a single-character search box and
 * fires the `searchGuests` query (debounced 200ms). Empty results show a
 * "Create new guest with name '<query>'" affordance that opens the
 * `<NewGuestDialog>` pre-filled. After a guest is created the dialog
 * closes and `onPick` is fired with the new guest immediately.
 */
export function GuestPicker({
  open,
  onClose,
  onPick,
}: GuestPickerProps): React.JSX.Element {
  const [raw, setRaw] = useState('');
  const [debounced, setDebounced] = useState('');
  const [newGuestOpen, setNewGuestOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset on close so the next open starts blank.
  useEffect(() => {
    if (!open) {
      setRaw('');
      setDebounced('');
    }
  }, [open]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebounced(raw.trim());
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [raw]);

  const skip = debounced.length === 0;
  const [{ data, fetching }] = useQuery({
    query: SearchGuestsDocument,
    variables: { query: debounced, limit: 10 },
    pause: skip,
  });

  const rows: GuestRow[] = (data?.searchGuests ?? []).filter(
    (g): g is GuestRow => g != null && Boolean(g.id),
  );

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pick a guest</DialogTitle>
            <DialogDescription>
              Search by name or phone. If no match, you can create a new guest
              inline.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="Type name or phone…"
            aria-label="Search guests"
            data-input="picker-search"
          />
          <div
            className="flex max-h-72 flex-col gap-1 overflow-y-auto"
            data-testid="guest-picker-results"
          >
            {skip ? (
              <p className="px-1 text-sm text-muted-foreground">
                Start typing to search…
              </p>
            ) : fetching ? (
              <p className="px-1 text-sm text-muted-foreground">Searching…</p>
            ) : rows.length === 0 ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setNewGuestOpen(true)}
                data-action="create-from-picker"
              >
                {`Create new guest with name "${debounced}"`}
              </Button>
            ) : (
              rows.map((row) => (
                <button
                  key={row.id ?? ''}
                  type="button"
                  className="flex w-full items-center justify-between rounded-md border bg-background px-3 py-2 text-left text-sm hover:bg-accent"
                  onClick={() =>
                    onPick({
                      id: row.id ?? '',
                      name: row.name ?? '',
                      phone: row.phone ?? null,
                    })
                  }
                  data-testid={`guest-picker-row-${row.id}`}
                >
                  <span className="font-medium">{row.name ?? '—'}</span>
                  <span className="text-xs text-muted-foreground">
                    {row.phone ?? ''}
                    {row.visitCount && row.visitCount > 0
                      ? ` · ${row.visitCount} visits`
                      : ''}
                  </span>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
      <NewGuestDialog
        open={newGuestOpen}
        initialName={debounced}
        onClose={() => setNewGuestOpen(false)}
        onCreated={(g) => {
          setNewGuestOpen(false);
          if (g.id && g.name) {
            onPick({ id: g.id, name: g.name, phone: g.phone ?? null });
          }
        }}
      />
    </>
  );
}
