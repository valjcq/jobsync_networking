"use server";
import { handleError } from "@/lib/utils";
import { requireUser } from "../shared";
import type { InteractionFormValues } from "@/models/interactionForm.schema";
import {
  createInteractionForUser,
  updateInteractionForUser,
  deleteInteractionForUser,
  markNextStepDoneForUser,
} from "@/lib/networking/interactions";

// The rules (ownership checks, "last contacted" bookkeeping) live in
// lib/networking/interactions so the MCP tools share them; these actions only
// add the session and the error envelope.

export const createInteraction = async (
  values: InteractionFormValues,
): Promise<any | undefined> => {
  try {
    const user = await requireUser();
    const created = await createInteractionForUser(user.id, values);
    return { success: true, data: created };
  } catch (error) {
    return handleError(error, "Failed to log interaction.");
  }
};

export const updateInteraction = async (
  values: InteractionFormValues,
): Promise<any | undefined> => {
  try {
    const user = await requireUser();
    const data = await updateInteractionForUser(user.id, values);
    return { success: true, data };
  } catch (error) {
    return handleError(error, "Failed to update interaction.");
  }
};

export const deleteInteractionById = async (
  interactionId: string,
): Promise<any | undefined> => {
  try {
    const user = await requireUser();
    await deleteInteractionForUser(user.id, interactionId);
    return { success: true };
  } catch (error) {
    return handleError(error, "Failed to delete interaction.");
  }
};

export const markNextStepDone = async (
  interactionId: string,
  done: boolean = true,
): Promise<any | undefined> => {
  try {
    const user = await requireUser();
    await markNextStepDoneForUser(user.id, interactionId, done);
    return { success: true };
  } catch (error) {
    return handleError(error, "Failed to update next step.");
  }
};
