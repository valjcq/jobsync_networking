"use server";
import { handleError } from "@/lib/utils";
import { requireUser } from "./shared";
import {
  getInteractionPurposesForUser,
  createInteractionPurposeForUser,
  renameInteractionPurposeForUser,
  deleteInteractionPurposeForUser,
} from "@/lib/networking/purposes";

// Seeding, canonical matching and the delete guard live in
// lib/networking/purposes so the MCP tools share them.

export const getInteractionPurposes = async (): Promise<any | undefined> => {
  try {
    const user = await requireUser();
    return await getInteractionPurposesForUser(user.id);
  } catch (error) {
    return handleError(error, "Failed to fetch purposes. ");
  }
};

export const createInteractionPurpose = async (
  label: string,
): Promise<any | undefined> => {
  try {
    const user = await requireUser();
    const data = await createInteractionPurposeForUser(user.id, label);
    return { success: true, data };
  } catch (error) {
    return handleError(error, "Failed to create purpose.");
  }
};

export const renameInteractionPurpose = async (
  purposeId: string,
  label: string,
): Promise<any | undefined> => {
  try {
    const user = await requireUser();
    await renameInteractionPurposeForUser(user.id, purposeId, label);
    return { success: true };
  } catch (error) {
    return handleError(error, "Failed to rename purpose.");
  }
};

export const deleteInteractionPurposeById = async (
  purposeId: string,
): Promise<any | undefined> => {
  try {
    const user = await requireUser();
    await deleteInteractionPurposeForUser(user.id, purposeId);
    return { success: true };
  } catch (error) {
    return handleError(error, "Failed to delete purpose.");
  }
};
