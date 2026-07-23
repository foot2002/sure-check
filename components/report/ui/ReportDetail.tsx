import type { ReactNode } from "react";

/** Standard stack inside `.report-expand-panel`. */
export function ReportDetailStack({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`report-detail-stack ${className}`.trim()}>{children}</div>
  );
}

/** One titled subsection inside an expand panel. */
export function ReportDetailBlock({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`report-detail-block ${className}`.trim()}>
      <h3 className="report-detail-heading">{title}</h3>
      {children}
    </section>
  );
}

export function ReportDetailLabel({ children }: { children: ReactNode }) {
  return <span className="report-detail-label">{children}</span>;
}

export function ReportDetailBody({
  children,
  strong = false,
  className = "",
}: {
  children: ReactNode;
  strong?: boolean;
  className?: string;
}) {
  return (
    <p
      className={`${strong ? "report-detail-body-strong" : "report-detail-body"} ${className}`.trim()}
    >
      {children}
    </p>
  );
}

export function ReportDetailNote({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={`report-detail-note ${className}`.trim()}>{children}</p>
  );
}

/** Label + body field used in accordion / detail forms. */
export function ReportDetailField({
  label,
  children,
  strong = false,
}: {
  label: string;
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="report-detail-field">
      <ReportDetailLabel>{label}</ReportDetailLabel>
      {typeof children === "string" || typeof children === "number" ? (
        <ReportDetailBody strong={strong}>{children}</ReportDetailBody>
      ) : (
        children
      )}
    </div>
  );
}

export function ReportDetailKvGrid({
  rows,
}: {
  rows: Array<{ label: string; value: ReactNode }>;
}) {
  return (
    <dl className="report-detail-kv">
      {rows.map((row) => (
        <div key={row.label} className="report-detail-kv-item">
          <dt className="report-detail-label">{row.label}</dt>
          <dd className="report-detail-body-strong">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ReportDetailList({
  items,
  empty,
}: {
  items: string[];
  empty?: string;
}) {
  if (items.length === 0) {
    return empty ? <p className="report-detail-body">{empty}</p> : null;
  }
  return (
    <ul className="report-detail-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export function ReportDetailTile({
  children,
  tone = "muted",
  className = "",
}: {
  children: ReactNode;
  tone?: "muted" | "white" | "action";
  className?: string;
}) {
  const base =
    tone === "white"
      ? "report-detail-tile-white"
      : tone === "action"
        ? "report-detail-action"
        : "report-detail-tile";
  return <div className={`${base} ${className}`.trim()}>{children}</div>;
}

function clampText(value: string, max = 120): { display: string; full: string } {
  const full = value.trim();
  if (full.length <= max) return { display: full, full };
  return { display: `${full.slice(0, max).trim()}…`, full };
}

/**
 * Single responsive evidence table — no duplicated mobile/desktop markup.
 * Desktop: bordered 3-col table. Mobile: each row becomes a compact card via CSS.
 */
export function ReportDetailTable({
  headers,
  rows,
  renderCell,
  clampFromColumn = 1,
}: {
  headers: string[];
  rows: string[][];
  /** Optional custom cell renderer (e.g. status chips). */
  renderCell?: (cell: string, columnIndex: number, row: string[]) => ReactNode;
  /** Columns from this index onward get truncated for scanability. */
  clampFromColumn?: number;
}) {
  return (
    <div className="report-detail-table-shell">
      <table className="report-detail-table">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header} scope="col">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.join("|")}>
              {row.map((cell, index) => {
                const custom = renderCell?.(cell, index, row);
                let content: ReactNode = custom ?? cell;

                if (
                  custom === undefined &&
                  index >= clampFromColumn &&
                  typeof cell === "string"
                ) {
                  const { display, full } = clampText(cell, index === 0 ? 40 : 110);
                  content =
                    display === full ? (
                      full
                    ) : (
                      <span className="report-detail-clamp" title={full}>
                        {display}
                      </span>
                    );
                }

                return (
                  <td key={`${headers[index]}_${index}`} data-label={headers[index]}>
                    {content}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
