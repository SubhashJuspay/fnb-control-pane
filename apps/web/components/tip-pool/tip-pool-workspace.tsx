'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery } from 'urql';
import { Button, formatMoney } from '@repo/ui';
import { toast } from 'sonner';
import {
  ArchiveTipPoolRuleDocument,
  DailyTipAllocationsDocument,
  JobRolesDocument,
  RecomputeTipPoolDocument,
  TipPoolRulesDocument,
  UpsertTipPoolRuleDocument,
  type DailyTipAllocationsQuery,
  type JobRolesQuery,
  type TipPoolRulesQuery,
} from '@/lib/graphql/generated/graphql';

export interface TipPoolWorkspaceProps {
  locationName: string;
  currency: string;
}

type Rule = NonNullable<TipPoolRulesQuery['tipPoolRules']>[number];
type JobRole = NonNullable<JobRolesQuery['jobRoles']>[number];
type Allocation = NonNullable<
  DailyTipAllocationsQuery['dailyTipAllocations']
>[number];

interface WeightEntry {
  jobRoleId: string;
  weight: number;
}

function parseWeights(raw: unknown): WeightEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      if (!r || typeof r !== 'object') return null;
      const o = r as Record<string, unknown>;
      const jobRoleId = typeof o.jobRoleId === 'string' ? o.jobRoleId : null;
      const weight = typeof o.weight === 'number' ? o.weight : null;
      if (!jobRoleId || weight === null) return null;
      return { jobRoleId, weight };
    })
    .filter((w): w is WeightEntry => w !== null);
}

function todayISODate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function TipPoolWorkspace({
  locationName,
  currency,
}: TipPoolWorkspaceProps): React.JSX.Element {
  const [{ data: rulesData }, refetchRules] = useQuery({
    query: TipPoolRulesDocument,
    requestPolicy: 'cache-and-network',
  });
  const [{ data: rolesData }] = useQuery({ query: JobRolesDocument });

  const rules = useMemo<Rule[]>(
    () => (rulesData?.tipPoolRules ?? []).filter((r): r is Rule => Boolean(r)),
    [rulesData],
  );
  const roles = useMemo<JobRole[]>(
    () =>
      (rolesData?.jobRoles ?? [])
        .filter((r): r is JobRole => Boolean(r))
        .filter((r) => !r.archivedAt),
    [rolesData],
  );

  return (
    <div className="flex flex-col gap-stack-loose px-container-margin py-gutter">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-headline-md font-bold text-on-surface">
          Tip pool · {locationName}
        </h1>
        <p className="text-body-staff text-on-surface-variant">
          Define how the day&apos;s tips split across job roles, then recompute
          the pool at end-of-day to allocate per-staff payouts.
        </p>
      </header>

      <section className="flex flex-col gap-gutter">
        <header className="flex items-center justify-between gap-3">
          <h2 className="font-display text-headline-md font-semibold text-on-surface">
            Rules
          </h2>
        </header>
        <RuleEditor
          roles={roles}
          onSaved={() => refetchRules({ requestPolicy: 'network-only' })}
        />
        <RuleList
          rules={rules}
          roles={roles}
          onArchived={() => refetchRules({ requestPolicy: 'network-only' })}
          onEdited={() => refetchRules({ requestPolicy: 'network-only' })}
        />
      </section>

      <section className="flex flex-col gap-gutter">
        <header className="flex items-center justify-between gap-3">
          <h2 className="font-display text-headline-md font-semibold text-on-surface">
            Daily allocations
          </h2>
        </header>
        <AllocationsPanel rules={rules} currency={currency} />
      </section>
    </div>
  );
}

// ── Rule editor (create / edit one rule) ──────────────

function RuleEditor({
  roles,
  initial,
  onSaved,
  onCancel,
}: {
  roles: JobRole[];
  initial?: Rule | null;
  onSaved: () => void;
  onCancel?: () => void;
}): React.JSX.Element {
  const [name, setName] = useState(initial?.name ?? '');
  const [weights, setWeights] = useState<WeightEntry[]>(
    parseWeights(initial?.weights),
  );
  const [{ fetching }, upsert] = useMutation(UpsertTipPoolRuleDocument);

  const total = weights.reduce((s, w) => s + w.weight, 0);
  const isEdit = Boolean(initial?.id);

  const setWeightFor = (roleId: string, value: number): void => {
    setWeights((prev) => {
      const without = prev.filter((w) => w.jobRoleId !== roleId);
      if (value <= 0) return without;
      return [...without, { jobRoleId: roleId, weight: Math.floor(value) }];
    });
  };

  const weightFor = (roleId: string): number =>
    weights.find((w) => w.jobRoleId === roleId)?.weight ?? 0;

  const onSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Name is required.');
      return;
    }
    if (total <= 0) {
      toast.error('At least one role must have a positive weight.');
      return;
    }
    const result = await upsert({
      id: initial?.id ?? null,
      name: name.trim(),
      isActive: initial?.isActive ?? true,
      weights,
    });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success(isEdit ? 'Rule updated' : 'Rule created');
    if (!isEdit) {
      setName('');
      setWeights([]);
    }
    onSaved();
  };

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-card-padding shadow-card-soft"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="material-symbols-outlined text-primary"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          {isEdit ? 'edit' : 'add_circle'}
        </span>
        <h3 className="font-display text-body-customer font-semibold text-on-surface">
          {isEdit ? `Edit “${initial?.name ?? ''}”` : 'New rule'}
        </h3>
      </div>
      <label className="flex flex-col gap-2">
        <span className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
          Rule name
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Standard service shift"
          className="h-12 rounded-lg border border-outline-variant bg-surface-container-lowest px-4 text-body-staff text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </label>
      <div className="flex flex-col gap-2">
        <span className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
          Role weights{' '}
          <span className="font-status-pill text-status-pill normal-case text-primary">
            (total {total})
          </span>
        </span>
        {roles.length === 0 ? (
          <p className="rounded-lg border border-dashed border-outline-variant bg-surface-container-low px-4 py-3 text-body-staff text-on-surface-variant">
            No job roles defined yet. Create roles under{' '}
            <span className="font-semibold">Setup → Job roles</span> first.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {roles.map((role) => (
              <div
                key={role.id ?? ''}
                className="flex items-center justify-between gap-3 rounded-lg border border-outline-variant bg-surface-container-low px-4 py-2"
              >
                <span className="flex items-center gap-2 text-body-staff text-on-surface">
                  <span
                    aria-hidden
                    className="inline-block size-2.5 rounded-full"
                    style={{ backgroundColor: role.color ?? '#6366f1' }}
                  />
                  {role.name}
                </span>
                <input
                  type="number"
                  min={0}
                  max={1000}
                  value={weightFor(role.id ?? '')}
                  onChange={(e) =>
                    setWeightFor(role.id ?? '', Number(e.target.value) || 0)
                  }
                  className="h-10 w-20 rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-right text-body-staff tabular-nums text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            ))}
          </div>
        )}
        <p className="font-status-pill text-status-pill text-on-surface-variant">
          Weights are relative. e.g. <code>70 / 20 / 10</code> = role A gets
          70%, B gets 20%, C gets 10%.
        </p>
      </div>
      <div className="flex justify-end gap-3">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-outline-variant px-4 py-2 text-body-staff font-semibold text-on-surface-variant hover:bg-surface-container"
          >
            Cancel
          </button>
        ) : null}
        <Button
          type="submit"
          disabled={fetching || total <= 0 || !name.trim()}
          className="bg-primary text-on-primary hover:opacity-90"
        >
          {fetching ? 'Saving…' : isEdit ? 'Save changes' : 'Create rule'}
        </Button>
      </div>
    </form>
  );
}

// ── Rule list (current rules) ─────────────────────────

function RuleList({
  rules,
  roles,
  onArchived,
  onEdited,
}: {
  rules: Rule[];
  roles: JobRole[];
  onArchived: () => void;
  onEdited: () => void;
}): React.JSX.Element {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [, archive] = useMutation(ArchiveTipPoolRuleDocument);
  const roleName = (id: string): { name: string; color: string } => {
    const r = roles.find((x) => x.id === id);
    return { name: r?.name ?? '—', color: r?.color ?? '#6366f1' };
  };

  if (rules.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-outline-variant bg-surface-container-low p-card-padding text-center text-body-staff text-on-surface-variant">
        No active rules. Create one above to start running the tip pool.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {rules.map((rule) => {
        const ws = parseWeights(rule.weights);
        const total = ws.reduce((s, w) => s + w.weight, 0) || 1;
        if (editingId === rule.id) {
          return (
            <li key={rule.id ?? ''}>
              <RuleEditor
                roles={roles}
                initial={rule}
                onSaved={() => {
                  setEditingId(null);
                  onEdited();
                }}
                onCancel={() => setEditingId(null)}
              />
            </li>
          );
        }
        return (
          <li
            key={rule.id ?? ''}
            className="flex flex-col gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-card-padding shadow-card-soft"
          >
            <header className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-body-customer font-bold text-on-surface">
                  {rule.name}
                </h3>
                <p className="font-status-pill text-status-pill text-on-surface-variant">
                  {ws.length} role{ws.length === 1 ? '' : 's'} · updated{' '}
                  {new Date(rule.updatedAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={[
                    'rounded-full px-2.5 py-1 font-status-pill text-status-pill uppercase tracking-wider',
                    rule.isActive
                      ? 'bg-success-container text-on-success-container'
                      : 'bg-surface-container text-on-surface-variant',
                  ].join(' ')}
                >
                  {rule.isActive ? 'Active' : 'Inactive'}
                </span>
                <button
                  type="button"
                  onClick={() => setEditingId(rule.id ?? null)}
                  className="rounded-lg border border-primary px-3 py-1.5 text-body-staff font-semibold text-primary hover:bg-primary/5"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!rule.id) return;
                    const r = await archive({ id: rule.id });
                    if (r.error) {
                      toast.error(r.error.message);
                      return;
                    }
                    toast.success('Rule archived');
                    onArchived();
                  }}
                  className="rounded-lg border border-error/40 px-3 py-1.5 text-body-staff font-semibold text-error hover:bg-error-container"
                >
                  Archive
                </button>
              </div>
            </header>
            <div className="flex flex-wrap gap-2">
              {ws.map((w) => {
                const role = roleName(w.jobRoleId);
                const pct = Math.round((w.weight / total) * 100);
                return (
                  <span
                    key={w.jobRoleId}
                    className="inline-flex items-center gap-2 rounded-full bg-surface-container px-3 py-1 text-body-staff"
                  >
                    <span
                      aria-hidden
                      className="inline-block size-2 rounded-full"
                      style={{ backgroundColor: role.color }}
                    />
                    <span className="font-semibold text-on-surface">
                      {role.name}
                    </span>
                    <span className="tabular-nums text-on-surface-variant">
                      {w.weight} · {pct}%
                    </span>
                  </span>
                );
              })}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ── Allocations panel ─────────────────────────────────

function AllocationsPanel({
  rules,
  currency,
}: {
  rules: Rule[];
  currency: string;
}): React.JSX.Element {
  const [day, setDay] = useState<string>(() => todayISODate());
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(
    rules[0]?.id ?? null,
  );

  // Keep the picker in sync if rules load after first render.
  if (rules.length > 0 && !selectedRuleId && rules[0]?.id) {
    setSelectedRuleId(rules[0].id);
  }

  const dayAsDate = new Date(`${day}T00:00:00.000Z`);
  const [{ data, fetching }, refetch] = useQuery({
    query: DailyTipAllocationsDocument,
    variables: { businessDay: dayAsDate.toISOString() },
    requestPolicy: 'cache-and-network',
  });
  const [{ fetching: recomputing }, recompute] = useMutation(
    RecomputeTipPoolDocument,
  );

  const allocs = useMemo<Allocation[]>(
    () =>
      (data?.dailyTipAllocations ?? []).filter((a): a is Allocation =>
        Boolean(a),
      ),
    [data],
  );
  const totalPool = allocs[0]?.totalTipPoolCents ?? 0;
  const totalAllocated = allocs.reduce((s, a) => s + (a.amountCents ?? 0), 0);

  const onRecompute = async (): Promise<void> => {
    if (!selectedRuleId) {
      toast.error('Pick a rule to run.');
      return;
    }
    const result = await recompute({
      ruleId: selectedRuleId,
      businessDay: dayAsDate.toISOString(),
    });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success(
      `Allocated ${formatMoney(
        result.data?.recomputeTipPool?.reduce(
          (s, a) => s + (a?.amountCents ?? 0),
          0,
        ) ?? 0,
        currency,
      )} across ${result.data?.recomputeTipPool?.length ?? 0} staff`,
    );
    refetch({ requestPolicy: 'network-only' });
  };

  return (
    <div className="flex flex-col gap-gutter rounded-xl border border-outline-variant bg-surface-container-lowest p-card-padding shadow-card-soft">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-col gap-2">
          <span className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
            Business day
          </span>
          <input
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="h-10 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-body-staff text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </label>
        <label className="flex min-w-[220px] flex-1 flex-col gap-2">
          <span className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
            Rule
          </span>
          <select
            value={selectedRuleId ?? ''}
            onChange={(e) => setSelectedRuleId(e.target.value || null)}
            className="h-10 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-body-staff text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            {rules.length === 0 ? (
              <option value="">— no rules defined —</option>
            ) : (
              rules.map((r) => (
                <option key={r.id ?? ''} value={r.id ?? ''}>
                  {r.name}
                  {r.isActive ? '' : ' (inactive)'}
                </option>
              ))
            )}
          </select>
        </label>
        <Button
          type="button"
          onClick={onRecompute}
          disabled={recomputing || rules.length === 0}
          className="bg-primary text-on-primary hover:opacity-90"
        >
          {recomputing ? 'Recomputing…' : 'Recompute pool'}
        </Button>
      </div>

      {fetching && allocs.length === 0 ? (
        <p className="text-body-staff text-on-surface-variant">Loading…</p>
      ) : allocs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-outline-variant bg-surface-container-low p-card-padding text-center">
          <span
            aria-hidden
            className="material-symbols-outlined text-[32px] text-on-surface-variant"
          >
            payments
          </span>
          <p className="text-body-customer font-semibold text-on-surface">
            No allocations for this day
          </p>
          <p className="text-body-staff text-on-surface-variant">
            Pick a rule and hit “Recompute pool” to split the day&apos;s tips
            across staff who clocked in.
          </p>
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat
              label="Total pool"
              value={formatMoney(totalPool, currency)}
            />
            <Stat
              label="Allocated"
              value={formatMoney(totalAllocated, currency)}
            />
            <Stat
              label="Staff paid"
              value={String(allocs.length)}
              accent
            />
          </dl>
          <ul className="divide-y divide-outline-variant/40 overflow-hidden rounded-lg border border-outline-variant">
            {allocs.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 bg-surface-container-lowest px-4 py-3"
              >
                <div className="flex flex-col">
                  <span className="text-body-customer font-semibold text-on-surface">
                    {a.staffMember?.name ?? a.staffMember?.email ?? '—'}
                  </span>
                  {a.jobRole ? (
                    <span className="flex items-center gap-1.5 font-status-pill text-status-pill text-on-surface-variant">
                      <span
                        aria-hidden
                        className="inline-block size-1.5 rounded-full"
                        style={{ backgroundColor: a.jobRole.color ?? '#6366f1' }}
                      />
                      {a.jobRole.name}
                    </span>
                  ) : null}
                </div>
                <span className="font-display text-body-customer font-bold tabular-nums text-primary">
                  {formatMoney(a.amountCents ?? 0, currency)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
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
