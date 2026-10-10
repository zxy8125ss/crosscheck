// 本地时区的 YYYY-MM-DD
export const today = (d = new Date()) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
export const month = (date: string) => date.slice(0, 7);
