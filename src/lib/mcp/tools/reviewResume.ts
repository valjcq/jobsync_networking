import { APP_CONSTANTS } from "@/lib/constants";
import { checkMcpRateLimit } from "@/lib/mcp/rate-limit";
import { getDefaultResumeForUser } from "@/lib/jobs/getDefaultResumeForUser";
import {
  preprocessResume,
  describeResumeFailure,
  type ResumeTextSource,
} from "@/lib/ai/tools/preprocessing";
import {
  RESUME_REVIEW_SYSTEM_PROMPT,
  buildResumeReviewPrompt,
} from "@/lib/ai/prompts/resume-review";

// Do not restate the SCORES line format, the "##" section list or the
// serialization disclaimer here — the shared system prompt and user-prompt
// builder specify all three. Restating any of them creates a second source
// that can drift.
function buildReviewDirective(
  resumeId: string,
  normalizedResumeText: string,
  source: ResumeTextSource = "sections",
): string {
  // Extracted PDF text carries no visual layout, so a formatting score from it
  // would be a guess about something the reviewer cannot see.
  const fileNote =
    source === "file"
      ? `The resume text was extracted from the attached file, so its visual ` +
        `layout is lost: judge content, not formatting.\n\n`
      : "";
  return (
    `Act as the reviewer described below and produce a review of the ` +
    `resume shown here.\n\n` +
    fileNote +
    `${RESUME_REVIEW_SYSTEM_PROMPT}\n\n` +
    `${buildResumeReviewPrompt(normalizedResumeText)}\n\n` +
    `Then call save_resume_review with the full SCORES line + markdown body ` +
    `you just produced as the "reviewText" argument (not as a chat message):\n` +
    `    { "resumeId": "${resumeId}", "reviewText": "<the full SCORES line + markdown body>" }`
  );
}

export async function handleReviewResume(
  userId: string,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const rateCheck = checkMcpRateLimit(userId);
  if (!rateCheck.allowed) {
    const resetSec = Math.ceil(rateCheck.resetIn / 1000);
    return {
      content: [
        { type: "text", text: `Rate limit exceeded. Try again in ${resetSec}s.` },
      ],
    };
  }

  const resume = await getDefaultResumeForUser(userId);
  if (!resume) {
    return {
      content: [
        {
          type: "text",
          text: "No default resume set — set one in Profile → Resumes.",
        },
      ],
    };
  }

  const pre = await preprocessResume(resume);
  if (!pre.success) {
    return {
      content: [
        {
          type: "text",
          text: `Default resume couldn't be used for review. ${describeResumeFailure(pre.error?.code)}`,
        },
      ],
    };
  }

  if (
    pre.data.normalizedText.length < APP_CONSTANTS.MCP_REVIEW_MIN_RESUME_LENGTH
  ) {
    return {
      content: [{ type: "text", text: "Resume too short to review." }],
    };
  }

  const directive = buildReviewDirective(
    resume.id!,
    pre.data.normalizedText,
    pre.data.source,
  );
  return { content: [{ type: "text", text: directive }] };
}
