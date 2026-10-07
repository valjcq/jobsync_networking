import { getResumeList } from "@/actions/profile.actions";
import { AutomationContainer } from "@/components/automations/AutomationContainer";
import { toSelectableResumes } from "@/lib/resumeSections";

export default async function AutomationsPage() {
  const resumeResult = await getResumeList(1, 100);
  const resumes = toSelectableResumes(resumeResult?.data ?? []);

  return (
    <div className="col-span-3">
      <AutomationContainer resumes={resumes} />
    </div>
  );
}
