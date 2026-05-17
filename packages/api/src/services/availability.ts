import { DateTime, Interval } from 'luxon';
import { query } from '@alpaca/db';
import { Errors } from '../lib/errors.js';
import type { PoolClient } from 'pg';

export type AvailabilityRuleRow = {
  parkingSpotId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  timezone: string;
};

type TimeParts = { hour: number; minute: number; second: number };

function runQuery<T extends Record<string, unknown>>(
  client: PoolClient | undefined,
  text: string,
  values?: unknown[],
) {
  if (client) return client.query<T>(text, values);
  return query<T>(text, values);
}

/** Schema: 0 = Sunday. Luxon weekday: 1 = Monday … 7 = Sunday. */
export function luxonWeekdayToSchemaDow(weekday: number): number {
  return weekday === 7 ? 0 : weekday;
}

function parseTime(time: string): TimeParts {
  const [h, m, s = '0'] = time.split(':');
  return {
    hour: Number(h),
    minute: Number(m),
    second: Number(s),
  };
}

function setLocalTime(base: DateTime, parts: TimeParts): DateTime {
  return base.set({
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
    millisecond: 0,
  });
}

function isOvernightRule(start: TimeParts, end: TimeParts): boolean {
  const startMins = start.hour * 60 + start.minute;
  const endMins = end.hour * 60 + end.minute;
  return startMins >= endMins;
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];

  const sorted = [...intervals].sort((a, b) => a.start!.toMillis() - b.start!.toMillis());
  const merged: Interval[] = [sorted[0]!];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]!;
    const last = merged[merged.length - 1]!;
    if (current.start! <= last.end!) {
      merged[merged.length - 1] = Interval.fromDateTimes(
        last.start!,
        current.end! > last.end! ? current.end! : last.end!,
      );
    } else {
      merged.push(current);
    }
  }
  return merged;
}

/** True if [windowStart, windowEnd) is covered by the union of intervals (half-open). */
function isWindowCoveredByIntervals(
  intervals: Interval[],
  windowStart: DateTime,
  windowEnd: DateTime,
): boolean {
  if (windowStart >= windowEnd) return true;

  const window = Interval.fromDateTimes(windowStart, windowEnd);
  const merged = mergeIntervals(intervals.filter((iv) => iv.overlaps(window)));

  let cursor = windowStart;
  for (const iv of merged) {
    if (iv.start! > cursor) return false;
    if (iv.end! > cursor) cursor = iv.end!;
    if (cursor >= windowEnd) return true;
  }
  return cursor >= windowEnd;
}

/**
 * Build local availability intervals that apply on `localDate` (start of that calendar day).
 * Includes same-day rules and previous-day overnight rules bleeding into this day.
 */
function getRuleIntervalsForLocalDay(
  rules: AvailabilityRuleRow[],
  localDate: DateTime,
  timezone: string,
): Interval[] {
  const zoneRules = rules.filter((r) => r.timezone === timezone);
  const dow = luxonWeekdayToSchemaDow(localDate.weekday);
  const prevDow = (dow + 6) % 7;
  const intervals: Interval[] = [];

  for (const rule of zoneRules) {
    const startParts = parseTime(rule.startTime);
    const endParts = parseTime(rule.endTime);
    const overnight = isOvernightRule(startParts, endParts);

    if (rule.dayOfWeek === dow) {
      const start = setLocalTime(localDate, startParts);
      if (overnight) {
        const end = setLocalTime(localDate.plus({ days: 1 }), endParts);
        intervals.push(Interval.fromDateTimes(start, end));
      } else {
        const end = setLocalTime(localDate, endParts);
        intervals.push(Interval.fromDateTimes(start, end));
      }
    }

    if (overnight && rule.dayOfWeek === prevDow) {
      const start = setLocalTime(localDate.minus({ days: 1 }), startParts);
      const end = setLocalTime(localDate, endParts);
      intervals.push(Interval.fromDateTimes(start, end));
    }
  }

  return intervals;
}

/**
 * Returns true when the entire [startUtc, endUtc) window is covered by weekly rules.
 * Uses the first rule's timezone; all rules for a spot should share that timezone.
 */
export function isWindowCoveredByRules(
  rules: AvailabilityRuleRow[],
  startUtc: Date,
  endUtc: Date,
): boolean {
  if (rules.length === 0) return false;
  if (endUtc <= startUtc) return false;

  const start = DateTime.fromJSDate(startUtc, { zone: 'utc' });
  const end = DateTime.fromJSDate(endUtc, { zone: 'utc' });

  // MVP: one timezone per spot; rules in other zones are ignored (POST validates consistency).
  const timezone = rules[0]!.timezone;
  const zoneRules = rules.filter((r) => r.timezone === timezone);

  const localStart = start.setZone(timezone);
  const localEnd = end.setZone(timezone);

  let dayCursor = localStart.startOf('day');
  const lastDay = localEnd.startOf('day');

  while (dayCursor <= lastDay) {
    const dayEnd = dayCursor.plus({ days: 1 });
    const segStart = DateTime.max(localStart, dayCursor);
    const segEnd = DateTime.min(localEnd, dayEnd);

    if (segStart < segEnd) {
      const dayIntervals = getRuleIntervalsForLocalDay(zoneRules, dayCursor, timezone);
      if (!isWindowCoveredByIntervals(dayIntervals, segStart, segEnd)) {
        return false;
      }
    }

    dayCursor = dayCursor.plus({ days: 1 });
  }

  return true;
}

export async function hasBlockOverlap(
  spotId: string,
  startTime: string,
  endTime: string,
  client?: PoolClient,
): Promise<boolean> {
  const result = await runQuery<{ exists: boolean }>(
    client,
    `SELECT EXISTS (
       SELECT 1 FROM availability_blocks
       WHERE parking_spot_id = $1
         AND start_time < $3::timestamptz
         AND end_time > $2::timestamptz
     ) AS exists`,
    [spotId, startTime, endTime],
  );
  return result.rows[0]?.exists ?? false;
}

export async function loadRulesForSpots(
  spotIds: string[],
  client?: PoolClient,
): Promise<Map<string, AvailabilityRuleRow[]>> {
  const map = new Map<string, AvailabilityRuleRow[]>();
  if (spotIds.length === 0) return map;

  const result = await runQuery<{
    parking_spot_id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    timezone: string;
  }>(
    client,
    `SELECT parking_spot_id, day_of_week, start_time::text, end_time::text, timezone
     FROM availability_rules
     WHERE parking_spot_id = ANY($1::uuid[])`,
    [spotIds],
  );

  for (const row of result.rows) {
    const list = map.get(row.parking_spot_id) ?? [];
    list.push({
      parkingSpotId: row.parking_spot_id,
      dayOfWeek: row.day_of_week,
      startTime: row.start_time.slice(0, 5),
      endTime: row.end_time.slice(0, 5),
      timezone: row.timezone,
    });
    map.set(row.parking_spot_id, list);
  }
  return map;
}

export async function loadRulesForSpot(
  spotId: string,
  client?: PoolClient,
): Promise<AvailabilityRuleRow[]> {
  const map = await loadRulesForSpots([spotId], client);
  return map.get(spotId) ?? [];
}

export async function isSpotAvailable(
  spotId: string,
  startTime: string,
  endTime: string,
  client?: PoolClient,
): Promise<boolean> {
  const startUtc = new Date(startTime);
  const endUtc = new Date(endTime);
  if (endUtc <= startUtc) return false;

  if (await hasBlockOverlap(spotId, startTime, endTime, client)) {
    return false;
  }

  const rules = await loadRulesForSpot(spotId, client);
  return isWindowCoveredByRules(rules, startUtc, endUtc);
}

export async function assertSpotAvailable(
  spotId: string,
  startTime: string,
  endTime: string,
  client?: PoolClient,
): Promise<void> {
  const available = await isSpotAvailable(spotId, startTime, endTime, client);
  if (!available) {
    throw Errors.unprocessable(
      'SPOT_NOT_AVAILABLE',
      'This spot is not available for the selected time',
    );
  }
}

export async function filterAvailableSpotIds(
  spotIds: string[],
  startTime: string,
  endTime: string,
): Promise<Set<string>> {
  if (spotIds.length === 0) return new Set();

  const startUtc = new Date(startTime);
  const endUtc = new Date(endTime);
  if (endUtc <= startUtc) return new Set();

  const rulesBySpot = await loadRulesForSpots(spotIds);

  const blocked = await query<{ parking_spot_id: string }>(
    `SELECT DISTINCT parking_spot_id
     FROM availability_blocks
     WHERE parking_spot_id = ANY($1::uuid[])
       AND start_time < $3::timestamptz
       AND end_time > $2::timestamptz`,
    [spotIds, startTime, endTime],
  );
  const blockedIds = new Set(blocked.rows.map((r) => r.parking_spot_id));

  const allowed = new Set<string>();
  for (const spotId of spotIds) {
    if (blockedIds.has(spotId)) continue;
    const rules = rulesBySpot.get(spotId) ?? [];
    if (isWindowCoveredByRules(rules, startUtc, endUtc)) {
      allowed.add(spotId);
    }
  }
  return allowed;
}
