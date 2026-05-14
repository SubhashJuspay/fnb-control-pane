'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery } from 'urql';
import { Button, MoneyInput, formatMoney } from '@repo/ui';
import { toast } from 'sonner';
import {
  CashDrawerHistoryDocument,
  CloseCashDrawerDocument,
  CurrentCashDrawerDocument,
  OpenCashDrawerDocument,
  RecordCashMovementDocument,
  type CashDrawerHistoryQuery,
  type CashMovementKind,
  type CurrentCashDrawerQuery,
} from '@/lib/graphql/generated/graphql';

export interface CashDrawerWorkspaceProps {
  locationName: string;
  currency: string;
  /** Manager+ can record DEPOSIT (cash → safe). Staff cannot. */
  canDeposit: boolean;
}

type Session = NonNullable<CurrentCashDrawerQuery['currentCashDrawer']>;
type Movement = NonNullable<NonNullable<Session['movements']>[number]>;
type HistoryRow = NonNullable<CashDrawerHistoryQuery['cashDrawerHistory']>[number];

const KIND_LABEL: Record<string, string> = {
  PAY_IN: 'Pay-in',
  PAY_OUT: 'Pay-out',
  DEPOSIT: 'Deposit',
  SALE_CASH: 'Cash sale',
  REFUND_CASH: 'Cash refund',
};

const KIND_PILL: Record<string, string> = {
  PAY_IN: 'bg-success-container text-on-success-container',
  PAY_OUT: 'bg-warning-container text-on-warning-container',
  DEPOSIT: 'bg-secondary-container text-on-secondary-container',
  SALE_CASH: 'bg-primary-container text-on-primary-container',
  REFUND_CASH: 'bg-error-container text-on-error-container',
};

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return '—';
  }
}

export function CashDrawerWorkspace({
  locationName,
  currency,
  canDeposit,
}: CashDrawerWorkspaceProps): React.JSX.Element {
  const [{ data, fetching }, refetchCurrent] = useQuery({
    query: CurrentCashDrawerDocument,
    requestPolicy: 'cache-and-network',
  });
  const [{ data: histData }, refetchHistory] = useQuery({
    query: CashDrawerHistoryDocument,
    requestPolicy: 'cache-and-network',
  });

  const session = data?.currentCashDrawer ?? null;
  const history = histData?.cashDrawerHistory ?? [];

  const refreshAll = (): void => {
    refetchCurrent({ requestPolicy: 'network-only' });
    refetchHistory({ requestPolicy: 'network-only' });
  };

  return (
    <div className="flex flex-col gap-gutter px-container-margin py-gutter">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-headline-md font-bold text-on-surface">
          Cash drawer · {locationName}
        </h1>
        <p className="text-body-staff text-on-surface-variant">
          Track starting cash, in-shift pay-ins / pay-outs / deposits, and the
          end-of-shift count.
        </p>
      </header>

      {fetching && !session && !history.length ? (
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-card-padding text-body-staff text-on-surface-variant shadow-card-soft">
          Loading…
        </div>
      ) : session ? (
        <ActiveSession
          session={session}
          currency={currency}
          canDeposit={canDeposit}
          onChanged={refreshAll}
        />
      ) : (
        <OpenForm onOpened={refreshAll} />
      )}

      <HistoryList history={history} currency={currency} />
    </div>
  );
}

// ── Open new session ──────────────────────────────────

function OpenForm({
  onOpened,
}: {
  onOpened: () => void;
}): React.JSX.Element {
  const [startingCashCents, setStartingCashCents] = useState<number>(0);
  const [note, setNote] = useState<string>('');
  const [{ fetching }, openDrawer] = useMutation(OpenCashDrawerDocument);

  const onSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (startingCashCents < 0) return;
    const result = await openDrawer({ startingCashCents, note: note || null });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Cash drawer opened');
    onOpened();
  };

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-card-padding shadow-card-soft"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="material-symbols-outlined text-[28px] text-primary"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          point_of_sale
        </span>
        <div>
          <h2 className="font-display text-headline-md font-semibold text-on-surface">
            No drawer open
          </h2>
          <p className="text-body-staff text-on-surface-variant">
            Enter the starting cash to begin a new shift.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
            Starting cash
          </span>
          <MoneyInput
            value={startingCashCents}
            onChange={(v) => setStartingCashCents(v ?? 0)}
            data-testid="cash-drawer-starting-cash"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
            Note (optional)
          </span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Friday lunch shift"
            className="h-12 rounded-lg border border-outline-variant bg-surface-container-lowest px-4 text-body-staff text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </label>
      </div>
      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={fetching}
          className="bg-primary text-on-primary hover:opacity-90"
        >
          {fetching ? 'Opening…' : 'Open drawer'}
        </Button>
      </div>
    </form>
  );
}

// ── Active session ────────────────────────────────────

function ActiveSession({
  session,
  currency,
  canDeposit,
  onChanged,
}: {
  session: Session;
  currency: string;
  canDeposit: boolean;
  onChanged: () => void;
}): React.JSX.Element {
  // Wrap in useMemo so the array reference is stable across renders — the
  // expected-cash useMemo below depends on `movements`, so an unmemoised
  // `session.movements ?? []` would force a recompute on every parent re-render.
  const movements = useMemo(
    () => session.movements ?? [],
    [session.movements],
  );
  const startingCash = session.startingCashCents ?? 0;
  const expected = useMemo(() => {
    let sum = startingCash;
    for (const m of movements) {
      const amt = m.amountCents ?? 0;
      switch (m.kind) {
        case 'PAY_IN':
        case 'SALE_CASH':
          sum += amt;
          break;
        case 'PAY_OUT':
        case 'DEPOSIT':
        case 'REFUND_CASH':
          sum -= amt;
          break;
      }
    }
    return sum;
  }, [startingCash, movements]);

  return (
    <div className="grid grid-cols-1 gap-gutter lg:grid-cols-3">
      <div className="lg:col-span-2 flex flex-col gap-gutter">
        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-card-padding shadow-card-soft">
          <header className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
                Open shift
              </p>
              <h2 className="font-display text-headline-md font-semibold text-on-surface">
                Started {formatTime(session.openedAt)}
              </h2>
              <p className="text-body-staff text-on-surface-variant">
                Opened by {session.openedBy?.name ?? session.openedBy?.email ?? '—'}
              </p>
            </div>
            <span
              className="rounded-full bg-success-container px-3 py-1 font-status-pill text-status-pill uppercase tracking-wider text-on-success-container"
              data-testid="cash-drawer-status"
            >
              Open
            </span>
          </header>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="Starting cash" value={formatMoney(startingCash, currency)} />
            <Stat label="Movements" value={String(movements.length)} />
            <Stat
              label="Expected now"
              value={formatMoney(expected, currency)}
              accent
            />
          </dl>
        </section>

        <MovementsList movements={movements} currency={currency} />
      </div>

      <div className="flex flex-col gap-gutter">
        <RecordMovementForm
          sessionId={session.id ?? ''}
          canDeposit={canDeposit}
          onChanged={onChanged}
        />
        <CloseSessionForm
          sessionId={session.id ?? ''}
          expectedCents={expected}
          currency={currency}
          onClosed={onChanged}
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-outline-variant bg-surface-container-low p-3">
      <dt className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
        {label}
      </dt>
      <dd
        className={[
          'font-display tabular-nums',
          accent
            ? 'text-headline-md font-bold text-primary'
            : 'text-body-customer font-semibold text-on-surface',
        ].join(' ')}
      >
        {value}
      </dd>
    </div>
  );
}

function MovementsList({
  movements,
  currency,
}: {
  movements: Movement[];
  currency: string;
}): React.JSX.Element {
  if (movements.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-outline-variant bg-surface-container-low p-card-padding text-center text-body-staff text-on-surface-variant">
        No movements yet. Record pay-ins, pay-outs and deposits on the right.
      </section>
    );
  }
  return (
    <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-card-soft">
      <header className="border-b border-outline-variant px-card-padding py-3">
        <h3 className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
          Shift movements
        </h3>
      </header>
      <ul className="divide-y divide-outline-variant/40">
        {movements.map((m) => {
          const kind = m.kind ?? 'PAY_IN';
          const amount = m.amountCents ?? 0;
          const isPositive = kind === 'PAY_IN' || kind === 'SALE_CASH';
          return (
            <li
              key={m.id}
              className="flex items-center justify-between gap-3 px-card-padding py-3"
            >
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 font-status-pill text-status-pill uppercase tracking-wider ${KIND_PILL[kind] ?? ''}`}
                  >
                    {KIND_LABEL[kind] ?? kind}
                  </span>
                  <span className="text-body-staff text-on-surface-variant">
                    {formatTime(m.createdAt)}
                  </span>
                </div>
                {m.note ? (
                  <p className="mt-1 text-body-staff italic text-on-surface-variant">
                    {m.note}
                  </p>
                ) : null}
                {m.createdBy ? (
                  <p className="mt-0.5 text-status-pill text-on-surface-variant">
                    by {m.createdBy.name ?? m.createdBy.email}
                  </p>
                ) : null}
              </div>
              <span
                className={[
                  'font-display font-bold tabular-nums',
                  isPositive ? 'text-success' : 'text-on-surface',
                ].join(' ')}
              >
                {isPositive ? '+' : '−'}
                {formatMoney(amount, currency)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function RecordMovementForm({
  sessionId,
  canDeposit,
  onChanged,
}: {
  sessionId: string;
  canDeposit: boolean;
  onChanged: () => void;
}): React.JSX.Element {
  const [kind, setKind] = useState<'PAY_IN' | 'PAY_OUT' | 'DEPOSIT'>('PAY_IN');
  const [amount, setAmount] = useState<number>(0);
  const [note, setNote] = useState('');
  const [{ fetching }, record] = useMutation(RecordCashMovementDocument);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (amount <= 0) return;
    const result = await record({
      sessionId,
      kind: kind as CashMovementKind,
      amountCents: amount,
      note: note || null,
    });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success(`${KIND_LABEL[kind]} recorded`);
    setAmount(0);
    setNote('');
    onChanged();
  };

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-card-padding shadow-card-soft"
    >
      <h3 className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
        Record movement
      </h3>
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            { key: 'PAY_IN' as const, label: 'Pay in' },
            { key: 'PAY_OUT' as const, label: 'Pay out' },
            { key: 'DEPOSIT' as const, label: 'Deposit' },
          ] satisfies Array<{ key: 'PAY_IN' | 'PAY_OUT' | 'DEPOSIT'; label: string }>
        ).map((opt) => {
          const disabled = opt.key === 'DEPOSIT' && !canDeposit;
          const active = kind === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              disabled={disabled}
              onClick={() => setKind(opt.key)}
              className={[
                'rounded-lg px-3 py-2 text-body-staff font-semibold transition-colors',
                active
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high',
                disabled ? 'cursor-not-allowed opacity-50' : '',
              ].join(' ')}
              title={
                disabled
                  ? 'Only managers can record deposits to the safe.'
                  : undefined
              }
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <label className="flex flex-col gap-2">
        <span className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
          Amount
        </span>
        <MoneyInput value={amount} onChange={(v) => setAmount(v ?? 0)} />
      </label>
      <label className="flex flex-col gap-2">
        <span className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
          Reason (optional)
        </span>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={
            kind === 'PAY_OUT'
              ? 'e.g. produce run, tip-out'
              : kind === 'DEPOSIT'
                ? 'e.g. afternoon drop to safe'
                : 'e.g. opening float top-up'
          }
          className="h-12 rounded-lg border border-outline-variant bg-surface-container-lowest px-4 text-body-staff text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </label>
      <Button
        type="submit"
        disabled={fetching || amount <= 0}
        className="bg-primary text-on-primary hover:opacity-90"
      >
        {fetching
          ? 'Recording…'
          : `Record ${(KIND_LABEL[kind] ?? kind).toLowerCase()}`}
      </Button>
    </form>
  );
}

function CloseSessionForm({
  sessionId,
  expectedCents,
  currency,
  onClosed,
}: {
  sessionId: string;
  expectedCents: number;
  currency: string;
  onClosed: () => void;
}): React.JSX.Element {
  const [counted, setCounted] = useState<number>(0);
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [{ fetching }, close] = useMutation(CloseCashDrawerDocument);

  const variance = counted - expectedCents;
  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!confirm) {
      setConfirm(true);
      return;
    }
    const result = await close({
      sessionId,
      countedCashCents: counted,
      note: note || null,
    });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    if (variance === 0) toast.success('Drawer closed — perfect count');
    else
      toast.success(
        `Drawer closed — ${variance > 0 ? 'over' : 'short'} ${formatMoney(Math.abs(variance), currency)}`,
      );
    setCounted(0);
    setNote('');
    setConfirm(false);
    onClosed();
  };

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-card-padding shadow-card-soft"
    >
      <h3 className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
        Close shift
      </h3>
      <p className="text-body-staff text-on-surface-variant">
        Expected:{' '}
        <span className="font-bold tabular-nums text-on-surface">
          {formatMoney(expectedCents, currency)}
        </span>
      </p>
      <label className="flex flex-col gap-2">
        <span className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
          Counted cash
        </span>
        <MoneyInput value={counted} onChange={(v) => setCounted(v ?? 0)} />
      </label>
      {counted > 0 ? (
        <p
          className={[
            'rounded-lg px-3 py-2 text-body-staff font-semibold',
            variance === 0
              ? 'bg-success-container text-on-success-container'
              : variance > 0
                ? 'bg-warning-container text-on-warning-container'
                : 'bg-error-container text-on-error-container',
          ].join(' ')}
        >
          Variance:{' '}
          <span className="tabular-nums">
            {variance >= 0 ? '+' : '−'}
            {formatMoney(Math.abs(variance), currency)}
          </span>
          {variance === 0 ? ' · perfect count' : variance > 0 ? ' · over' : ' · short'}
        </p>
      ) : null}
      <label className="flex flex-col gap-2">
        <span className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
          Note (optional)
        </span>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Explanation for variance, etc."
          className="h-12 rounded-lg border border-outline-variant bg-surface-container-lowest px-4 text-body-staff text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </label>
      <Button
        type="submit"
        disabled={fetching || counted < 0}
        className={
          confirm
            ? 'bg-error text-on-error hover:opacity-90'
            : 'bg-primary text-on-primary hover:opacity-90'
        }
      >
        {fetching ? 'Closing…' : confirm ? 'Confirm close drawer' : 'Close drawer'}
      </Button>
      {confirm ? (
        <button
          type="button"
          onClick={() => setConfirm(false)}
          className="text-body-staff text-on-surface-variant hover:underline"
        >
          Cancel
        </button>
      ) : null}
    </form>
  );
}

// ── History ───────────────────────────────────────────

function HistoryList({
  history,
  currency,
}: {
  history: readonly HistoryRow[];
  currency: string;
}): React.JSX.Element | null {
  if (!history || history.length === 0) return null;
  return (
    <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-card-soft">
      <header className="flex items-center justify-between gap-3 border-b border-outline-variant px-card-padding py-3">
        <h2 className="font-display text-headline-md font-semibold text-on-surface">
          Past shifts
        </h2>
        <span className="font-status-pill text-status-pill text-on-surface-variant">
          last {history.length}
        </span>
      </header>
      <ul className="divide-y divide-outline-variant/40">
        {history.map((s) => {
          const variance = s.varianceCents ?? 0;
          const pill =
            variance === 0
              ? 'bg-success-container text-on-success-container'
              : variance > 0
                ? 'bg-warning-container text-on-warning-container'
                : 'bg-error-container text-on-error-container';
          return (
            <li
              key={s.id}
              className="grid grid-cols-1 gap-1 px-card-padding py-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center"
            >
              <div className="flex flex-col">
                <span className="text-body-customer font-semibold text-on-surface">
                  {formatTime(s.openedAt)}
                </span>
                <span className="text-status-pill text-on-surface-variant">
                  {s.openedBy?.name ?? '—'}
                  {s.closedBy?.name && s.closedBy.id !== s.openedBy?.id
                    ? ` → ${s.closedBy.name}`
                    : ''}
                </span>
              </div>
              <span className="font-status-pill text-status-pill text-on-surface-variant sm:text-right">
                Start{' '}
                <span className="font-bold tabular-nums text-on-surface">
                  {formatMoney(s.startingCashCents ?? 0, currency)}
                </span>
              </span>
              <span className="font-status-pill text-status-pill text-on-surface-variant sm:text-right">
                Counted{' '}
                <span className="font-bold tabular-nums text-on-surface">
                  {s.countedCashCents != null
                    ? formatMoney(s.countedCashCents, currency)
                    : '—'}
                </span>
              </span>
              <span
                className={`rounded-full px-2.5 py-1 text-center font-status-pill text-status-pill uppercase tracking-wider sm:text-right ${pill}`}
              >
                {variance >= 0 ? '+' : '−'}
                {formatMoney(Math.abs(variance), currency)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
