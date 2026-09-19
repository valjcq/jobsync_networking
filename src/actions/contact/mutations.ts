"use server";
import prisma from "@/lib/db";
import { handleError } from "@/lib/utils";
import { requireUser } from "../shared";
import type { ContactFormValues } from "@/models/addContactForm.schema";
import {
  toContactData,
  assertContactRefsOwned,
  createContactForUser,
} from "@/lib/networking/contacts";

export const createContact = async (
  values: ContactFormValues,
): Promise<any | undefined> => {
  try {
    const user = await requireUser();
    const data = await createContactForUser(user.id, values);
    return { success: true, data };
  } catch (error) {
    return handleError(error, "Failed to create contact.");
  }
};

export const updateContact = async (
  values: ContactFormValues,
): Promise<any | undefined> => {
  try {
    const user = await requireUser();
    if (!values.id) throw new Error("Please provide a contact id");

    const contactData = toContactData(values);
    await assertContactRefsOwned(user.id, contactData);

    // updateMany, not update: a unique-where cannot carry createdBy, and a
    // count of 0 is how a contact belonging to someone else surfaces.
    const res = await prisma.contact.updateMany({
      where: { id: values.id, createdBy: user.id },
      data: contactData,
    });
    if (res.count === 0) throw new Error("Contact not found");

    return { success: true, data: { id: values.id } };
  } catch (error) {
    return handleError(error, "Failed to update contact.");
  }
};

export const deleteContactById = async (
  contactId: string,
): Promise<any | undefined> => {
  try {
    const user = await requireUser();

    // JobContact cascades from Contact, so the links go with the person.
    const res = await prisma.contact.deleteMany({
      where: { id: contactId, createdBy: user.id },
    });
    if (res.count === 0) throw new Error("Contact not found");

    return { success: true };
  } catch (error) {
    return handleError(error, "Failed to delete contact.");
  }
};
