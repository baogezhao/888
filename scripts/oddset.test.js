const test = require('node:test');
const assert = require('node:assert/strict');
const { matchOdds, parseFixture } = require('./oddset');

function fixture() {
  return {
    id: 'test:1', sport: { id: 4 }, stage: 'PreMatch', isOpenForBetting: true,
    startDate: '2026-09-09T16:45:00Z',
    participants: [
      { id: 1, name: { value: 'FC Barcelona' }, properties: { type: 'HomeTeam' } },
      { id: 2, name: { value: 'Feyenoord Rotterdam' }, properties: { type: 'AwayTeam' } }
    ],
    optionMarkets: [{ name: { value: 'Match Result' }, status: 'Visible',
      parameters: [{ key: 'Period', value: 'RegularTime' }, { key: 'MarketType', value: '3way' }],
      // Deliberately shuffled: prices must follow participant IDs, not array order.
      options: [
        { status: 'Visible', parameters: { fixtureParticipant: 2 }, price: { odds: 16.5 } },
        { status: 'Visible', parameters: { fixtureParticipant: 1 }, price: { odds: 1.11 } },
        { status: 'Visible', parameters: { optionTypes: ['Draw'] }, price: { odds: 12 } }
      ]
    }]
  };
}
const match = { home: '巴塞罗那', away: '费耶诺德', startTime: '2026-09-10T00:45:00+08:00' };

test('matches translated teams and Beijing time, orders home/draw/away', () => {
  assert.deepEqual(matchOdds([match], [fixture()])[0].odds, { home: 1.11, draw: 12, away: 16.5 });
});
test('does not match reversed teams, other dates, unknown names or ambiguous fixtures', () => {
  for (const changed of [{ ...match, home: match.away, away: match.home },
    { ...match, startTime: '2026-09-11T00:45:00+08:00' }, { ...match, home: '未知队' }]) {
    assert.equal(matchOdds([changed], [fixture()])[0].odds, null);
  }
  assert.equal(matchOdds([match], [fixture(), { ...fixture(), id: 'test:2' }])[0].odds, null);
});
test('rejects live, closed, halftime, handicap and incomplete markets', () => {
  const mutations = [f => { f.stage = 'Live'; }, f => { f.isOpenForBetting = false; },
    f => { f.optionMarkets[0].parameters[0].value = 'FirstHalf'; },
    f => { f.optionMarkets[0].name.value = '3way Handicap'; },
    f => { f.optionMarkets[0].options[0].status = 'Suspended'; },
    f => { f.optionMarkets[0].options[0].price.odds = null; },
    f => { f.optionMarkets[0].options.pop(); }];
  for (const mutate of mutations) { const data = fixture(); mutate(data); assert.equal(parseFixture(data), null); }
});
