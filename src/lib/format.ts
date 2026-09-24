export const money = (value: number | string | null | undefined) => {
  const n = Number(value ?? 0);
  return n.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const num = (value: number | string | null | undefined) => Number(value ?? 0);

export const plain = (value: number | string | null | undefined) => Number(value ?? 0).toFixed(2);

export const dateTime = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

export const dateOnly = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "";

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const monthStartISO = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};
