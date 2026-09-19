import prisma from "@/lib/db";
import type { ContactFormValues } from "@/models/addContactForm.schema";

// Session-free contact core shared by the server actions and the MCP tools.
// Moved verbatim from actions/contact/mutations.ts; only what MCP needs lives
// here, the rest of the contact actions stay where they were.

// An untouched optional field arrives as "" from react-hook-form; storing that
// makes "has an email" untestable, so empty means null in the database.
export const nullable = (value?: string | null) =>
  value && value.trim() ? value.trim() : null;

export const toContactData = (values: ContactFormValues) => ({
  name: values.name.trim(),
  title: nullable(values.title),
  email: nullable(values.email),
  phone: nullable(values.phone),
  linkedinUrl: nullable(values.linkedinUrl),
  companyId: nullable(values.company),
  locationId: nullable(values.location),
  relationship: nullable(values.relationship),
  workedAtCompanyId: nullable(values.workedAtCompany),
  workedFrom: values.workedFrom ?? null,
  workedTo: values.workedTo ?? null,
  roleId: nullable(values.contactRole),
  notes: nullable(values.notes),
  lastContactedAt: values.lastContactedAt ?? null,
});

// Foreign keys prove a row exists, not that the caller owns it, so every
// referenced id is counted against the caller before it is written.
export const assertContactRefsOwned = async (
  userId: string,
  data: ReturnType<typeof toContactData>,
) => {
  const companyIds = [
    ...new Set(
      [data.companyId, data.workedAtCompanyId].filter(
        (id): id is string => !!id,
      ),
    ),
  ];

  const [companies, location, role] = await Promise.all([
    companyIds.length > 0
      ? prisma.company.count({
          where: { id: { in: companyIds }, createdBy: userId },
        })
      : 0,
    data.locationId
      ? prisma.location.count({
          where: { id: data.locationId, createdBy: userId },
        })
      : 1,
    data.roleId
      ? prisma.contactRole.count({
          where: { id: data.roleId, createdBy: userId },
        })
      : 1,
  ]);

  if (companies !== companyIds.length) throw new Error("Company not found");
  if (location === 0) throw new Error("Location not found");
  if (role === 0) throw new Error("Role not found");
};

export const createContactForUser = async (
  userId: string,
  values: ContactFormValues,
) => {
  const contactData = toContactData(values);
  await assertContactRefsOwned(userId, contactData);

  return prisma.contact.create({
    data: { ...contactData, createdBy: userId },
  });
};

// The list search: name, email or title contains the text.
export const contactSearchFilter = (search: string) => [
  { name: { contains: search } },
  { email: { contains: search } },
  { title: { contains: search } },
];
