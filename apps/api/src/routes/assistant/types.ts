export type UserContext = {
  userName: string | null;
  userEmail: string;
  primaryContactId: string | null;
  primaryContactName: string | null;
};

export function formatToday(date: Date, timezone?: string): string {
  const tz = timezone || "UTC";
  const datePart = date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: tz,
  });
  const timePart = date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: tz,
  });
  const iso = date.toISOString();
  return `${datePart}, current time: ${timePart} (UTC: ${iso})`;
}
