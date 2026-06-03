/* Shared schedule rule resolver for admin and public preview. */
(function () {
  'use strict';

  function toISODate(input) {
    if (input instanceof Date && !Number.isNaN(input.getTime())) {
      const y = input.getFullYear();
      const m = String(input.getMonth() + 1).padStart(2, '0');
      const d = String(input.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    const raw = String(input || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
  }

  function localDate(input) {
    if (input instanceof Date && !Number.isNaN(input.getTime())) {
      return new Date(input.getFullYear(), input.getMonth(), input.getDate());
    }
    const iso = toISODate(input);
    if (!iso) return null;
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function dateOverrides(settings) {
    const map = settings?.bellSchedules?._dateOverrides
      || settings?.scheduleOverride?.dateOverrides
      || {};
    return map && typeof map === 'object' && !Array.isArray(map) ? map : {};
  }

  function enabledRules(settings) {
    return Array.isArray(settings?.scheduleRules)
      ? settings.scheduleRules.filter(rule => rule && rule.enabled !== false && rule.scheduleType)
      : [];
  }

  function weekdayMatches(rule, date) {
    const value = date.getDay();
    const days = Array.isArray(rule.weekdays)
      ? rule.weekdays
      : Array.isArray(rule.days)
        ? rule.days
        : [rule.weekday ?? rule.day];
    return days.map(Number).includes(value);
  }

  function rangeMatches(rule, iso) {
    const from = String(rule.from || rule.start || '').trim();
    const to = String(rule.to || rule.end || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(from)
      && /^\d{4}-\d{2}-\d{2}$/.test(to)
      && iso >= from
      && iso <= to;
  }

  function dateMatches(rule, iso) {
    const date = String(rule.date || rule.iso || '').trim();
    return date === iso;
  }

  function findLast(rules, predicate) {
    for (let i = rules.length - 1; i >= 0; i -= 1) {
      if (predicate(rules[i])) return rules[i];
    }
    return null;
  }

  function resolveScheduleType(input, settings, defaultType = '') {
    const iso = toISODate(input);
    const date = localDate(input);
    if (!iso || !date) return { type: defaultType || '', source: 'default', rule: null, iso: '' };

    const manualType = dateOverrides(settings)[iso];
    if (manualType) {
      return { type: manualType, source: 'manual', rule: null, iso };
    }

    const active = settings?.scheduleOverride;
    if (active?.type && String(active.date || '') === iso) {
      return { type: active.type, source: 'active', rule: null, iso };
    }

    const rules = enabledRules(settings);
    const dateRule = findLast(rules, rule => rule.kind === 'date' && dateMatches(rule, iso));
    if (dateRule) return { type: dateRule.scheduleType, source: 'rule-date', rule: dateRule, iso };

    const rangeRule = findLast(rules, rule => rule.kind === 'dateRange' && rangeMatches(rule, iso));
    if (rangeRule) return { type: rangeRule.scheduleType, source: 'rule-range', rule: rangeRule, iso };

    const weekdayRule = findLast(rules, rule => rule.kind === 'weekday' && weekdayMatches(rule, date));
    if (weekdayRule) return { type: weekdayRule.scheduleType, source: 'rule-weekday', rule: weekdayRule, iso };

    return { type: defaultType || '', source: 'default', rule: null, iso };
  }

  window.PhsScheduleResolver = {
    resolveScheduleType,
    toISODate,
    localDate
  };
})();
