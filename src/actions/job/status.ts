"use server";
import prisma from "@/lib/db";
import { handleError } from "@/lib/utils";
import { JobStatus } from "@/models/job.model";
import { revalidatePath } from "next/cache";
import { requireUser } from "../shared";
import { setJobStatusForUser } from "@/lib/jobs/status";

export const updateJobStatus = async (
  jobId: string,
  status: JobStatus,
): Promise<any | undefined> => {
  try {
    const user = await requireUser();
    const job = await setJobStatusForUser(user.id, jobId, status);
    revalidatePath("/dashboard");
    return { job, success: true };
  } catch (error) {
    const msg = "Failed to update job status.";
    return handleError(error, msg);
  }
};

export const saveJobMatchResult = async (
  jobId: string,
  matchScore: number,
  matchData: string,
): Promise<any | undefined> => {
  try {
    const user = await requireUser();

    await prisma.job.update({
      where: { id: jobId, userId: user.id },
      data: { matchScore, matchData },
    });

    return { success: true };
  } catch (error) {
    const msg = "Failed to save match result.";
    return handleError(error, msg);
  }
};
