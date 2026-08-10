import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/de";
import "dayjs/locale/en";

dayjs.extend(relativeTime);

let CURRENT_LOCALE = "de";

export const setFormatLocale = (l) => {
  CURRENT_LOCALE = l === "en" ? "en" : "de";
  dayjs.locale(CURRENT_LOCALE);
};

// Initialize on module load
dayjs.locale(CURRENT_LOCALE);

const dj = (iso) => dayjs(iso).locale(CURRENT_LOCALE);

export const fmtDate = (iso) => (iso ? dj(iso).format("DD.MM.YYYY") : "—");
export const fmtDateTime = (iso) => (iso ? dj(iso).format("DD.MM.YYYY HH:mm") : "—");
export const fmtTime = (iso) => (iso ? dj(iso).format("HH:mm") : "—");
export const fmtRel = (iso) => (iso ? dj(iso).fromNow() : "—");

export const fmtCHF = (n) => {
  const locale = CURRENT_LOCALE === "de" ? "de-CH" : "en-CH";
  return `CHF ${Number(n).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const bizDays = (n) => {
  if (CURRENT_LOCALE === "de") return `${n} ${n === 1 ? "Werktag" : "Werktage"}`;
  return `${n} business day${n === 1 ? "" : "s"}`;
};

export const isOverdue = (iso) => iso && dayjs(iso).isBefore(dayjs());
