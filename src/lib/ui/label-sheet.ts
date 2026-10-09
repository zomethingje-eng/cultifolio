/**
 * The label stock a page opens on before the grower has picked one: US Letter (Avery 5160) where Letter is the paper
 * in the tray, the United States and Canada; A4 (Avery L7160) everywhere else. Every locale opened on 5160, so a UK or EU
 * grower's first sheet printed on the wrong paper size (round sixty; the grower review, 9).
 */
export function defaultSheet(lang: string | null | undefined): '5160' | 'L7160' {
  const region = (lang ?? '').replace('_', '-').split('-')[1]?.toUpperCase();
  return region === 'US' || region === 'CA' ? '5160' : 'L7160';
}

/**
 * How many care lines print a group's convention, which has no source (`careLine`'s "group min 13 °C (convention, no
 * source)"): the labels page says what that is, once, above the sheet (round sixty-two, second pass; triage-self N10,
 * the visitor-words review's V7).
 */
export function conventionLines(lines: Array<string | null | undefined>): number {
  return lines.filter((l) => !!l && l.includes('(convention, no source)')).length;
}
