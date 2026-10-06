import { toastError } from "@/lib/toast";
import {
  buildInsufficientSectionsMessage,
  hasMinResumeSections,
  isResumeUsable,
  UNUSABLE_RESUME_HINT,
} from "@/lib/resumeSections";

export { hasMinResumeSections, isResumeUsable, UNUSABLE_RESUME_HINT };

export const warnInsufficientResumeSections = (
  action: string,
  hint?: string,
): void => {
  toastError(buildInsufficientSectionsMessage(action, hint), "Not enough content");
};
