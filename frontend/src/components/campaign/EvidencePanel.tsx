import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CampaignData, EvidenceItem } from "@/types/campaign";

interface EvidencePanelProps {
  data: CampaignData;
  onChange: (patch: Partial<CampaignData>) => void;
  section: EvidenceItem["section"];
  title: string;
}

export function EvidencePanel({ data, onChange, section, title }: EvidencePanelProps) {
  const [claim, setClaim] = useState("");
  const [source, setSource] = useState("");
  const [confidence, setConfidence] = useState<EvidenceItem["confidence"]>("medium");
  const [sourceQuality, setSourceQuality] = useState<EvidenceItem["sourceQuality"]>("medium");

  const items = useMemo(
    () => (data.evidenceItems || []).filter((entry) => entry.section === section),
    [data.evidenceItems, section],
  );

  const addEvidence = () => {
    if (!claim.trim() || !source.trim()) {
      return;
    }
    const next: EvidenceItem = {
      id: `evidence-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
      section,
      claim: claim.trim(),
      source: source.trim(),
      confidence,
      sourceQuality,
      createdAt: new Date().toISOString(),
    };
    onChange({
      evidenceItems: [...(data.evidenceItems || []), next],
    });
    setClaim("");
    setSource("");
  };

  const removeEvidence = (id: string) => {
    onChange({
      evidenceItems: (data.evidenceItems || []).filter((entry) => entry.id !== id),
    });
  };

  return (
    <Card className="p-3 border-border/70 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-primary/80">{title}</h4>
        <Badge variant="outline">{items.length} evidence item(s)</Badge>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <Input value={claim} onChange={(event) => setClaim(event.target.value)} placeholder="Claim to support" />
        <Input value={source} onChange={(event) => setSource(event.target.value)} placeholder="Evidence source" />
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={confidence}
          onChange={(event) => setConfidence(event.target.value as EvidenceItem["confidence"])}
        >
          <option value="low">Confidence: Low</option>
          <option value="medium">Confidence: Medium</option>
          <option value="high">Confidence: High</option>
        </select>
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={sourceQuality}
          onChange={(event) => setSourceQuality(event.target.value as EvidenceItem["sourceQuality"])}
        >
          <option value="low">Source quality: Low</option>
          <option value="medium">Source quality: Medium</option>
          <option value="high">Source quality: High</option>
        </select>
      </div>
      <Button type="button" size="sm" variant="outline" onClick={addEvidence}>
        Add Evidence
      </Button>
      <div className="space-y-2 max-h-48 overflow-auto pr-1">
        {items.map((entry) => (
          <div key={entry.id} className="rounded border border-border/70 p-2 text-xs">
            <p className="font-medium">{entry.claim}</p>
            <p className="text-muted-foreground">{entry.source}</p>
            <div className="flex items-center gap-1 mt-1">
              <Badge variant="secondary">{entry.confidence}</Badge>
              <Badge variant="outline">{entry.sourceQuality}</Badge>
              <Button type="button" size="sm" variant="ghost" className="ml-auto h-6 px-1 text-[10px]" onClick={() => removeEvidence(entry.id)}>
                Remove
              </Button>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-xs text-muted-foreground">No evidence linked yet.</p>}
      </div>
    </Card>
  );
}
