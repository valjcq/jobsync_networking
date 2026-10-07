"use client";

import { Bot, Database, Key, Palette, Plug } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";

export type SettingsSection = "ai-provider" | "api-keys" | "appearance" | "mcp-access" | "data";

const SETTINGS_SECTIONS: {
  id: SettingsSection;
  label: string;
  icon: typeof Bot;
}[] = [
  { id: "ai-provider", label: "AI Provider", icon: Bot },
  { id: "api-keys", label: "API Keys", icon: Key },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "mcp-access", label: "MCP Access", icon: Plug },
  { id: "data", label: "Data", icon: Database },
];

interface SettingsSidebarProps {
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
}

export default function SettingsSidebar({
  activeSection,
  onSectionChange,
}: SettingsSidebarProps) {
  return (
    <nav className="flex gap-1 overflow-x-auto md:w-48 md:shrink-0 md:flex-col md:overflow-visible">
      {SETTINGS_SECTIONS.map((section) => {
        const Icon = section.icon;
        const isActive = activeSection === section.id;
        return (
          <Button
            key={section.id}
            variant="ghost"
            className={cn(
              "shrink-0 justify-start gap-2 rounded-none border-b-2 md:border-b-0 md:border-l-2",
              isActive
                ? "border-b-primary md:border-l-primary bg-muted font-medium"
                : "border-b-transparent md:border-l-transparent hover:border-b-muted-foreground/25 md:hover:border-l-muted-foreground/25",
            )}
            onClick={() => onSectionChange(section.id)}
          >
            <Icon className="h-4 w-4" />
            {section.label}
          </Button>
        );
      })}
    </nav>
  );
}
