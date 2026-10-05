/**
 * A storage failure in words. Chrome's QuotaExceededError carries an empty message, so a page that showed
 * `err.message` said nothing at all when the device was full (round twenty-nine, 4). The figure is what the browser
 * reports as in use, when it reports one.
 */
export async function storageErrorText(err: unknown): Promise<string | null> {
  const name = err instanceof Error ? err.name : '';
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (!/quota|QuotaExceeded|NS_ERROR_DOM_QUOTA|out of space|disk is full/i.test(name + ' ' + msg)) return null;
  let used = '';
  try {
    const est = await navigator.storage?.estimate?.();
    if (est?.usage != null) used = `: ${Math.round(est.usage / 1048576)} MB in use${est.quota ? ` of the ${Math.round(est.quota / 1048576)} MB the browser allows this site` : ''}`;
  } catch {
    /* no estimate: the sentence stands without a figure */
  }
  return `This device is out of space for the collection${used}. Free some space, or back up and remove what you can spare.`;
}
