/** What the top bar says. Detail pages set it; list pages leave it to the section name. */
export const crumb = $state<{ parts: Array<{ label: string; href?: string }> }>({ parts: [] });
export function setCrumb(parts: Array<{ label: string; href?: string }>) {
  crumb.parts = parts;
}
