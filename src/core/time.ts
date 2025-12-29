const MINUTES_IN_DAY = 24 * 60;

const pad2 = (value: number) => String(value).padStart(2, "0");

export const getDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  return `${year}-${month}-${day}`;
};

export const parseTimeToMinutes = (time: string) => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time.trim());
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours * 60 + minutes;
};

export const minutesToTimeString = (minutesTotal: number) => {
  const safe = ((minutesTotal % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${pad2(hours)}:${pad2(minutes)}`;
};

export const setTimeOnDate = (date: Date, time: string) => {
  const minutes = parseTimeToMinutes(time);
  const base = new Date(date);
  if (minutes === null) {
    return base;
  }
  base.setHours(0, 0, 0, 0);
  base.setMinutes(minutes);
  return base;
};

export const addMinutes = (date: Date, minutes: number) => {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + minutes);
  return next;
};

export const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

export const formatTimeForDisplay = (date: Date) => {
  try {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  }
};
