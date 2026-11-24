// Browser test of the real screen in the dev harness (npm start must be running, or set JOURNAL_URL).
// node tests/e2e/screen.cjs [screenshot-folder]
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const URL = process.env.JOURNAL_URL || 'http://127.0.0.1:5173/dev/';
const SHOTS = process.argv[2] || '';
const example = readFileSync(join(__dirname, '../../examples/exemplo.kjournal'), 'utf8');

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1 })).newPage();
  const errors = [];
  const outside = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', (r) => { if (!r.url().startsWith('http://127.0.0.1:5173') && !r.url().startsWith('http://localhost:5173')) outside.push(r.url()); });
  const shot = async (name) => { if (SHOTS) await page.waitForTimeout(350); if (SHOTS) await page.locator('#screen').screenshot({ path: join(SHOTS, `${name}.png`) }); };
  const step = (name) => console.log(`- ${name}`);

  await page.goto(URL);
  const s = page.frameLocator('#screen');
  const files = () => page.evaluate(() => Object.fromEntries(window.dev.files));
  const journal = async () => JSON.parse((await files())['journal.json']);

  step('sample library');
  await page.click('#load-sample');
  await s.locator('.card').first().waitFor();
  assert.equal(await s.locator('.card').count(), 4);
  await shot('1-list');

  step('new entry in a Kin, keyphrases, status');
  await s.getByRole('button', { name: 'Collections and files' }).click();
  await s.locator('.nav', { hasText: 'Alexi' }).click();
  await s.getByRole('button', { name: 'New', exact: true }).click();
  await s.locator('.title-input').fill('Biscuit');
  await s.locator('.content-input').fill('Biscuit is the caramel mutt Alexi adopted last winter.');
  const kp = s.getByLabel('New keyphrase');
  for (const k of ['Biscuit', 'our dog', 'casa']) { await kp.fill(k); await kp.press('Enter'); }
  assert.match(await s.locator('.issues').innerText(), /too common/);
  await s.getByRole('radio', { name: 'In Kindroid' }).click();
  await page.waitForTimeout(1200);
  let j = await journal();
  const biscuit = j.entries.find((e) => e.title === 'Biscuit');
  assert.deepEqual([biscuit.kinId, biscuit.status, biscuit.keyphrases.length], ['sample-alexi', 'inKindroid', 3]);
  await s.locator('.content-input').press('End');
  await s.locator('.content-input').type(' He steals socks.');
  await page.waitForTimeout(1200);
  assert.equal((await journal()).entries.find((e) => e.title === 'Biscuit').status, 'outdated');
  await shot('2-editor');

  step('copy works or falls back to a selectable sheet');
  await s.getByRole('button', { name: 'Keyphrases', exact: true }).click();
  await page.waitForTimeout(300);
  if (await s.locator('.sheet').count()) await s.getByRole('button', { name: 'Done' }).click();

  step('the Kin drafts an entry; the screen takes it in');
  await s.getByRole('button', { name: 'Back to the list' }).click();
  await page.evaluate(() => window.dev.act('save_journal_entry', { title: 'Lisbon trip', entry: 'Alexi and Rain plan a trip to Lisbon to visit Marta in spring.', keyphrases: ['Lisbon trip'] }));
  assert.ok((await files())['kin-drafts.json'].includes('Lisbon trip'));
  await page.frames().find((f) => f.url().includes('/screen/')).evaluate(() => window.dispatchEvent(new Event('focus')));
  await s.locator('.card', { hasText: 'Lisbon trip' }).waitFor();
  await page.waitForTimeout(1200);
  assert.ok((await journal()).entries.some((e) => e.title === 'Lisbon trip' && e.author === 'kin'));
  const read = await page.evaluate(() => window.dev.act('read_journal', { query: 'Marta' }));
  assert.match(read.message, /Marta, the older sister/);
  assert.doesNotMatch(read.message, /Quinn/);
  await shot('3-kin-draft');

  step('test triggers');
  await s.getByRole('button', { name: 'Test triggers' }).click();
  await s.getByLabel('Your message').fill('Remember the night at the cabin, and Solara?');
  assert.deepEqual(await s.locator('.match strong').allInnerTexts(), ['The night at the cabin', 'The Solara lighthouse']);
  await shot('4-triggers');
  await page.keyboard.press('Escape');

  step('import by paste, with preview');
  await s.getByRole('button', { name: 'Collections and files' }).click();
  await s.getByRole('button', { name: 'Import' }).click();
  await s.getByLabel('Content to import').fill(example);
  await s.getByRole('button', { name: 'Preview' }).click();
  await s.locator('.import-list').waitFor();
  await shot('5-import');
  const ack = s.locator('.ack input');
  if (await ack.count()) await ack.check();
  await s.getByRole('button', { name: 'Import as drafts' }).click();
  await page.waitForTimeout(1200);
  assert.ok((await journal()).entries.some((e) => e.id === 'cabana-lareira' && e.kinId === 'sample-alexi'));

  step('export to the link file');
  await s.getByRole('button', { name: 'Collections and files' }).click();
  await s.getByRole('button', { name: 'Export and backup' }).click();
  await s.getByRole('button', { name: 'Save link file' }).click();
  await page.waitForTimeout(400);
  assert.match((await files())['exports/journal.kjournal'], /^KJOURNAL\/2/);
  await page.keyboard.press('Escape');

  step('delete; detach a Kin; failing writes are reported and nothing is lost');
  await s.locator('.card').first().click();
  await s.getByRole('button', { name: 'Delete' }).click();
  await s.locator('.sheet .btn.danger').click();
  await page.waitForTimeout(1200);
  j = await journal();
  assert.equal(Object.keys(j.deleted).length, 1);
  await page.evaluate(() => { window.dev.kins[1].on = false; window.dev.sendKins(); });
  await s.getByRole('button', { name: 'Collections and files' }).click();
  assert.ok(await s.locator('.nav', { hasText: 'Quinn (detached)' }).count());
  await shot('6-menu');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.dev.setFail(true));
  await s.locator('.card').first().click();
  await s.locator('.title-input').fill('Edited while writes fail');
  await s.locator('.save.s-failed').waitFor({ timeout: 5000 });
  await page.evaluate(() => window.dev.setFail(false));
  await s.locator('.title-input').type('!');
  await s.locator('.save.s-saved').waitFor({ timeout: 5000 });
  assert.ok((await journal()).entries.some((e) => e.title === 'Edited while writes fail!'));

  step('reload keeps everything');
  const before = (await journal()).entries.length;
  await page.evaluate(() => window.dev.reload());
  await page.waitForTimeout(1500);
  await s.getByRole('button', { name: 'Collections and files' }).click();
  await s.locator('.nav', { hasText: 'All entries' }).click();
  assert.equal(await s.locator('.card').count(), before);

  assert.deepEqual(outside, [], 'no request leaves the harness');
  assert.deepEqual(errors.filter((e) => !/Permissions policy|clipboard/i.test(e)), []);
  console.log('screen e2e: ok');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
