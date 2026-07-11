import { NextResponse } from "next/server";

export const runtime = "nodejs";

const allowedStatementTypes = ["cash_flow", "balance_sheet", "profit_loss"];
const allowedItemTypes = ["income", "expense", "asset", "liability", "revenue", "cost"];
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

function outputText(response: Record<string, unknown>) {
  if (typeof response.output_text === "string") return response.output_text;
  const output = Array.isArray(response.output) ? response.output : [];
  return output
    .flatMap((item) => (typeof item === "object" && item && "content" in item && Array.isArray(item.content) ? item.content : []))
    .map((content) => {
      if (typeof content !== "object" || !content) return "";
      if ("text" in content && typeof content.text === "string") return content.text;
      return "";
    })
    .join("");
}

function cleanRows(rows: unknown) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const item = row as Record<string, unknown>;
      const statementType = String(item.statementType || "cash_flow");
      const itemType = String(item.itemType || "expense");
      const category = String(item.category || "Other");
      const amount = Number(item.amount);

      return {
        statementType: allowedStatementTypes.includes(statementType) ? statementType : "cash_flow",
        itemType: allowedItemTypes.includes(itemType) ? itemType : "expense",
        category: categories.includes(category) ? category : "Other",
        description: String(item.description || "").slice(0, 140),
        amount: Number.isFinite(amount) ? Math.abs(amount) : 0,
        frequency: String(item.frequency || "one_time"),
        statementDate: typeof item.statementDate === "string" && item.statementDate ? item.statementDate : "",
      };
    })
    .filter((row) => row && row.description && row.amount > 0)
    .slice(0, 80);
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI import is not configured yet. Add OPENAI_API_KEY in Vercel environment variables first." },
      { status: 400 },
    );
  }

  const body = await request.json();
  const fileName = String(body.fileName || "statement");
  const mimeType = String(body.mimeType || "");
  const fileData = String(body.fileData || "");
  const target = String(body.target || "cash_flow");

  if (!fileData.startsWith("data:")) {
    return NextResponse.json({ error: "File could not be read. Please upload the statement again." }, { status: 400 });
  }

  const fileInput =
    mimeType.includes("pdf") || fileName.toLowerCase().endsWith(".pdf")
      ? { type: "input_file", filename: fileName, file_data: fileData, detail: "high" }
      : { type: "input_image", image_url: fileData, detail: "high" };

  const prompt = [
    "Read this Malaysian client financial statement or statement photo.",
    "Extract transaction or position rows for financial planning only.",
    `Preferred target: ${target}. Use auto judgment only when the file clearly belongs elsewhere.`,
    "Return income/expenses for personal cash flow, assets/liabilities for balance sheet, and revenue/cost/expense for business P&L.",
    "Use absolute positive MYR amounts. Put the transaction or statement date as YYYY-MM-DD when visible.",
    `Allowed categories: ${categories.join(", ")}.`,
    "Do not invent rows. If unsure, use Other and a conservative description.",
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            fileInput,
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "statement_import_rows",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["rows"],
            properties: {
              rows: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["statementType", "itemType", "category", "description", "amount", "frequency", "statementDate"],
                  properties: {
                    statementType: { type: "string", enum: allowedStatementTypes },
                    itemType: { type: "string", enum: allowedItemTypes },
                    category: { type: "string", enum: categories },
                    description: { type: "string" },
                    amount: { type: "number" },
                    frequency: { type: "string", enum: ["monthly", "weekly", "quarterly", "annual", "one_time", "current"] },
                    statementDate: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    return NextResponse.json({ error: data.error?.message || "AI import failed. Please try again." }, { status: response.status });
  }

  let parsed: unknown = {};
  try {
    parsed = JSON.parse(outputText(data));
  } catch {
    return NextResponse.json({ error: "AI could not return readable rows. Please try a clearer file." }, { status: 422 });
  }

  return NextResponse.json({ rows: cleanRows((parsed as { rows?: unknown }).rows) });
}
