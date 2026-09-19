import { checkMcpRateLimit } from "@/lib/mcp/rate-limit";
import { getFollowUpsForUser } from "@/lib/networking/interactions";
import { formatDateOnly } from "@/lib/networking/dateOnly";

export async function handleListFollowups(
  userId: string,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const rateCheck = checkMcpRateLimit(userId);
  if (!rateCheck.allowed) {
    const resetSec = Math.ceil(rateCheck.resetIn / 1000);
    return {
      content: [{ type: "text", text: `Rate limit exceeded. Try again in ${resetSec}s.` }],
    };
  }

  try {
    // The same query the Networking page's follow-ups card runs: open steps
    // whose date is today or earlier, oldest first.
    const { data } = await getFollowUpsForUser(userId);
    if (data.length === 0) {
      return { content: [{ type: "text", text: "No follow-ups are due." }] };
    }

    const lines = data.map((row: any) => {
      const company = row.Contact.Company?.label
        ? ` (${row.Contact.Company.label})`
        : "";
      const job = row.Job
        ? `, job: ${row.Job.JobTitle.label} @ ${row.Job.Company.label}`
        : "";
      return (
        `- ${row.nextStep} — ${row.Contact.name}${company}, ` +
        `${row.Purpose.label}, due ${formatDateOnly(row.nextStepDate)}${job} ` +
        `(interaction id: ${row.id}, contact id: ${row.Contact.id})`
      );
    });

    return {
      content: [
        {
          type: "text",
          text:
            `${data.length} follow-up${data.length === 1 ? "" : "s"} due, oldest first:\n` +
            lines.join("\n"),
        },
      ],
    };
  } catch (err: any) {
    return {
      content: [{ type: "text", text: `Error: ${err?.message ?? "Unknown error"}` }],
    };
  }
}
