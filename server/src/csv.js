const COLUMNS = [
  "id",
  "locationId",
  "category",
  "name",
  "description",
  "priceType",
  "amount",
  "amountMin",
  "amountMax",
  "effectiveDate",
  "included",
  "excluded",
  "status",
];

// Excel, LibreOffice, and Google Sheets treat a cell that begins with one of
// these as a formula, so an offering named `=HYPERLINK("http://evil","Click")`
// — or a DDE/command payload — executes when the exported file is opened.
// Prefixing with an apostrophe forces the cell to be read as text. The
// character is stripped again on import (see parseCsv) so a round-trip through
// export/import doesn't accumulate them.
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function csvField(value) {
  let s = value === null || value === undefined ? "" : String(value);
  if (FORMULA_PREFIX.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function offeringsToCsv(offerings) {
  const lines = [COLUMNS.join(",")];
  for (const o of offerings) {
    const row = [
      o.id,
      o.locationId,
      o.category,
      o.name,
      o.description,
      o.priceType,
      o.amount,
      o.amountMin,
      o.amountMax,
      o.effectiveDate,
      (o.included || []).join("; "),
      (o.excluded || []).join("; "),
      o.status,
    ];
    lines.push(row.map(csvField).join(","));
  }
  return lines.join("\r\n");
}

// Minimal quote-aware CSV parser — handles quoted fields with embedded commas/newlines/escaped quotes.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  const normalized = String(text || "").replace(/\r\n/g, "\n");
  for (let i = 0; i < normalized.length; i++) {
    const c = normalized[i];
    if (inQuotes) {
      if (c === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      pushField();
    } else if (c === "\n") {
      pushRow();
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) pushRow();

  const nonEmpty = rows.filter((r) => !(r.length === 1 && r[0] === ""));
  if (nonEmpty.length === 0) return [];
  const header = nonEmpty[0].map((h) => h.trim());
  return nonEmpty.slice(1).map((r) => {
    // Null-prototype object: header names come from the uploaded file, so a
    // column literally called `__proto__` would otherwise write through to
    // Object.prototype instead of becoming a normal key.
    const obj = Object.create(null);
    header.forEach((h, idx) => {
      const raw = r[idx] !== undefined ? r[idx] : "";
      // Undo the anti-formula apostrophe added on export, so export -> import
      // round-trips cleanly instead of stacking quotes.
      obj[h] = /^'[=+\-@\t\r]/.test(raw) ? raw.slice(1) : raw;
    });
    return obj;
  });
}
