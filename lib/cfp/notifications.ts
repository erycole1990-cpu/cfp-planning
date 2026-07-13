import "server-only";

type AssignmentEmailInput = {
  to?: string | null;
  agentName: string;
  customerName: string;
  adminName: string;
  reason: string;
};

export type AssignmentEmailResult = {
  status: "sent" | "not_configured" | "skipped" | "failed";
  message?: string;
};

export async function sendAgentAssignmentEmail(input: AssignmentEmailInput): Promise<AssignmentEmailResult> {
  if (!input.to) return { status: "skipped", message: "Agent has no email address." };

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFICATION_FROM_EMAIL;
  if (!apiKey || !from) {
    return { status: "not_configured", message: "Email provider is not configured." };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: `Client reassigned: ${input.customerName}`,
        text: [
          `Hi ${input.agentName},`,
          "",
          `${input.customerName} has been reassigned to you in CFP Planning.`,
          `Reassigned by: ${input.adminName}`,
          `Reason: ${input.reason}`,
          "",
          "Please review the client profile and next actions in the CFP Planning app.",
        ].join("\n"),
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      return { status: "failed", message: details.slice(0, 300) || response.statusText };
    }

    return { status: "sent" };
  } catch (error) {
    return { status: "failed", message: error instanceof Error ? error.message : "Email request failed." };
  }
}
