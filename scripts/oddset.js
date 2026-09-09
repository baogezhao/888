const { chromium } = require('playwright-core');
const aliases = require('./oddset-teams.json');
const SOURCE = 'https://www.oddset.de/en/sports/football-4';
const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[\s.\-']/g, '');

function sameTeam(chinese, participant) {
  const names = [participant.name?.value, participant.name?.short].filter(Boolean).map(normalize);
  return [chinese, ...(aliases[chinese] || [])].some(name => names.includes(normalize(name)));
}

function parseFixture(fixture) {
  if (fixture.sport?.id !== 4 || fixture.stage !== 'PreMatch' || !fixture.isOpenForBetting || fixture.isVirtual) return null;
  const home = fixture.participants?.find(p => p.properties?.type === 'HomeTeam');
  const away = fixture.participants?.find(p => p.properties?.type === 'AwayTeam');
  if (!home || !away || !Number.isFinite(Date.parse(fixture.startDate))) return null;
  const market = fixture.optionMarkets?.find(m => {
    const parameters = Object.fromEntries((m.parameters || []).map(p => [p.key, p.value]));
    return m.status === 'Visible' && /^match result$/i.test(m.name?.value || '')
      && parameters.Period === 'RegularTime' && parameters.MarketType === '3way';
  });
  if (!market || market.options?.length !== 3 || market.options.some(o => o.status !== 'Visible')) return null;
  const options = [
    market.options.find(o => o.parameters?.fixtureParticipant === home.id),
    market.options.find(o => o.parameters?.optionTypes?.includes('Draw')),
    market.options.find(o => o.parameters?.fixtureParticipant === away.id)
  ];
  const prices = options.map(o => o?.price?.odds);
  if (!prices.every(n => typeof n === 'number' && Number.isFinite(n) && n > 1)) return null;
  return { id: fixture.id, home, away, startDate: fixture.startDate, odds: { home: prices[0], draw: prices[1], away: prices[2] } };
}

function matchOdds(matches, fixtures) {
  const parsed = fixtures.map(parseFixture).filter(Boolean);
  return matches.map(match => {
    const candidates = parsed.filter(f => Math.abs(Date.parse(f.startDate) - Date.parse(match.startTime)) <= 5 * 60000
      && sameTeam(match.home, f.home) && sameTeam(match.away, f.away));
    const unique = [...new Map(candidates.map(f => [f.id, f])).values()];
    return { ...match, odds: unique.length === 1 ? unique[0].odds : null,
      oddsFixtureId: unique.length === 1 ? unique[0].id : null };
  });
}

async function launchBrowser() {
  for (const channel of ['chrome', 'msedge']) {
    try { return await chromium.launch({ channel, headless: true, timeout: 15000 }); } catch {}
  }
  throw new Error('无法启动 Chrome 或 Edge，请安装浏览器后重试');
}

async function fetchFixtures(from, to) {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    // Read the site's current public configuration, rather than hard-coding its access ID or country.
    const requestPromise = page.waitForRequest(r => r.url().startsWith('https://www.oddset.de/cds-api/bettingoffer/counts?'), { timeout: 25000 });
    const [, request] = await Promise.all([
      page.goto(SOURCE, { waitUntil: 'domcontentloaded', timeout: 25000 }), requestPromise
    ]);
    const url = new URL(request.url());
    url.pathname = '/cds-api/bettingoffer/fixtures';
    for (const key of [...url.searchParams.keys()]) {
      if (!['x-bwin-accessid', 'lang', 'country', 'userCountry'].includes(key)) url.searchParams.delete(key);
    }
    for (const [key, value] of Object.entries({ sportIds: '4', fixtureTypes: 'Standard', state: 'Latest',
      offerMapping: 'MainMarkets', sortBy: 'StartDate', from, to, take: '1000' })) url.searchParams.set(key, value);
    const result = await page.evaluate(async address => {
      const response = await fetch(address, { signal: AbortSignal.timeout(25000) });
      if (!response.ok) throw new Error(`ODDSET HTTP ${response.status}`);
      return response.json();
    }, url.href);
    if (!Array.isArray(result.fixtures)) throw new Error('ODDSET 比赛数据格式已改变');
    if (result.totalCount > result.fixtures.length) throw new Error('ODDSET 返回的比赛数据不完整，请稍后重试');
    return { fixtures: result.fixtures, fetchedAt: new Date().toISOString() };
  } finally { await browser.close(); }
}

let cache = null;
let inFlight = null;
async function addOddsetOdds(matches) {
  const times = matches.map(m => Date.parse(m.startTime)).filter(Number.isFinite);
  const meta = { source: SOURCE, matched: 0, fetchedAt: null };
  try {
    if (!times.length) throw new Error('对阵缺少有效开赛时间，无法核对赔率');
    const from = new Date(Math.min(...times) - 5 * 60000).toISOString();
    const to = new Date(Math.max(...times) + 5 * 60000).toISOString();
    const key = `${from}/${to}`;
    if (Date.parse(to) - Date.parse(from) > 14 * 86400000) throw new Error('对阵日期跨度超过 14 天');
    if (!cache || cache.key !== key || Date.now() - Date.parse(cache.fetchedAt) >= 60000) {
      if (!inFlight || inFlight.key !== key) {
        const pending = { key, promise: fetchFixtures(from, to) };
        inFlight = pending;
        pending.promise.finally(() => { if (inFlight === pending) inFlight = null; }).catch(() => {});
      }
      const result = await inFlight.promise;
      cache = { ...result, key };
    }
    const result = matchOdds(matches, cache.fixtures);
    return { matches: result, oddsInfo: { ...meta, fetchedAt: cache.fetchedAt, matched: result.filter(m => m.odds).length } };
  } catch (error) {
    return { matches: matches.map(m => ({ ...m, odds: null })), oddsInfo: { ...meta, error: `ODDSET 自动抓取失败：${error.message}` } };
  }
}

module.exports = { addOddsetOdds, matchOdds, parseFixture };
