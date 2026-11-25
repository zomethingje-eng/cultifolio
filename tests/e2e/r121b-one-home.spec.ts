/**
 * Round 121 (MYPLANTS 29, first part; docs/REVIEW-ROUND-121.md): one home for the collection.
 *
 * - Plants, Spaces and Batches as one switch at the head of each, with counts; their addresses as before.
 * - A chip for each space holding plants of its own, in walking order, after "All"; a chip filters, and its count agrees.
 * - "Due" is "To look at".
 * - Three views, photographs, rows and a table, the same plants in the same order; the choice is remembered.
 * - The table under "All" is grouped by space, each group's "Watered" for that space only; a heading sorts it.
 * - "CSV of these N" gives the rows shown, in plants.csv's columns.
 *
 * On aa450b2: FAILED, every test (no switch, a space select, no views).
 */
import { test, expect, type Page } from '@playwright/test';
import { inject, type Row } from './helpers/inject';
import { ready } from './helpers/smoke';

test.use({ serviceWorkers: 'block' });
const DAY = 86_400_000;
const plant = (id: string, no: string, name: string, loc: string): Row[] =>
  Object.entries({ acc: no, taxonName: name, status: 'growing', nameKind: 'species', locationId: loc, acquired: '2026-01-10', sourceFrom: 'a nursery' }).map(([f, v]) => ['accession', id, f, v] as Row);
const space = (id: string, name: string, sort: number, parent?: string): Row[] => [['location', id, 'name', name], ['location', id, 'type', 'bench'], ['location', id, 'sort', sort], ...(parent ? [['location', id, 'parentId', parent] as Row] : [])];

async function open(page: Page) {
  await page.goto('/plants'); await ready(page);
  await page.locator('html[data-collection=open]').waitFor({ state: 'attached', timeout: 20_000 });
  await inject(page, [
    ...space('gh', 'Greenhouse', 1), ...space('b1', 'Bench 1', 1, 'gh'), ...space('b2', 'Bench 2', 2, 'gh'),
    ...plant('p1', '2026-0001', 'Copiapoa cinerea', 'b1'), ...plant('p2', '2026-0002', 'Lithops lesliei', 'b2'),
    ...plant('p3', '2026-0003', 'Haworthia truncata', 'b2'), ...plant('p4', '2026-0004', 'Aloe vera', 'b1')
  ], Date.now() - 30 * DAY, 'r121bbbbbbbbb001');
  await page.goto('/plants'); await ready(page);
  await expect(page.locator('.accrow')).toHaveCount(4);
}

test('r121b 1: Plants, Spaces and Batches are one switch with counts, at their own addresses @phone', async ({ page }) => {
  await open(page);
  const sw = page.getByRole('navigation', { name: 'Your collection' });
  await expect(sw.getByRole('link')).toHaveText([/^Plants\D*4$/, /^Spaces\D*3$/, /^Batches\D*0$/]);
  await expect(sw.getByRole('link', { name: /^Plants/ })).toHaveAttribute('aria-current', 'page');
  await sw.getByRole('link', { name: /^Spaces/ }).click();
  await expect(page).toHaveURL(/\/places$/);
  await expect(page.locator('h1')).toHaveText('Spaces');
  await expect(page.getByRole('navigation', { name: 'Your collection' }).getByRole('link', { name: /^Spaces/ })).toHaveAttribute('aria-current', 'page');
});

test('r121b 2: a chip for each space with plants of its own, in walking order; one filters, its count agrees @phone', async ({ page }) => {
  await open(page);
  const chips = page.locator('.spacechips button');
  await expect(chips).toHaveText([/^All\s*4$/, /^Bench 1\s*2$/, /^Bench 2\s*2$/]); // the Greenhouse holds none of its own
  await chips.nth(2).click();
  await expect(page.locator('.accrow')).toHaveCount(2);
  await expect(page).toHaveURL(/place=b2/);
  await chips.nth(0).click();
  await expect(page.locator('.accrow')).toHaveCount(4);
  await expect(page.getByRole('button', { name: /^To look at/ })).toBeVisible();
});

test('r121b 3: three views of the same plants in the same order, the choice remembered; the table grouped, sorted, its Watered for one space', async ({ page }) => {
  await open(page);
  const rowsOrder = await page.locator('.accrow .accno').allInnerTexts();
  await page.getByRole('button', { name: 'Photographs' }).click();
  await expect(page.locator('.ptile')).toHaveCount(4);
  await page.getByRole('button', { name: 'Table' }).click();
  // under All, grouped by space in walking order
  await expect(page.locator('.ptable .grp th > span:first-child')).toHaveText(['Greenhouse › Bench 1', 'Greenhouse › Bench 2']);
  const tableOrder = await page.locator('.ptable tbody tr:not(.grp) td:first-child').allInnerTexts();
  expect([...tableOrder].sort()).toEqual([...rowsOrder].sort());
  await page.reload(); await ready(page);
  await expect(page.locator('.ptable')).toBeVisible(); // remembered on this device
  // a space's Watered records for that space only
  await page.locator('.ptable .grp', { hasText: 'Bench 2' }).getByRole('button', { name: 'Watered' }).click();
  await expect(page.locator('.toast')).toContainText('2 watered');
  await expect(page.locator('.ptable tr', { hasText: '2026-0002' }).locator('td.num')).toHaveText('0 d');
  await expect(page.locator('.ptable tr', { hasText: '2026-0001' }).locator('td.num')).not.toHaveText('0 d');
  // a heading sorts it: by name, Aloe first within Bench 1
  await page.locator('.ptable thead').getByRole('button', { name: 'Name' }).click();
  await expect(page.locator('.ptable tbody').first().locator('tr:not(.grp)').first()).toContainText('Aloe vera');
});

test('r121b 4: "CSV of these N" is the rows shown, in plants.csv\'s columns', async ({ page }) => {
  await open(page);
  await page.locator('.spacechips button', { hasText: 'Bench 1' }).click();
  await page.getByRole('button', { name: 'Table' }).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'CSV of these 2' }).click()]);
  const text = Buffer.concat(await (await dl.createReadStream()).toArray()).toString('utf8').replace(/^﻿/, '');
  const lines = text.trim().split(/\r?\n/);
  expect(lines[0]).toMatch(/^number,species,/);
  expect(lines).toHaveLength(3);
  expect(text).toContain('2026-0001');
  expect(text).not.toContain('2026-0002');
});
