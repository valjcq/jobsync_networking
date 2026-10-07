import prisma from "@/lib/db";

// Session-free core of the job status change: takes the caller's userId and
// throws on failure. The updateJobStatus server action and the MCP
// set_job_status tool both call it, so the applied/interview side effects
// cannot drift between the two.

export const jobStatusUpdateData = (status: { id: string; value: string }) => {
  switch (status.value) {
    case "applied":
      return { statusId: status.id, applied: true, appliedDate: new Date() };
    case "interview":
      return { statusId: status.id, applied: true };
    default:
      return { statusId: status.id };
  }
};

export const setJobStatusForUser = (
  userId: string,
  jobId: string,
  status: { id: string; value: string },
) =>
  prisma.job.update({
    where: { id: jobId, userId },
    data: jobStatusUpdateData(status),
  });
