/**
 * Round sixty-three, agent U (U1): the fallback faces, on whatever machine runs this. Every fallback face whose local font
 * this machine has is measured against the web font it stands in for, at the weight and style it stands in for, on the
 * site's own sentences: a line set in it must be within 2.5% of the web font's width, or text set in it before the web
 * fonts arrive wraps at other words when they come (the layout shift the review of round sixty-two, 11, measured on
 * Windows: 0.107 on the front page). On Linux this checks the Liberation and DejaVu faces, on the owner's Windows PC the
 * Segoe UI, Georgia, Times New Roman, Arial and Consolas ones, on a Mac Helvetica Neue, Georgia and Menlo; a face whose
 * local font is missing is listed and skipped, as the browser skips it.
 *
 * Before this round the monospace stack had no fallback face: Consolas set DM Mono's text 8.4% narrower (0.550 em a
 * letter against 0.600), and the bold and italic faces were the regular one emboldened or slanted by the browser
 * (Newsreader's italic is 6% narrower than its roman; Georgia's synthetic italic is not).
 */
import { test, expect } from '@playwright/test';

const SENTENCES = [
  'A reference for cactus, succulent and bulb species, and the plants most grown alongside them, with each one\'s habitat climate where its records allow one.',
  'Every figure names its source. No sign-up. Your plants stay on your device, or sync encrypted if you choose.',
  'Copiapoa cinerea var. columna-alba, Lithops lesliei, Astrophytum asterias, Haworthia cooperi var. truncata'
];
const MONO = ['8,947 species · 6,312 with habitat climate', '2026-0001 2026-0002 ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

test.use({ serviceWorkers: 'block' });

test('r63u U1: every fallback face this machine has sets the site\'s sentences within 2.5% of the web font\'s width', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/about/how');
  await page.locator('html[data-ready]').waitFor({ state: 'attached', timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
  const out = await page.evaluate(async ({ SENTENCES, MONO }) => {
    const webOf = (fam: string) => (fam.startsWith('Public Sans') ? 'Public Sans Variable' : fam.startsWith('Newsreader') ? 'Newsreader Variable' : 'DM Mono');
    const span = document.createElement('span');
    span.style.cssText = 'position:absolute;left:-99999px;top:0;white-space:nowrap;font-size:20px;letter-spacing:0;font-synthesis:none';
    document.body.appendChild(span);
    const width = (family: string, weight: string, style: string, text: string) => {
      span.style.fontFamily = `'${family}'`; span.style.fontWeight = weight; span.style.fontStyle = style; span.textContent = text;
      return span.getBoundingClientRect().width;
    };
    const rows: Array<{ face: string; ratio: number }> = [];
    const missing: string[] = [];
    for (const f of [...document.fonts]) {
      const fam = f.family.replace(/^"|"$/g, '');
      if (!fam.includes(' Fallback ')) continue;
      const weight = f.weight.split(' ')[0] === '100' ? '400' : f.weight.split(' ')[0] === 'normal' ? '400' : f.weight.split(' ')[0];
      const name = `${fam} ${f.weight} ${f.style}`;
      try { await f.load(); } catch { missing.push(name); continue; }
      if (f.status !== 'loaded') { missing.push(name); continue; }
      const web = webOf(fam);
      await document.fonts.load(`${f.style === 'italic' ? 'italic ' : ''}${weight} 20px "${web}"`);
      const texts = fam.startsWith('DM Mono') ? MONO : SENTENCES;
      // The Newsreader italic is declared at 200 to 800; DM Mono at 400 alone (its other weights are drawn from it).
      const w = web === 'DM Mono' ? '400' : weight;
      let a = 0, b = 0;
      for (const t of texts) { a += width(fam, weight, f.style, t); b += width(web, w, f.style, t); }
      rows.push({ face: name, ratio: a / b });
    }
    span.remove();
    return { rows, missing };
  }, { SENTENCES, MONO });
  console.log(`fallback faces against the web fonts:\n  ${out.rows.map((r) => `${r.face}: ${(r.ratio * 100).toFixed(1)}%`).join('\n  ')}\n  not on this machine: ${out.missing.length}`);
  test.skip(out.rows.length === 0, 'none of the fallback faces\' local fonts is on this machine, so nothing here can be measured');
  for (const r of out.rows) expect.soft(Math.abs(r.ratio - 1), `${r.face} sets the sentences at ${(r.ratio * 100).toFixed(1)}% of the web font's width`).toBeLessThan(0.025);
});
