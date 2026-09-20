/** Round to one decimal place, as figures are printed and plotted: the one r1, shared by the climate provider and the climograph. */
export const r1 = (x: number): number => Math.round(x * 10) / 10;
