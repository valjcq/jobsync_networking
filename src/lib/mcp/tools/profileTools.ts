import prisma from "@/lib/db";
import type { McpUpdateProfileInput } from "@/models/mcp.schema";
import { SectionType } from "@/models/profile.model";
import { runTool, text, type ToolResult } from "./toolResult";

// The user's profile is spread over what JobSync already stores: name,
// headline and links live on the default resume's contact info, the summary
// is that resume's summary section, and target roles / locations sit on the
// user's Profile row. Editing here edits the same rows the Profile pages show.

const isHttpUrl = (value: string) => {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

const parseList = (raw: string | null | undefined): string[] => {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
};

const dedupe = (values: string[]) => {
  const seen = new Set<string>();
  return values
    .map((v) => v.trim())
    .filter((v) => v && !seen.has(v.toLowerCase()) && seen.add(v.toLowerCase()));
};

async function loadDefaultResume(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultResumeId: true },
  });
  if (!user?.defaultResumeId) return null;
  return prisma.resume.findFirst({
    where: { id: user.defaultResumeId, profile: { userId } },
    select: {
      id: true,
      title: true,
      ContactInfo: true,
      ResumeSections: {
        where: { sectionType: SectionType.SUMMARY },
        select: { id: true, summary: { select: { id: true, content: true } } },
      },
    },
  });
}

export async function handleGetProfile(userId: string): Promise<ToolResult> {
  return runTool(userId, async () => {
    const [resume, profile] = await Promise.all([
      loadDefaultResume(userId),
      prisma.profile.findFirst({
        where: { userId },
        select: { targetRoles: true, targetLocations: true },
      }),
    ]);

    const info = resume?.ContactInfo;
    const summary = resume?.ResumeSections.find((s) => s.summary)?.summary?.content;
    const roles = parseList(profile?.targetRoles);
    const places = parseList(profile?.targetLocations);
    const links = [
      info?.url1 ? `${info.url1Label || "Link"}: ${info.url1}` : null,
      info?.url2 ? `${info.url2Label || "Link"}: ${info.url2}` : null,
    ].filter(Boolean);

    const lines = [
      resume
        ? `Profile (from default resume "${resume.title}")`
        : "Profile (no default resume is set, so name, headline, summary and links are unavailable)",
      `Name: ${info ? `${info.firstName} ${info.lastName}`.trim() : "not set"}`,
      `Headline: ${info?.headline || "not set"}`,
      `Summary: ${summary || "not set"}`,
      `Target roles: ${roles.length ? roles.join("; ") : "not set"}`,
      `Target locations: ${places.length ? places.join("; ") : "not set"}`,
      `Links: ${links.length ? links.join("; ") : "none"}`,
    ];
    return text(lines.join("\n"));
  });
}

export async function handleUpdateProfile(
  input: McpUpdateProfileInput,
  userId: string,
): Promise<ToolResult> {
  return runTool(userId, async () => {
    const touchesResume = [
      input.firstName,
      input.lastName,
      input.headline,
      input.summary,
      input.links,
    ].some((v) => v !== undefined);
    const touchesTargets =
      input.targetRoles !== undefined || input.targetLocations !== undefined;
    if (!touchesResume && !touchesTargets) {
      return text("Validation error: supply at least one field to change");
    }
    for (const link of input.links ?? []) {
      if (!isHttpUrl(link.url)) {
        return text(
          `Validation error: link "${link.url}" must be a full URL starting with https://`,
        );
      }
    }

    const changed: string[] = [];

    if (touchesResume) {
      const resume = await loadDefaultResume(userId);
      if (!resume) {
        throw new Error(
          "No default resume is set. Set one in the web app (Profile > Resumes) so name, headline, summary and links have somewhere to live.",
        );
      }
      const info = resume.ContactInfo;
      const infoFields = [input.firstName, input.lastName, input.headline, input.links];
      if (!info && infoFields.some((v) => v !== undefined)) {
        throw new Error(
          "The default resume has no contact info yet (it needs an email and phone). Add it in the web app first, then retry.",
        );
      }

      await prisma.$transaction(async (tx) => {
        if (info && infoFields.some((v) => v !== undefined)) {
          const links = input.links;
          await tx.contactInfo.update({
            where: { id: info.id },
            data: {
              ...(input.firstName !== undefined ? { firstName: input.firstName.trim() } : {}),
              ...(input.lastName !== undefined ? { lastName: input.lastName.trim() } : {}),
              ...(input.headline !== undefined ? { headline: input.headline.trim() } : {}),
              ...(links !== undefined
                ? {
                    url1: links[0]?.url.trim() ?? null,
                    url1Label: links[0]?.label?.trim() || null,
                    url2: links[1]?.url.trim() ?? null,
                    url2Label: links[1]?.label?.trim() || null,
                  }
                : {}),
            },
          });
        }

        if (input.summary !== undefined) {
          const content = input.summary.trim();
          const section = resume.ResumeSections.find((s) => s.summary);
          if (section?.summary) {
            await tx.summary.update({
              where: { id: section.summary.id },
              data: { content },
            });
          } else if (content) {
            await tx.resumeSection.create({
              data: {
                Resume: { connect: { id: resume.id } },
                sectionTitle: "Summary",
                sectionType: SectionType.SUMMARY,
                summary: { create: { content } },
              },
            });
          }
        }
      });
      for (const key of ["firstName", "lastName", "headline", "summary", "links"] as const) {
        if (input[key] !== undefined) changed.push(key);
      }
    }

    if (touchesTargets) {
      const data = {
        ...(input.targetRoles !== undefined
          ? { targetRoles: JSON.stringify(dedupe(input.targetRoles)) }
          : {}),
        ...(input.targetLocations !== undefined
          ? { targetLocations: JSON.stringify(dedupe(input.targetLocations)) }
          : {}),
      };
      const profile = await prisma.profile.findFirst({
        where: { userId },
        select: { id: true },
      });
      if (profile) {
        await prisma.profile.update({ where: { id: profile.id }, data });
      } else {
        await prisma.profile.create({ data: { userId, ...data } });
      }
      if (input.targetRoles !== undefined) changed.push("targetRoles");
      if (input.targetLocations !== undefined) changed.push("targetLocations");
    }

    return text(`Updated profile: ${changed.join(", ")}.`);
  });
}
