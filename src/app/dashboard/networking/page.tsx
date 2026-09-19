import NetworkingPageClient from "./NetworkingPageClient";
import {
  getNetworkingContacts,
  getFollowUps,
  getJobRefs,
} from "@/actions/interaction.actions";
import { getInteractionPurposes } from "@/actions/interactionPurpose.actions";
import { getAllContactRoles } from "@/actions/contactRole.actions";
import React from "react";

async function Networking() {
  const [contacts, followUps, purposes, jobs, roles] = await Promise.all([
    getNetworkingContacts(),
    getFollowUps(),
    getInteractionPurposes(),
    getJobRefs(),
    getAllContactRoles(),
  ]);

  return (
    <NetworkingPageClient
      contacts={contacts?.data || []}
      followUps={followUps?.data || []}
      purposes={Array.isArray(purposes) ? purposes : []}
      jobs={Array.isArray(jobs) ? jobs : []}
      roles={Array.isArray(roles) ? roles : []}
    />
  );
}

export default Networking;
