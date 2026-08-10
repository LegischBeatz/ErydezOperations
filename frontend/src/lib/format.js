import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

export const fmtDate = (iso) => (iso ? dayjs(iso).format("DD.MM.YYYY") : "—");
export const fmtDateTime = (iso) => (iso ? dayjs(iso).format("DD.MM.YYYY HH:mm") : "—");
export const fmtTime = (iso) => (iso ? dayjs(iso).format("HH:mm") : "—");
export const fmtRel = (iso) => (iso ? dayjs(iso).fromNow() : "—");
export const fmtCHF = (n) =>
  `CHF ${Number(n).toLocaleString("en-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const bizDays = (n) => `${n} business day${n === 1 ? "" : "s"}`;
export const isOverdue = (iso) => iso && dayjs(iso).isBefore(dayjs());
