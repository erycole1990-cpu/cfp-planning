"use client";

import { useMemo, useState } from "react";
import { importFinancialStatementItems } from "@/app/actions";

type ImportTarget = "cash_flow" | "balance_sheet" | "profit_loss" | "auto";

type SuggestedRow = {
  id: string;
  statementType: string;
  itemType: string;
  category: string;
  description: string;
  amount: string;
  frequency: string;
  statementDate: string;
};

const categories = [
  "Active Income",
  "Salary",
  "Bonus",
  "Rental Income",
  "Investment Income",
  "Business Income",
  "Royalty Income",
  "Income Tax",
  "EPF / Statutory Deduction",
  "Home Expenses",
  "Utilities",
  "Groceries / Food",
  "Housing Loan",
  "Car Loan",
  "Credit Card",
  "Education Loan",
  "Insurance",
  "Medical / Healthcare",
  "Education",
  "Parents Support",
  "Childcare",
  "Lifestyle",
  "Travel",
  "Savings / Investment",
  "Cash",
  "EPF / Retirement",
  "Investment",
  "Property",
  "Vehicle",
  "Loan",
  "Sales",
  "Service Income",
  "Cost of Goods",
  "Payroll",
  "Marketing",
  "Rent",
  "Other Income",
  "Other Expenses",
  "Other",
];

const statementTypeOptions = [
  { value: "cash_flow", label: "Cash Flow" },
  { value: "balance_sheet", label: "Balance Sheet" },
  { value: "profit_loss", label: "Business P&L" },
];

const itemTypeOptions = [
  { value: "income", label: "Income" },
  { value: "expense", label: "Expense" },
  { value: "asset", label: "Asset" },
  { value: "liability", label: "Liability" },
  { value: "revenue", label: "Revenue" },
  { value: "cost", label: "Cost" },
];

function normalizeDate(raw: string) {
  const value = raw.trim();
  if (!value) return "";

  const iso = value.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  }

  const local = value.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (!local) return "";
  const year = local[3].length === 2 ? `20${local[3]}` : local[3];
  return `${year}-${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}`;
}

function splitStatementLine(line: string) {
  return line
    .split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map((part) => part.replace(/^"|"$/g, "").trim())
    .filter(Boolean);
}

function extractAmount(line: string) {
  const dateFreeLine = line.replace(/\b\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}\b/g, " ");
  const matches = dateFreeLine.match(/-?\(?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?\)?|-?\d+(?:\.\d{1,2})?/g) ?? [];
  if (!matches.length) return null;

  const raw = matches[matches.length - 1];
  const amount = Number(raw.replace(/[(),]/g, ""));
  if (!Number.isFinite(amount)) return null;

  const negative = raw.includes("(") || raw.startsWith("-") || /\b(debit|dr|withdrawal|payment|purchase|charge)\b/i.test(line);
  return negative ? -Math.abs(amount) : Math.abs(amount);
}

function classifyCategory(description: string, amount: number) {
  const text = description.toLowerCase();
  if (/salary|payroll|wages|commission/.test(text)) return "Salary";
  if (/bonus/.test(text)) return "Bonus";
  if (/rental|tenant/.test(text)) return "Rental Income";
  if (/dividend|interest|distribution|coupon/.test(text)) return "Investment Income";
  if (/royalty/.test(text)) return "Royalty Income";
  if (/sales|invoice|merchant|stripe|grabpay|touch n go merchant/.test(text)) return "Sales";
  if (/epf|kwsp/.test(text)) return amount >= 0 ? "EPF / Retirement" : "EPF / Statutory Deduction";
  if (/tax|lhdn|pcb/.test(text)) return "Income Tax";
  if (/mortgage|housing|home loan/.test(text)) return "Housing Loan";
  if (/car loan|auto loan|vehicle loan|hire purchase/.test(text)) return "Car Loan";
  if (/credit card|visa|mastercard/.test(text)) return "Credit Card";
  if (/insurance|takaful|premium/.test(text)) return "Insurance";
  if (/doctor|clinic|hospital|medical|pharmacy/.test(text)) return "Medical / Healthcare";
  if (/school|tuition|university|college|education|ptptn/.test(text)) return "Education";
  if (/grocery|market|supermarket|food|restaurant|cafe/.test(text)) return "Groceries / Food";
  if (/electric|water|telco|internet|utility|unifi|maxis|celcom|digi/.test(text)) return "Utilities";
  if (/travel|hotel|flight|airasia|grab|petrol|parking|toll/.test(text)) return "Travel";
  if (/rent|office rent|shop rent/.test(text)) return "Rent";
  if (/marketing|ads|advertising/.test(text)) return "Marketing";
  if (/supplier|stock|inventory|cogs/.test(text)) return "Cost of Goods";
  if (/unit trust|shares|stock|investment|prs/.test(text)) return "Investment";
  if (/property|house|land/.test(text)) return "Property";
  if (/loan|financing|debt/.test(text)) return "Loan";
  return amount >= 0 ? "Other Income" : "Other Expenses";
}

function classifyStatementType(description: string, target: ImportTarget) {
  if (target !== "auto") return target;
  const text = description.toLowerCase();
  if (/balance|market value|cash value|outstanding|asset|liability|portfolio|epf|kwsp/.test(text)) return "balance_sheet";
  if (/sales|invoice|supplier|cost of goods|payroll|business|merchant|stock purchase/.test(text)) return "profit_loss";
  return "cash_flow";
}

function classifyItemType(statementType: string, description: string, amount: number) {
  const text = description.toLowerCase();
  if (statementType === "balance_sheet") {
    return /loan|debt|outstanding|credit card|liability|mortgage/.test(text) ? "liability" : "asset";
  }
  if (statementType === "profit_loss") {
    if (amount >= 0) return "revenue";
    return /supplier|stock|inventory|cogs|cost of goods/.test(text) ? "cost" : "expense";
  }
  return amount >= 0 ? "income" : "expense";
}

function buildDescription(line: string, amount: number | null) {
  const amountText = amount === null ? "" : String(Math.abs(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return line
    .replace(/\b\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}\b/g, " ")
    .replace(amountText, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function parseStatementText(input: string, target: ImportTarget) {
  const rows = input
    .split(/\r?\n/)
    .map((line, index) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.length < 5) return null;

      const parts = splitStatementLine(trimmed);
      const joined = parts.join(" ");
      const date = normalizeDate(joined);
      const amount = extractAmount(joined);
      if (amount === null || amount === 0) return null;

      const description = buildDescription(joined, amount) || joined.slice(0, 120);
      const statementType = classifyStatementType(description, target);
      const itemType = classifyItemType(statementType, description, amount);

      return {
        id: `${Date.now()}-${index}`,
        statementType,
        itemType,
        category: classifyCategory(description, amount),
        description,
        amount: String(Math.abs(amount)),
        frequency: statementType === "balance_sheet" ? "current" : "one_time",
        statementDate: date,
      };
    })
    .filter((row) => row !== null) as SuggestedRow[];

  return rows.slice(0, 80);
}

export function StatementImporter({ customerId, actor }: { customerId: string; actor: string }) {
  const [rawText, setRawText] = useState("");
  const [target, setTarget] = useState<ImportTarget>("cash_flow");
  const [rows, setRows] = useState<SuggestedRow[]>([]);
  const [notice, setNotice] = useState("");

  const totalAmount = useMemo(() => rows.reduce((total, row) => total + Number(row.amount || 0), 0), [rows]);

  function updateRow(id: string, key: keyof SuggestedRow, value: string) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, [key]: value } : row)));
  }

  function removeRow(id: string) {
    setRows((current) => current.filter((row) => row.id !== id));
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!/(text|csv|plain|excel|spreadsheet)/i.test(file.type) && !/\.(csv|txt)$/i.test(file.name)) {
      setNotice("Photo and PDF OCR needs the AI/OCR engine. For now, export the statement to CSV/TXT or paste the extracted text below.");
      return;
    }

    const text = await file.text();
    setRawText(text);
    setRows(parseStatementText(text, target));
    setNotice(`Loaded ${file.name}. Please review the suggested rows before saving.`);
  }

  function classify() {
    const suggested = parseStatementText(rawText, target);
    setRows(suggested);
    setNotice(suggested.length ? `${suggested.length} suggested row(s) ready for review.` : "No transactions found. Try CSV/text with date, description, and amount columns.");
  }

  return (
    <details className="rounded-md border border-[#dce2dc] p-4">
      <summary className="cursor-pointer text-lg font-bold">Import statement</summary>
      <p className="mt-2 text-sm text-[#68756f]">
        Upload CSV/TXT or paste statement text. The app will suggest the right statement, category, and type; review before saving.
      </p>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_0.65fr]">
        <label className="field">
          <span className="label">Statement file</span>
          <input className="input" type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(event) => handleFile(event.target.files?.[0])} />
        </label>
        <label className="field">
          <span className="label">Import target</span>
          <select className="input" value={target} onChange={(event) => setTarget(event.target.value as ImportTarget)}>
            <option value="cash_flow">Cash Flow</option>
            <option value="balance_sheet">Balance Sheet</option>
            <option value="profit_loss">Business P&L</option>
            <option value="auto">Auto suggest</option>
          </select>
        </label>
      </div>

      <label className="field mt-3">
        <span className="label">Paste statement text</span>
        <textarea
          className="input min-h-28"
          value={rawText}
          onChange={(event) => setRawText(event.target.value)}
          placeholder="Paste rows with date, description, and amount. Example: 2026-07-01 Salary 8500"
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button className="btn" type="button" onClick={classify}>
          Read and Classify
        </button>
        <p className="text-sm text-[#68756f]">{notice || "CSV/TXT works now. Photo/PDF OCR can be connected in the next AI sprint."}</p>
      </div>

      {rows.length ? (
        <form action={importFinancialStatementItems} className="mt-4">
          <input type="hidden" name="customer_id" value={customerId} />
          <input type="hidden" name="actor" value={actor} />
          <div className="mb-3 rounded-md bg-[#f5f7f4] p-3 text-sm font-semibold text-[#405047]">
            Review {rows.length} row(s). Total detected amount: RM {totalAmount.toLocaleString("en-MY", { maximumFractionDigits: 0 })}.
          </div>
          <div className="table-wrap rounded-md border border-[#dce2dc]">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Statement</th>
                  <th>Type</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <input className="input" name="statement_date" type="date" value={row.statementDate} onChange={(event) => updateRow(row.id, "statementDate", event.target.value)} />
                      <input type="hidden" name="frequency" value={row.frequency} />
                    </td>
                    <td>
                      <select className="input" name="statement_type" value={row.statementType} onChange={(event) => updateRow(row.id, "statementType", event.target.value)}>
                        {statementTypeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select className="input" name="item_type" value={row.itemType} onChange={(event) => updateRow(row.id, "itemType", event.target.value)}>
                        {itemTypeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select className="input" name="category" value={row.category} onChange={(event) => updateRow(row.id, "category", event.target.value)}>
                        {categories.map((category) => (
                          <option key={category}>{category}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input className="input" name="description" value={row.description} onChange={(event) => updateRow(row.id, "description", event.target.value)} />
                    </td>
                    <td>
                      <input className="input" name="amount" min="0" step="1" type="number" value={row.amount} onChange={(event) => updateRow(row.id, "amount", event.target.value)} />
                    </td>
                    <td>
                      <button className="btn btn-secondary" type="button" onClick={() => removeRow(row.id)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn mt-4" type="submit">
            Save Approved Rows
          </button>
        </form>
      ) : null}
    </details>
  );
}
