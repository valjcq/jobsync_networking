"use client";
import { useCallback, useRef, useState } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardTitle } from "../ui/card";
import { ResponsiveCardHeader } from "../ResponsiveCardHeader";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { SearchInput } from "../SearchInput";
import AddContact from "../AddContact";
import { cn } from "@/lib/utils";
import { getAllCompanies } from "@/actions/company.actions";
import { getAllJobLocations } from "@/actions/jobLocation.actions";
import type { NetworkingContact } from "@/models/interaction.model";
import type { ContactRole } from "@/models/contact.model";
import type { Company, JobLocation } from "@/models/job.model";

type ContactsPanelProps = {
  contacts: NetworkingContact[];
  roles: ContactRole[];
  selectedId?: string;
  onSelect: (id?: string) => void;
  onChanged: () => void;
};

function ContactsPanel({
  contacts,
  roles,
  selectedId,
  onSelect,
  onChanged,
}: ContactsPanelProps) {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [locations, setLocations] = useState<JobLocation[]>([]);
  const [pickersLoading, setPickersLoading] = useState(false);
  const pickersRequested = useRef(false);

  // Company and location options are only seen inside the dialog, so they load
  // the first time it opens, as the Library tab does.
  const openDialog = useCallback((open: boolean) => {
    setDialogOpen(open);
    if (!open || pickersRequested.current) return;
    pickersRequested.current = true;
    setPickersLoading(true);
    Promise.all([getAllCompanies(), getAllJobLocations()])
      .then(([companyList, locationList]) => {
        if (Array.isArray(companyList)) setCompanies(companyList);
        if (Array.isArray(locationList)) setLocations(locationList);
      })
      .finally(() => setPickersLoading(false));
  }, []);

  const term = search.trim().toLowerCase();
  const shown = term
    ? contacts.filter((c) =>
        [c.name, c.title, c.Company?.label]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(term),
      )
    : contacts;

  return (
    <Card className="lg:w-80 lg:shrink-0" data-testid="networking-contacts">
      <ResponsiveCardHeader>
        <CardTitle>People</CardTitle>
        <div className="flex flex-wrap items-center justify-end gap-2 sm:ml-auto">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search people..."
          />
          <AddContact
            reloadContacts={onChanged}
            resetEditContact={() => {}}
            dialogOpen={dialogOpen}
            setDialogOpen={openDialog}
            pickersLoading={pickersLoading}
            companies={companies}
            locations={locations}
            roles={roles}
          />
        </div>
      </ResponsiveCardHeader>
      <CardContent className="flex flex-col gap-1">
        <Button
          variant={selectedId ? "ghost" : "secondary"}
          size="sm"
          className="justify-start"
          onClick={() => onSelect(undefined)}
        >
          Everyone
        </Button>
        {shown.map((contact) => (
          <button
            key={contact.id}
            type="button"
            onClick={() => onSelect(contact.id)}
            aria-pressed={contact.id === selectedId}
            className={cn(
              "flex flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left text-sm hover:bg-muted",
              contact.id === selectedId && "bg-muted",
            )}
          >
            <span className="flex w-full items-center justify-between gap-2">
              <span className="truncate font-medium">{contact.name}</span>
              {contact.openSteps > 0 && (
                <Badge variant="secondary">{contact.openSteps} open</Badge>
              )}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {[contact.title, contact.Company?.label]
                .filter(Boolean)
                .join(" · ") || "No organization"}
            </span>
            <span className="text-xs text-muted-foreground">
              Last contacted{" "}
              {contact.lastContactedAt
                ? format(contact.lastContactedAt, "PP")
                : "never"}
            </span>
          </button>
        ))}
        {shown.length === 0 && (
          <p className="p-2 text-sm text-muted-foreground">
            {contacts.length === 0
              ? "No contacts yet. Add the first person you want to keep track of."
              : "Nobody matches that search."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default ContactsPanel;
