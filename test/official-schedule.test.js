const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const resolver = require(path.join(root, 'schedule-resolver.js'));

test('official MCPS exceptions override defaults but not manual admin choices', () => {
  const settings = {
    bellSchedules: {
      _dateOverrides: {
        '2026-09-18': 'Assembly'
      }
    },
    officialSchedule: {
      overrides: {
        '2026-09-18': 'Early Release',
        '2026-09-21': 'No School'
      }
    },
    scheduleRules: [
      { kind: 'weekday', weekdays: [1], scheduleType: 'Normal Schedule', enabled: true }
    ]
  };

  assert.deepEqual(
    resolver.resolveScheduleType('2026-09-18', settings, 'Normal Schedule'),
    { type: 'Assembly', source: 'manual', rule: null, iso: '2026-09-18' }
  );
  assert.deepEqual(
    resolver.resolveScheduleType('2026-09-21', settings, 'Normal Schedule'),
    { type: 'No School', source: 'official-mcps', rule: null, iso: '2026-09-21' }
  );
});

test('public copies stay synchronized and the settings loader requests the official feed', () => {
  assert.equal(
    fs.readFileSync(path.join(root, 'schedule-resolver.js'), 'utf8'),
    fs.readFileSync(path.join(root, 'public/schedule-resolver.js'), 'utf8')
  );
  assert.equal(
    fs.readFileSync(path.join(root, 'settings-loader.js'), 'utf8'),
    fs.readFileSync(path.join(root, 'public/settings-loader.js'), 'utf8')
  );
  assert.match(
    fs.readFileSync(path.join(root, 'settings-loader.js'), 'utf8'),
    /BACKEND \+ '\/schedule-calendar'/
  );
});
