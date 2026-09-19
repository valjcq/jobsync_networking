import ContactsTable from "@/components/admin/ContactsTable";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/actions/contact.actions", () => ({
  deleteContactById: vi.fn(),
}));

vi.mock("@/lib/toast", () => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

const contact = {
  id: "c1",
  name: "Dave Patel",
  title: null,
  email: null,
  phone: null,
  linkedinUrl: null,
  companyId: "co1",
  Company: { id: "co1", label: "Shopify" },
  locationId: null,
  Location: null,
  relationship: null,
  workedAtCompanyId: null,
  WorkedAtCompany: null,
  workedFrom: null,
  workedTo: null,
  roleId: null,
  Role: null,
  notes: "Met at a meetup",
  lastContactedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: "u1",
  jobLinks: [],
  _count: { jobLinks: 0 },
} as any;

describe("ContactsTable", () => {
  const user = userEvent.setup({ skipHover: true });

  it("shows the Company column by default", () => {
    render(
      <ContactsTable contacts={[contact]} reloadContacts={vi.fn()} editContact={vi.fn()} />,
    );

    expect(screen.getByRole("columnheader", { name: "Company" })).toBeInTheDocument();
    expect(screen.getByText("Shopify")).toBeInTheDocument();
  });

  it("drops the Company column and narrows the expanded row when asked", async () => {
    render(
      <ContactsTable
        contacts={[contact]}
        reloadContacts={vi.fn()}
        editContact={vi.fn()}
        hideCompanyColumn
      />,
    );

    expect(screen.queryByRole("columnheader", { name: "Company" })).not.toBeInTheDocument();
    expect(screen.queryByText("Shopify")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /expand dave patel/i }));

    expect(screen.getByText("Met at a meetup").closest("td")).toHaveAttribute("colspan", "7");
  });

  describe("delete confirmation", () => {
    const openDelete = async (c: any) => {
      render(
        <ContactsTable contacts={[c]} reloadContacts={vi.fn()} editContact={vi.fn()} />,
      );
      await user.click(screen.getByRole("button", { name: /toggle menu/i }));
      await user.click(await screen.findByRole("menuitem", { name: /delete/i }));
    };

    it("mentions the logged interactions that will go with the contact", async () => {
      await openDelete({ ...contact, _count: { jobLinks: 0, interactions: 3 } });
      expect(
        await screen.findByText("3 logged interactions will be deleted too. This cannot be undone."),
      ).toBeInTheDocument();
    });

    it("keeps the job-link wording and adds the interactions after it", async () => {
      await openDelete({ ...contact, _count: { jobLinks: 2, interactions: 1 } });
      expect(
        await screen.findByText(
          "Dave Patel is linked to 2 jobs. Deleting the contact removes those links. 1 logged interaction will be deleted too. This cannot be undone.",
        ),
      ).toBeInTheDocument();
    });

    it("uses the plain confirmation when nothing is attached", async () => {
      await openDelete(contact);
      expect(
        await screen.findByText(/Are you sure you want to delete this/i),
      ).toBeInTheDocument();
    });
  });
});
