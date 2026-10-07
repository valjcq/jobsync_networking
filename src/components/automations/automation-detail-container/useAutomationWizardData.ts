"use client";

import { useEffect, useState } from "react";
import { getAutomationsList } from "@/actions/automation.actions";
import { getResumeList } from "@/actions/profile.actions";
import type { AutomationWithResume } from "@/models/automation.model";
import { toSelectableResumes } from "@/lib/resumeSections";

// Reference data the edit wizard needs: selectable resumes and the other
// automations it checks for duplicate configurations.
export function useAutomationWizardData() {
  const [resumes, setResumes] = useState<{ id: string; title: string }[]>([]);
  const [allAutomations, setAllAutomations] = useState<AutomationWithResume[]>(
    [],
  );

  useEffect(() => {
    getResumeList(1, 100).then((result) => {
      if (result?.data) setResumes(toSelectableResumes(result.data));
    });
    getAutomationsList().then((result) => {
      if (result?.data) setAllAutomations(result.data);
    });
  }, []);

  return { resumes, allAutomations };
}
