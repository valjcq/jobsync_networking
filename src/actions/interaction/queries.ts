"use server";
import { handleError } from "@/lib/utils";
import { requireUser } from "../shared";
import { APP_CONSTANTS } from "@/lib/constants";
import {
  getInteractionListForUser,
  getFollowUpsForUser,
  getNetworkingContactsForUser,
  getJobRefsForUser,
} from "@/lib/networking/interactions";

export const getInteractionList = async (
  page: number = 1,
  limit: number = APP_CONSTANTS.RECORDS_PER_PAGE,
  contactId?: string,
  purposeId?: string,
): Promise<any | undefined> => {
  try {
    const user = await requireUser();
    return await getInteractionListForUser(
      user.id,
      page,
      limit,
      contactId,
      purposeId,
    );
  } catch (error) {
    return handleError(error, "Failed to fetch interactions. ");
  }
};

export const getFollowUps = async (): Promise<any | undefined> => {
  try {
    const user = await requireUser();
    return await getFollowUpsForUser(user.id);
  } catch (error) {
    return handleError(error, "Failed to fetch follow-ups. ");
  }
};

export const getNetworkingContacts = async (): Promise<any | undefined> => {
  try {
    const user = await requireUser();
    return await getNetworkingContactsForUser(user.id);
  } catch (error) {
    return handleError(error, "Failed to fetch contacts. ");
  }
};

export const getJobRefs = async (): Promise<any | undefined> => {
  try {
    const user = await requireUser();
    return await getJobRefsForUser(user.id);
  } catch (error) {
    return handleError(error, "Failed to fetch jobs. ");
  }
};
