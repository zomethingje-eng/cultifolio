/**
 * Round sixty-two, second pass, agent G: "Read > and / as a path" (the verification grower review, 6). A "/" counts as
 * a step only outside brackets, and only with spaces on both sides, or with none between two words of three letters or
 * more after a place here; a ">" between letters or with spaces on both sides. Both lists: what is a path, and what is
 * one place's own name. Adopted from /tmp/r62rev/out/tests/grower--import-paths.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { asPath, loosePaths } from '$lib/import/plan';

const places = [
  { id: 'g', name: 'Greenhouse', parentId: null },
  { id: 'b', name: 'Bench 2', parentId: 'g' },
  { id: 'f', name: 'Cold frame', parentId: null }
];

describe('one place by its own name, never split', () => {
  it.each([
    'Cold frame (N/S)', 'S/W window', 'N/E bench', 'Shelf 1/2', 'Front/back', 'Sun/shade bench', 'Shelf >1 m',
    'Cold frame (east > west)', 'Bench [A/B]', 'Window 2/3 up', 'Up/down', 'Greenhouse/NW'
  ])('%s', (cell) => {
    expect(asPath(cell, places)).toBe(cell); // base: "Cold frame (N › S)", "S › W window", "N › E bench", "Front › back", …
  });
});

describe('a path, read as one', () => {
  it.each([
    ['Greenhouse > Bench 1', 'Greenhouse › Bench 1'],
    ['Greenhouse>Bench 1', 'Greenhouse › Bench 1'],
    ['Greenhouse / Bench 1', 'Greenhouse › Bench 1'],
    ['Shed / Top shelf', 'Shed › Top shelf'],
    ['Greenhouse/Bench 1', 'Greenhouse › Bench 1'],
    ['greenhouse/Bench 2/Tray', 'greenhouse › Bench 2/Tray'],
    ['Greenhouse/Bench 2 > Tray 1', 'Greenhouse › Bench 2 › Tray 1'],
    ['Cold frame/East end (N/S)', 'Cold frame › East end (N/S)']
  ])('%s', (cell, path) => {
    expect(asPath(cell, places)).toBe(path);
  });
  it('a "/" with no spaces is a step only after a place here', () => {
    expect(asPath('Greenhouse/Bench 1', [])).toBe('Greenhouse/Bench 1');
    expect(asPath('Greenhouse / Bench 1', [])).toBe('Greenhouse › Bench 1');
  });
});

describe('the sheet-wide question counts only the paths', () => {
  it('the real paths, and not the names with a slash', () => {
    const cells = ['Greenhouse > Bench 1', 'Greenhouse > Bench 2', 'Cold frame (N/S)', 'S/W window', 'Shelf 1/2', null];
    expect(loosePaths(cells, [{ id: 'g', name: 'Greenhouse', parentId: null }])).toEqual({ paths: 2, yes: true, example: 'Greenhouse > Bench 1' }); // base: 4
    expect(loosePaths(['Cold frame (N/S)', 'S/W window', 'N/E bench'], []).paths).toBe(0); // base: 3, and the box was shown
  });
});
