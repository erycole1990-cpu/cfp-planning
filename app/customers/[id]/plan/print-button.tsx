"use client";

export function PrintPlanButton() {
  return (
    <button className="btn btn-secondary no-print" type="button" onClick={() => window.print()}>
      Print / Save PDF
    </button>
  );
}
