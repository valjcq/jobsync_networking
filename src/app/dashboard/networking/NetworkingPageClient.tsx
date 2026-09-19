"use client";
import { useCallback, useState } from "react";
import ContactsPanel from "@/components/networking/ContactsPanel";
import FollowUpsCard from "@/components/networking/FollowUpsCard";
import InteractionsTimeline from "@/components/networking/InteractionsTimeline";
import InteractionForm from "@/components/networking/InteractionForm";
import PurposeManager from "@/components/networking/PurposeManager";
import {
  getNetworkingContacts,
  getFollowUps,
} from "@/actions/interaction.actions";
import type {
  Interaction,
  InteractionPurpose,
  NetworkingContact,
} from "@/models/interaction.model";
import type { ContactRef, ContactRole } from "@/models/contact.model";

type NetworkingPageClientProps = {
  contacts: NetworkingContact[];
  followUps: Interaction[];
  purposes: InteractionPurpose[];
  jobs: ContactRef[];
  roles: ContactRole[];
};

function NetworkingPageClient({
  contacts: initialContacts,
  followUps: initialFollowUps,
  purposes: initialPurposes,
  jobs,
  roles,
}: NetworkingPageClientProps) {
  const [contacts, setContacts] = useState(initialContacts);
  const [followUps, setFollowUps] = useState(initialFollowUps);
  const [purposes, setPurposes] = useState(initialPurposes);
  const [selectedContactId, setSelectedContactId] = useState<string>();
  // Bumped to make the timeline refetch after anything changed
  const [version, setVersion] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [purposesOpen, setPurposesOpen] = useState(false);
  const [editInteraction, setEditInteraction] = useState<Interaction | null>(
    null,
  );

  // One interaction changes the panel's last-contacted and open-step counts,
  // the follow-ups card and the timeline together, so they reload together.
  const refresh = useCallback(async () => {
    const [contactRes, followUpRes] = await Promise.all([
      getNetworkingContacts(),
      getFollowUps(),
    ]);
    if (contactRes?.data) setContacts(contactRes.data);
    if (followUpRes?.data) setFollowUps(followUpRes.data);
    setVersion((v) => v + 1);
  }, []);

  const onEdit = (interaction: Interaction) => {
    setEditInteraction(interaction);
    setFormOpen(true);
  };

  const onLog = () => {
    setEditInteraction(null);
    setFormOpen(true);
  };

  return (
    <div className="col-span-3 flex flex-col gap-4 lg:flex-row">
      <ContactsPanel
        contacts={contacts}
        roles={roles}
        selectedId={selectedContactId}
        onSelect={setSelectedContactId}
        onChanged={refresh}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <FollowUpsCard followUps={followUps} onChanged={refresh} />
        <InteractionsTimeline
          contactId={selectedContactId}
          contactName={contacts.find((c) => c.id === selectedContactId)?.name}
          purposes={purposes}
          version={version}
          onLog={onLog}
          onEdit={onEdit}
          onManagePurposes={() => setPurposesOpen(true)}
          onChanged={refresh}
        />
      </div>
      <InteractionForm
        open={formOpen}
        setOpen={setFormOpen}
        editInteraction={editInteraction}
        defaultContactId={selectedContactId}
        contacts={contacts}
        purposes={purposes}
        jobs={jobs}
        onSaved={refresh}
      />
      <PurposeManager
        open={purposesOpen}
        setOpen={setPurposesOpen}
        purposes={purposes}
        onPurposesChanged={setPurposes}
      />
    </div>
  );
}

export default NetworkingPageClient;
