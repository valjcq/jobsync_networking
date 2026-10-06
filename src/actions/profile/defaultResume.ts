"use server";
import prisma from "@/lib/db";
import { handleError } from "@/lib/utils";
import {
  buildInsufficientSectionsMessage,
  isResumeUsable,
  UNUSABLE_RESUME_HINT,
} from "@/lib/resumeSections";
import { getCurrentUser } from "@/utils/user.utils";
import { requireUser } from "./shared";

export const getDefaultResumeId = async (): Promise<string | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { defaultResumeId: true },
  });
  return row?.defaultResumeId ?? null;
};

export const setDefaultResume = async (
  resumeId: string,
): Promise<{ success: boolean; message?: string }> => {
  try {
    const user = await requireUser();

    // Verify ownership before pointing the user at this resume.
    const owned = await prisma.resume.findFirst({
      where: { id: resumeId, profile: { userId: user.id } },
      select: { FileId: true, _count: { select: { ResumeSections: true } } },
    });
    if (!owned) {
      throw new Error("Resume not found");
    }
    if (!isResumeUsable(owned._count.ResumeSections, !!owned.FileId)) {
      return {
        success: false,
        message: buildInsufficientSectionsMessage(
          "setting this resume as default",
          UNUSABLE_RESUME_HINT,
        ),
      };
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { defaultResumeId: resumeId },
    });

    return { success: true };
  } catch (error) {
    return (
      handleError(error, "Failed to set default resume.") ?? {
        success: false,
        message: "Failed to set default resume.",
      }
    );
  }
};
