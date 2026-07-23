export function escapeCsvCell(value: string): string {
  const text = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(
  headers: string[],
  rows: Array<Array<string | number | undefined | null>>,
): string {
  const lines = [
    headers.map((h) => escapeCsvCell(h)).join(","),
    ...rows.map((row) =>
      row.map((cell) => escapeCsvCell(String(cell ?? ""))).join(","),
    ),
  ];
  return `\uFEFF${lines.join("\n")}\n`;
}
