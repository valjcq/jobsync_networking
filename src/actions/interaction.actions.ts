export {
  getInteractionList,
  getFollowUps,
  getNetworkingContacts,
  getJobRefs,
} from "./interaction/queries";

export {
  createInteraction,
  updateInteraction,
  deleteInteractionById,
  markNextStepDone,
} from "./interaction/mutations";
