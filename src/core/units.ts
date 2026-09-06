export type DisplayUnit = "ml" | "fl oz" | "cups";

export const formatLiquid = (ml: number, unit: DisplayUnit): string => {
  if (unit === "fl oz") {
    // 1 fl oz (US) is approx 29.5735 ml
    const oz = ml / 29.5735;
    return `${Math.round(oz)} fl oz`;
  }
  if (unit === "cups") {
    // 1 cup (US legal) is approx 240 ml
    const cups = ml / 240;
    // Round to nearest 0.1 for cups
    return `${Number(cups.toFixed(1))} cups`;
  }
  return `${Math.round(ml)} ml`;
};

export const convertToUnit = (ml: number, unit: DisplayUnit): number => {
  if (unit === "fl oz") {
    return ml / 29.5735;
  }
  if (unit === "cups") {
    return ml / 240;
  }
  return ml;
};

export const convertFromUnit = (amount: number, unit: DisplayUnit): number => {
  if (unit === "fl oz") {
    return amount * 29.5735;
  }
  if (unit === "cups") {
    return amount * 240;
  }
  return amount;
};
