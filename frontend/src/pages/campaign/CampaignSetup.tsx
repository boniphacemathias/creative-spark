import { KeyboardEvent, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Campaign, CampaignData } from "@/types/campaign";
import { Megaphone, X } from "lucide-react";

interface Props {
  data: CampaignData;
  onChange: (d: Partial<CampaignData>) => void;
}

type CampaignField = keyof Campaign;

export function CampaignSetup({ data, onChange }: Props) {
  const c = data.campaign;
  const [newLanguage, setNewLanguage] = useState("");
  const [languageError, setLanguageError] = useState<string | null>(null);

  const update = <K extends CampaignField>(field: K, value: Campaign[K]) =>
    onChange({ campaign: { ...c, [field]: value } });

  const updateStartDate = (startDate: string) => {
    if (!startDate) {
      update("startDate", startDate);
      return;
    }

    const endDate = c.endDate && c.endDate < startDate ? startDate : c.endDate;
    onChange({ campaign: { ...c, startDate, endDate } });
  };

  const addLanguage = () => {
    const candidate = newLanguage.trim();
    if (!candidate) {
      setLanguageError("Language cannot be empty.");
      return;
    }

    if (c.languages.some((language) => language.toLowerCase() === candidate.toLowerCase())) {
      setLanguageError("Language already exists.");
      setNewLanguage("");
      return;
    }

    setLanguageError(null);
    update("languages", [...c.languages, candidate]);
    setNewLanguage("");
  };

  const removeLanguage = (language: string) => {
    update(
      "languages",
      c.languages.filter((item) => item !== language),
    );
    setLanguageError(null);
  };

  const handleLanguageKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addLanguage();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10"><Megaphone className="h-5 w-5 text-primary" /></div>
        <div>
          <h2 className="text-xl font-display font-bold">Campaign Setup</h2>
          <p className="text-sm text-muted-foreground">Define the basics of your SBCC campaign</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4 bg-gradient-card">
          <Label htmlFor="campaign-name" className="text-xs text-muted-foreground uppercase tracking-wider">Campaign Name</Label>
          <Input
            id="campaign-name"
            value={c.name}
            onChange={(event) => update("name", event.target.value)}
            onBlur={(event) => update("name", event.target.value.trim())}
            className="mt-1.5 bg-background/50"
          />
        </Card>
        <Card className="p-4 bg-gradient-card">
          <Label htmlFor="campaign-country" className="text-xs text-muted-foreground uppercase tracking-wider">Country / Region</Label>
          <Input
            id="campaign-country"
            value={c.country}
            onChange={(event) => update("country", event.target.value)}
            onBlur={(event) => update("country", event.target.value.trim())}
            className="mt-1.5 bg-background/50"
          />
        </Card>
        <Card className="p-4 bg-gradient-card">
          <Label htmlFor="campaign-start-date" className="text-xs text-muted-foreground uppercase tracking-wider">Start Date</Label>
          <Input
            id="campaign-start-date"
            type="date"
            value={c.startDate}
            onChange={(event) => updateStartDate(event.target.value)}
            className="mt-1.5 bg-background/50"
          />
        </Card>
        <Card className="p-4 bg-gradient-card">
          <Label htmlFor="campaign-end-date" className="text-xs text-muted-foreground uppercase tracking-wider">End Date</Label>
          <Input
            id="campaign-end-date"
            type="date"
            min={c.startDate || undefined}
            value={c.endDate}
            onChange={(event) => update("endDate", event.target.value)}
            className="mt-1.5 bg-background/50"
          />
          {c.endDate < c.startDate && (
            <p className="mt-2 text-xs text-destructive">End date must be on or after the start date.</p>
          )}
        </Card>
      </div>

      <Card className="p-4 bg-gradient-card">
        <Label htmlFor="campaign-languages-input" className="text-xs text-muted-foreground uppercase tracking-wider">Languages</Label>
        <div className="flex gap-2 mt-2">
          <Input
            id="campaign-languages-input"
            value={newLanguage}
            onChange={(event) => setNewLanguage(event.target.value)}
            onKeyDown={handleLanguageKeyDown}
            className="bg-background/50"
            placeholder="Add language and press Enter"
          />
          <Button type="button" variant="outline" onClick={addLanguage}>
            Add
          </Button>
        </div>
        {languageError && <p className="text-xs text-destructive mt-2">{languageError}</p>}
        <div className="flex flex-wrap gap-2 mt-3">
          {c.languages.map((language) => (
            <Badge key={language} variant="secondary" className="text-xs gap-1">
              {language}
              <button
                type="button"
                aria-label={`Remove ${language}`}
                className="inline-flex"
                onClick={() => removeLanguage(language)}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      </Card>

      <Card className="p-4 bg-gradient-card">
        <Label className="text-xs text-muted-foreground uppercase tracking-wider">Status</Label>
        <div className="flex gap-2 mt-2">
          {(["draft", "in_review", "final"] as const).map((status) => (
            <Badge key={status} variant={c.status === status ? "default" : "outline"} className="cursor-pointer text-xs"
              onClick={() => update("status", status)}>
              {status.replace("_", " ")}
            </Badge>
          ))}
        </div>
      </Card>
    </div>
  );
}
