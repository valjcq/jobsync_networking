import { canonicalizeEntityValue } from "@/lib/jobs/canonicalize";
import { getInteractionPurposesForUser } from "./purposes";

// Looks a purpose up in the user's own (editable) list by canonical value, the
// same key the UI's create path uses. Reading the list seeds the defaults on
// first use, exactly as the purposes page does. Returns null when missing so
// the caller decides whether to create.
export async function findPurposeByLabel(
  userId: string,
  label: string,
): Promise<{ id: string; label: string } | null> {
  const value = canonicalizeEntityValue(label);
  if (!value) throw new Error("purpose must not be empty");

  const purposes: Array<{ id: string; label: string; value: string }> =
    await getInteractionPurposesForUser(userId);
  const match = purposes.find((p) => p.value === value);
  return match ? { id: match.id, label: match.label } : null;
}
