/** Display formatters. Keep units consistent across the whole app. */

const KM_PER_MI = 1.609344;

export function formatDistance(km: number, unit: "km" | "mi" = "km"): string {
  if (unit === "mi") {
    const miles = km / KM_PER_MI;
    return miles >= 1000
      ? `${Math.round(miles).toLocaleString("en")} mi`
      : `${miles.toFixed(0)} mi`;
  }
  return km >= 10000
    ? `${Math.round(km / 1000).toLocaleString("en")},000 km`
    : `${Math.round(km).toLocaleString("en")} km`;
}

/** "6h 45m", "45m". */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** "1,240 h" for totals, where minutes are noise. */
export function formatTotalDuration(minutes: number): string {
  return `${Math.round(minutes / 60).toLocaleString("en")} h`;
}

/** Parse an ISO `yyyy-mm-dd` as a calendar date, not a UTC instant. */
export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

export function formatDate(iso: string): string {
  return parseIsoDate(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatMonthYear(iso: string): string {
  return parseIsoDate(iso).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function todayIso(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString().slice(0, 10);
}

export function yearOf(iso: string): string {
  return iso.slice(0, 4);
}

export function formatCo2(kg: number): string {
  return kg >= 1000 ? `${(kg / 1000).toFixed(1)} t` : `${Math.round(kg)} kg`;
}

export function formatMoney(minor: number | null, currency: string | null): string | null {
  if (minor === null) return null;
  const amount = minor / 100;
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: currency ?? "USD",
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency ?? ""}`.trim();
  }
}

const CABIN_LABEL: Record<string, string> = {
  economy: "Economy",
  premium_economy: "Premium Economy",
  business: "Business",
  first: "First",
};

export function formatCabin(cabin: string | null): string {
  if (!cabin) return "—";
  return CABIN_LABEL[cabin] ?? cabin;
}
