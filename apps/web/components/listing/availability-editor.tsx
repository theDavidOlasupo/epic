'use client';

import { useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import type { AvailabilityRule, AvailabilityBlock } from '@alpaca/types';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// 30-minute time slots
function timeSlots(): string[] {
  const slots: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return slots;
}

const TIME_SLOTS = timeSlots();

// Common IANA timezones for Canada
const TIMEZONES = [
  'America/Toronto',
  'America/Vancouver',
  'America/Edmonton',
  'America/Winnipeg',
  'America/Halifax',
  'America/St_Johns',
];

function today(): string {
  return new Date().toISOString().split('T')[0] ?? '';
}

interface AvailabilityEditorProps {
  spotId: string;
  rules: AvailabilityRule[];
  blocks: AvailabilityBlock[];
  onRulesChange: (rules: AvailabilityRule[]) => void;
  onBlocksChange: (blocks: AvailabilityBlock[]) => void;
}

export function AvailabilityEditor({
  spotId,
  rules,
  blocks,
  onRulesChange,
  onBlocksChange,
}: AvailabilityEditorProps) {
  const { getToken } = useAuth();

  // ── New rule form state ──────────────────────────────────────────────────
  const [newRuleDay, setNewRuleDay] = useState<number>(1); // Monday
  const [newRuleStart, setNewRuleStart] = useState('09:00');
  const [newRuleEnd, setNewRuleEnd] = useState('17:00');
  const [newRuleTz, setNewRuleTz] = useState('America/Toronto');
  const [addingRule, setAddingRule] = useState(false);
  const [ruleError, setRuleError] = useState('');

  // ── New block form state ─────────────────────────────────────────────────
  const [newBlockStart, setNewBlockStart] = useState(today());
  const [newBlockEnd, setNewBlockEnd] = useState(today());
  const [newBlockReason, setNewBlockReason] = useState('');
  const [addingBlock, setAddingBlock] = useState(false);
  const [blockError, setBlockError] = useState('');

  // ── Add a weekly rule ────────────────────────────────────────────────────
  async function handleAddRule() {
    setRuleError('');
    if (newRuleStart >= newRuleEnd) {
      setRuleError('End time must be after start time');
      return;
    }

    setAddingRule(true);
    try {
      const token = await getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/parking-spots/${spotId}/availability-rules`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            dayOfWeek: newRuleDay,
            startTime: newRuleStart,
            endTime: newRuleEnd,
            timezone: newRuleTz,
          }),
        },
      );

      if (!res.ok) {
        const err = await res.json() as { error: { message: string } };
        setRuleError(err.error?.message ?? 'Failed to add rule');
        return;
      }

      const rule = await res.json() as AvailabilityRule;
      onRulesChange([...rules, rule]);
    } catch {
      setRuleError('Failed to add rule');
    } finally {
      setAddingRule(false);
    }
  }

  // ── Delete a weekly rule ─────────────────────────────────────────────────
  async function handleDeleteRule(ruleId: string) {
    try {
      const token = await getToken();
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/parking-spots/${spotId}/availability-rules/${ruleId}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
      );
      onRulesChange(rules.filter((r) => r.id !== ruleId));
    } catch {
      // Silently fail — rule stays in list
    }
  }

  // ── Add a blocked date range ─────────────────────────────────────────────
  async function handleAddBlock() {
    setBlockError('');
    if (newBlockEnd < newBlockStart) {
      setBlockError('End date must be on or after start date');
      return;
    }

    setAddingBlock(true);
    try {
      const token = await getToken();
      // Convert date strings to ISO 8601 (start of day / end of day UTC)
      const startIso = `${newBlockStart}T00:00:00.000Z`;
      const endIso = `${newBlockEnd}T23:59:59.000Z`;

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/parking-spots/${spotId}/availability-blocks`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            startTime: startIso,
            endTime: endIso,
            reason: newBlockReason || undefined,
          }),
        },
      );

      if (!res.ok) {
        const err = await res.json() as { error: { message: string } };
        setBlockError(err.error?.message ?? 'Failed to add block');
        return;
      }

      const block = await res.json() as AvailabilityBlock;
      onBlocksChange([...blocks, block]);
      setNewBlockReason('');
    } catch {
      setBlockError('Failed to add block');
    } finally {
      setAddingBlock(false);
    }
  }

  // ── Delete a blocked date range ──────────────────────────────────────────
  async function handleDeleteBlock(blockId: string) {
    try {
      const token = await getToken();
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/parking-spots/${spotId}/availability-blocks/${blockId}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
      );
      onBlocksChange(blocks.filter((b) => b.id !== blockId));
    } catch {
      // Silently fail
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Weekly rules ── */}
      <section>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Weekly schedule</h3>
        <p className="text-xs text-gray-500 mb-3">
          Add recurring time windows when your spot is available. Drivers can only book within these windows.
        </p>

        {/* Existing rules */}
        {rules.length > 0 && (
          <div className="space-y-2 mb-3">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                <span className="font-medium text-gray-900">
                  {DAY_FULL[rule.dayOfWeek]}
                </span>
                <span className="text-gray-500">
                  {rule.startTime} – {rule.endTime}
                </span>
                <span className="text-xs text-gray-400">{rule.timezone}</span>
                <button
                  onClick={() => void handleDeleteRule(rule.id)}
                  className="ml-2 text-red-400 hover:text-red-600 text-xs"
                  aria-label="Remove rule"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add rule form */}
        <div className="rounded-xl border border-gray-200 p-4 space-y-3">
          <p className="text-xs font-medium text-gray-600">Add a time window</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="text-xs text-gray-500">Day</label>
              <select
                className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                value={newRuleDay}
                onChange={(e) => setNewRuleDay(Number(e.target.value))}
              >
                {DAYS.map((d, i) => (
                  <option key={d} value={i}>{DAY_FULL[i]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500">From</label>
              <select
                className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                value={newRuleStart}
                onChange={(e) => setNewRuleStart(e.target.value)}
              >
                {TIME_SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500">To</label>
              <select
                className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                value={newRuleEnd}
                onChange={(e) => setNewRuleEnd(e.target.value)}
              >
                {TIME_SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500">Timezone</label>
              <select
                className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                value={newRuleTz}
                onChange={(e) => setNewRuleTz(e.target.value)}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz.replace('America/', '')}</option>
                ))}
              </select>
            </div>
          </div>
          {ruleError && <p className="text-xs text-red-500">{ruleError}</p>}
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleAddRule()}
            disabled={addingRule}
          >
            {addingRule ? 'Adding...' : '+ Add window'}
          </Button>
        </div>
      </section>

      {/* ── Blocked dates ── */}
      <section>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Blocked dates</h3>
        <p className="text-xs text-gray-500 mb-3">
          Block out specific date ranges when your spot is unavailable (e.g. holidays, maintenance).
        </p>

        {/* Existing blocks */}
        {blocks.length > 0 && (
          <div className="space-y-2 mb-3">
            {blocks.map((block) => (
              <div
                key={block.id}
                className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                <span className="font-medium text-gray-900">
                  {block.startTime.split('T')[0]} → {block.endTime.split('T')[0]}
                </span>
                {block.reason && (
                  <span className="text-xs text-gray-400 italic">{block.reason}</span>
                )}
                <button
                  onClick={() => void handleDeleteBlock(block.id)}
                  className="ml-2 text-red-400 hover:text-red-600 text-xs"
                  aria-label="Remove block"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add block form */}
        <div className="rounded-xl border border-gray-200 p-4 space-y-3">
          <p className="text-xs font-medium text-gray-600">Block a date range</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500">From</label>
              <input
                type="date"
                min={today()}
                value={newBlockStart}
                onChange={(e) => setNewBlockStart(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">To</label>
              <input
                type="date"
                min={newBlockStart}
                value={newBlockEnd}
                onChange={(e) => setNewBlockEnd(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500">Reason (optional)</label>
            <input
              className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              placeholder="e.g. Holiday, maintenance"
              value={newBlockReason}
              onChange={(e) => setNewBlockReason(e.target.value)}
            />
          </div>
          {blockError && <p className="text-xs text-red-500">{blockError}</p>}
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleAddBlock()}
            disabled={addingBlock}
          >
            {addingBlock ? 'Adding...' : '+ Block dates'}
          </Button>
        </div>
      </section>
    </div>
  );
}
