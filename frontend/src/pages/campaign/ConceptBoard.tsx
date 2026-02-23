import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CampaignData } from "@/types/campaign";
import { Monitor, Download, Share2, FileText, Image, Plus, Trash2, Save, RefreshCw } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  buildConceptBoardModel,
  buildDefaultConceptBoardModel,
  ConceptBoardModel,
  updateConceptWithBoardData,
} from "@/lib/ai-engine/concept-generator";
import { useToast } from "@/components/ui/use-toast";
import { downloadPresentationPpt } from "@/lib/presentation-ppt";
import { EvidencePanel } from "@/components/campaign/EvidencePanel";

interface Props {
  data: CampaignData;
  onChange?: (d: Partial<CampaignData>) => void;
}

type ListKey = "keyVisualDirections" | "socialPosts" | "headlines" | "whatsappSequence" | "pretestQuestions";

function BoardSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-bold uppercase tracking-wider text-primary/80">{title}</h4>
      {children}
    </div>
  );
}

function createRowId(): string {
  return `row-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function downloadBlob(blob: Blob, filename: string): void {
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function toExportHtml(data: CampaignData, conceptName: string, board: ConceptBoardModel): string {
  const list = (items: string[]) =>
    items
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join("");

  const tableRows = board.messageBarrierMap
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.barrier)}</td><td>${escapeHtml(row.strategy)}</td><td>${escapeHtml(row.channel)}</td></tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(data.campaign.name)} Concept Board</title>
<style>
body { font-family: Arial, sans-serif; color: #111; margin: 28px; }
h1, h2, h3 { margin: 0 0 8px; }
h1 { font-size: 20px; }
h2 { font-size: 14px; margin-top: 18px; text-transform: uppercase; letter-spacing: 0.6px; }
p, li, td, th { font-size: 12px; line-height: 1.5; }
.section { border: 1px solid #ddd; border-radius: 6px; padding: 12px; margin-top: 10px; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid #ddd; padding: 6px; text-align: left; vertical-align: top; }
</style>
</head>
<body>
  <h1>${escapeHtml(data.campaign.name)} - Concept Board</h1>
  <p><strong>Concept:</strong> ${escapeHtml(conceptName)}</p>

  <div class="section">
    <h2>Key Visual Direction</h2>
    <ul>${list(board.keyVisualDirections)}</ul>
  </div>

  <div class="section">
    <h2>Sample Copy Blocks</h2>
    <h3>Social Posts</h3>
    <ul>${list(board.socialPosts)}</ul>
    <h3>Radio Script</h3>
    <p>${escapeHtml(board.radioScript)}</p>
    <h3>Headlines</h3>
    <ul>${list(board.headlines)}</ul>
    <h3>WhatsApp Sequence</h3>
    <ul>${list(board.whatsappSequence)}</ul>
  </div>

  <div class="section">
    <h2>Message-to-Barrier Mapping</h2>
    <table>
      <thead>
        <tr><th>Barrier</th><th>Message Strategy</th><th>Channel</th></tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
  </div>

  <div class="section">
    <h2>A/B Pretest Questions</h2>
    <ol>${board.pretestQuestions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>
  </div>
</body>
</html>`;
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapText(value: string, maxLen = 88): string[] {
  const words = value.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length === 0) {
    return [""];
  }

  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (trial.length <= maxLen) {
      current = trial;
      continue;
    }

    if (current) {
      lines.push(current);
    }
    current = word;
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function toPdfBytes(data: CampaignData, conceptName: string, board: ConceptBoardModel): Uint8Array {
  const lines = [
    `${data.campaign.name} - Concept Board`,
    `Concept: ${conceptName}`,
    "",
    "Key Visual Direction:",
    ...board.keyVisualDirections.map((item) => `- ${item}`),
    "",
    "Sample Copy Blocks - Social Posts:",
    ...board.socialPosts.map((item) => `- ${item}`),
    "",
    "Radio Script:",
    board.radioScript,
    "",
    "Headlines:",
    ...board.headlines.map((item) => `- ${item}`),
    "",
    "WhatsApp Sequence:",
    ...board.whatsappSequence.map((item) => `- ${item}`),
    "",
    "Message-to-Barrier Mapping:",
    ...board.messageBarrierMap.map(
      (entry) => `- Barrier: ${entry.barrier} | Strategy: ${entry.strategy} | Channel: ${entry.channel}`,
    ),
    "",
    "A/B Pretest Questions:",
    ...board.pretestQuestions.map((item, index) => `${index + 1}. ${item}`),
  ];

  const wrapped = lines.flatMap((line) => wrapText(line, 88)).slice(0, 220);
  const commands: string[] = ["BT", "/F1 10 Tf", "50 760 Td"];
  wrapped.forEach((line, index) => {
    const escaped = escapePdfText(line);
    if (index === 0) {
      commands.push(`(${escaped}) Tj`);
      return;
    }
    commands.push(`0 -14 Td (${escaped}) Tj`);
  });
  commands.push("ET");

  const content = commands.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];

  objects.forEach((obj, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${obj}\nendobj\n`;
  });

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.forEach((offset) => {
    pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  });

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

export function ConceptBoard({ data, onChange }: Props) {
  const { toast } = useToast();
  const [activeConceptId, setActiveConceptId] = useState<string>(() => {
    const url = new URL(window.location.href);
    const conceptParam = url.searchParams.get("concept");
    if (conceptParam) {
      return conceptParam;
    }
    return data.concepts[0]?.id || "";
  });

  useEffect(() => {
    if (data.concepts.length === 0) {
      if (activeConceptId !== "") {
        setActiveConceptId("");
      }
      return;
    }

    const exists = data.concepts.some((entry) => entry.id === activeConceptId);
    if (!exists) {
      setActiveConceptId(data.concepts[0].id);
    }
  }, [activeConceptId, data.concepts]);

  const concept = useMemo(
    () => data.concepts.find((entry) => entry.id === activeConceptId) ?? data.concepts[0],
    [activeConceptId, data.concepts],
  );
  const seedBoard = useMemo(() => {
    if (!concept) {
      return null;
    }
    return buildConceptBoardModel(data, concept);
  }, [concept?.id, concept?.boardData?.updatedAt, concept?.bigIdea, concept?.smp, concept?.tagline, data]);

  const [board, setBoard] = useState<ConceptBoardModel | null>(seedBoard);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setBoard(seedBoard);
    setDirty(false);
  }, [seedBoard]);

  if (!concept || !board) {
    return <p className="text-muted-foreground">No concept selected. Go back to develop a concept first.</p>;
  }

  const setActiveConcept = (conceptId: string) => {
    if (!onChange || conceptId === data.concepts[0]?.id) {
      return;
    }

    const selected = data.concepts.find((entry) => entry.id === conceptId);
    if (!selected) {
      return;
    }

    onChange({
      concepts: [selected, ...data.concepts.filter((entry) => entry.id !== conceptId)],
    });
    toast({
      title: "Active concept updated",
      description: "Concept board is now aligned to the selected concept.",
    });
  };

  const mutateBoard = (mutator: (previous: ConceptBoardModel) => ConceptBoardModel) => {
    setBoard((previous) => {
      if (!previous) {
        return previous;
      }
      return mutator(previous);
    });
    setDirty(true);
  };

  const updateListItem = (key: ListKey, index: number, value: string) => {
    mutateBoard((previous) => ({
      ...previous,
      [key]: previous[key].map((entry, entryIndex) => (entryIndex === index ? value : entry)),
    }));
  };

  const addListItem = (key: ListKey, seed: string) => {
    mutateBoard((previous) => ({
      ...previous,
      [key]: [...previous[key], seed],
    }));
  };

  const deleteListItem = (key: ListKey, index: number) => {
    mutateBoard((previous) => {
      const next = previous[key].filter((_, entryIndex) => entryIndex !== index);
      return {
        ...previous,
        [key]: next.length > 0 ? next : [""],
      };
    });
  };

  const updateBarrierRow = (
    rowId: string,
    field: "barrier" | "strategy" | "channel",
    value: string,
  ) => {
    mutateBoard((previous) => ({
      ...previous,
      messageBarrierMap: previous.messageBarrierMap.map((row) =>
        row.id === rowId
          ? {
              ...row,
              [field]: value,
            }
          : row,
      ),
    }));
  };

  const addBarrierRow = () => {
    mutateBoard((previous) => ({
      ...previous,
      messageBarrierMap: [
        ...previous.messageBarrierMap,
        {
          id: createRowId(),
          barrier: "",
          strategy: "",
          channel: concept.channels[0] || "",
        },
      ],
    }));
  };

  const deleteBarrierRow = (rowId: string) => {
    mutateBoard((previous) => {
      const nextRows = previous.messageBarrierMap.filter((row) => row.id !== rowId);
      return {
        ...previous,
        messageBarrierMap:
          nextRows.length > 0
            ? nextRows
            : [
                {
                  id: createRowId(),
                  barrier: "",
                  strategy: "",
                  channel: concept.channels[0] || "",
                },
              ],
      };
    });
  };

  const saveBoard = () => {
    if (!onChange) {
      setDirty(false);
      toast({
        title: "Board updated",
        description: "Board changes are applied for this session.",
      });
      return;
    }

    const updatedConcept = updateConceptWithBoardData(concept, board);
    const nextConcepts = data.concepts.map((entry) =>
      entry.id === concept.id ? updatedConcept : entry,
    );

    onChange({ concepts: nextConcepts });
    setDirty(false);
    toast({
      title: "Board saved",
      description: "Concept board changes are now synchronized with campaign data.",
    });
  };

  const resetBoard = () => {
    const nextBoard = buildDefaultConceptBoardModel(data, concept);
    setBoard(nextBoard);
    setDirty(false);
    toast({
      title: "Board reset",
      description: "Board content was reset from the latest concept context.",
    });
  };

  const handleShareLink = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set("step", "6");
    url.searchParams.set("concept", concept.id);
    const link = url.toString();

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
      } else {
        const temp = document.createElement("textarea");
        temp.value = link;
        document.body.appendChild(temp);
        temp.select();
        if (typeof document.execCommand === "function") {
          document.execCommand("copy");
        }
        document.body.removeChild(temp);
      }

      toast({
        title: "Share link copied",
        description: "Board link copied to clipboard.",
      });
    } catch {
      toast({
        title: "Share link failed",
        description: "Unable to copy link to clipboard. Please copy from browser URL.",
        variant: "destructive",
      });
    }
  };

  const handleExportDocx = () => {
    const html = toExportHtml(data, concept.name, board);
    const blob = new Blob([html], { type: "application/msword" });
    const name = `${slugify(data.campaign.name || "campaign")}-concept-board.docx`;
    downloadBlob(blob, name);
    toast({
      title: "DOCX exported",
      description: `Downloaded ${name}.`,
    });
  };

  const handleExportPdf = () => {
    const bytes = toPdfBytes(data, concept.name, board);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const blob = new Blob([buffer], { type: "application/pdf" });
    const name = `${slugify(data.campaign.name || "campaign")}-concept-board.pdf`;
    downloadBlob(blob, name);
    toast({
      title: "PDF exported",
      description: `Downloaded ${name}.`,
    });
  };

  const handleExportPpt = () => {
    downloadPresentationPpt({
      filename: `${data.campaign.name}-concept-board`,
      title: "Concept Board",
      subtitle: `Presentation deck for ${concept.name}`,
      campaignName: data.campaign.name,
      complianceTag: `${(data.approvals || []).filter((entry) => entry.status === "approved").length} approval(s) signed`,
      slides: [
        {
          heading: "Core Concept",
          bullets: [
            `Concept: ${concept.name}`,
            `Big Idea: ${concept.bigIdea || "Not provided."}`,
            `SMP: ${concept.smp || "Not provided."}`,
            `Tagline: ${concept.tagline || "Not provided."}`,
          ],
        },
        {
          heading: "Key Visual Directions",
          bullets: board.keyVisualDirections.length > 0 ? board.keyVisualDirections : ["No key visual directions yet."],
        },
        {
          heading: "Sample Copy",
          bullets: [
            ...board.socialPosts.slice(0, 5).map((post, index) => `Social ${index + 1}: ${post}`),
            `Radio Script: ${board.radioScript || "Not provided."}`,
          ],
        },
        {
          heading: "Message to Barrier Mapping",
          table: {
            headers: ["Barrier", "Message Strategy", "Channel"],
            rows:
              board.messageBarrierMap.length > 0
                ? board.messageBarrierMap.map((row) => [row.barrier || "-", row.strategy || "-", row.channel || "-"])
                : [["-", "-", "-"]],
          },
        },
        {
          heading: "Pretest Questions",
          bullets:
            board.pretestQuestions.length > 0 ? board.pretestQuestions : ["No pretest questions added yet."],
        },
      ],
    });

    toast({
      title: "PPT exported",
      description: "Concept Board presentation downloaded.",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10"><Monitor className="h-5 w-5 text-primary" /></div>
          <div>
            <h2 className="text-xl font-display font-bold">Concept Board</h2>
            <p className="text-sm text-muted-foreground">Dynamic board with editable copy and export-ready outputs</p>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          {data.concepts.length > 1 && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Concept</span>
              <select
                aria-label="Board concept selector"
                className="h-8 rounded border border-input bg-background px-2 text-xs text-foreground min-w-[220px]"
                value={concept.id}
                onChange={(event) => setActiveConceptId(event.target.value)}
              >
                {data.concepts.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {data.concepts.length > 1 && concept.id !== data.concepts[0]?.id && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => setActiveConcept(concept.id)}
            >
              Set Active
            </Button>
          )}
          {dirty && <Badge variant="outline" className="text-[10px]">Unsaved changes</Badge>}
          <Button variant="outline" size="sm" className="gap-1" onClick={handleShareLink}>
            <Share2 className="h-3 w-3" /> Share Link
          </Button>
          <Button variant="outline" size="sm" className="gap-1" onClick={handleExportDocx}>
            <FileText className="h-3 w-3" /> Export DOCX
          </Button>
          <Button variant="outline" size="sm" className="gap-1" onClick={handleExportPdf}>
            <Download className="h-3 w-3" /> Export PDF
          </Button>
          <Button variant="outline" size="sm" className="gap-1" onClick={handleExportPpt}>
            <Download className="h-3 w-3" /> Export PPT
          </Button>
          <Button variant="outline" size="sm" className="gap-1" onClick={resetBoard}>
            <RefreshCw className="h-3 w-3" /> Reset
          </Button>
          <Button size="sm" className="gap-1" onClick={saveBoard}>
            <Save className="h-3 w-3" /> Save Board
          </Button>
        </div>
      </div>

      {onChange && (
        <EvidencePanel
          data={data}
          onChange={onChange}
          section="concept_board"
          title="Evidence Registry (Concept Board)"
        />
      )}

      <Card className="p-8 bg-gradient-card border-primary/20 text-center space-y-3">
        <Badge className="text-xs">Big Idea</Badge>
        <h2 className="text-2xl font-display font-bold">{concept.bigIdea}</h2>
        <p className="text-lg font-display text-gradient-primary font-bold">"{concept.smp}"</p>
        {concept.tagline && <p className="text-sm text-primary/90">{concept.tagline}</p>}
      </Card>

      <Card className="p-6 bg-gradient-card space-y-4">
        <BoardSection title="Key Visual Direction">
          <div className="grid gap-3 md:grid-cols-3">
            {board.keyVisualDirections.map((desc, index) => (
              <Card key={`visual-${index}`} className="bg-muted/30 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Image className="h-4 w-4 text-muted-foreground/70" />
                    <span className="text-[10px] text-muted-foreground">Visual {index + 1}</span>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive"
                    aria-label={`Delete key visual direction ${index + 1}`}
                    onClick={() => deleteListItem("keyVisualDirections", index)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Textarea
                  value={desc}
                  onChange={(event) => updateListItem("keyVisualDirections", index, event.target.value)}
                  aria-label={`Key visual direction ${index + 1}`}
                  className="min-h-[86px] text-xs"
                />
              </Card>
            ))}
          </div>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => addListItem("keyVisualDirections", "")}> 
            <Plus className="h-3 w-3" /> Add Key Visual Direction
          </Button>
        </BoardSection>
      </Card>

      <Card className="p-6 bg-gradient-card space-y-4">
        <BoardSection title="Sample Copy Blocks">
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Social Posts</span>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => addListItem("socialPosts", "")}> 
                  <Plus className="h-3 w-3" /> Add Social Post
                </Button>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {board.socialPosts.map((post, index) => (
                  <Card key={`social-${index}`} className="p-3 bg-background/30 text-xs text-muted-foreground space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-primary/50">Post {index + 1}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        aria-label={`Delete social post ${index + 1}`}
                        onClick={() => deleteListItem("socialPosts", index)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <Textarea
                      value={post}
                      onChange={(event) => updateListItem("socialPosts", index, event.target.value)}
                      aria-label={`Social post ${index + 1}`}
                      className="min-h-[76px] text-xs"
                    />
                  </Card>
                ))}
              </div>
            </div>

            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Radio Script</span>
              <Card className="p-3 bg-background/30 mt-2 space-y-2">
                <Textarea
                  value={board.radioScript}
                  onChange={(event) => mutateBoard((previous) => ({ ...previous, radioScript: event.target.value }))}
                  aria-label="Radio script"
                  className="min-h-[100px] text-xs"
                />
              </Card>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Headlines</span>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => addListItem("headlines", "")}> 
                  <Plus className="h-3 w-3" /> Add Headline
                </Button>
              </div>
              <div className="space-y-2">
                {board.headlines.map((headline, index) => (
                  <div key={`headline-${index}`} className="flex gap-2 items-center">
                    <Input
                      value={headline}
                      onChange={(event) => updateListItem("headlines", index, event.target.value)}
                      aria-label={`Headline ${index + 1}`}
                      className="h-9 text-xs"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive"
                      aria-label={`Delete headline ${index + 1}`}
                      onClick={() => deleteListItem("headlines", index)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">WhatsApp Sequence</span>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => addListItem("whatsappSequence", "")}> 
                  <Plus className="h-3 w-3" /> Add WhatsApp Message
                </Button>
              </div>
              <div className="space-y-2">
                {board.whatsappSequence.map((msg, index) => (
                  <Card key={`wa-${index}`} className="p-3 bg-background/30 text-xs text-muted-foreground space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-primary/50">Message {index + 1}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        aria-label={`Delete whatsapp message ${index + 1}`}
                        onClick={() => deleteListItem("whatsappSequence", index)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <Textarea
                      value={msg}
                      onChange={(event) => updateListItem("whatsappSequence", index, event.target.value)}
                      aria-label={`WhatsApp message ${index + 1}`}
                      className="min-h-[70px] text-xs"
                    />
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </BoardSection>
      </Card>

      <Card className="p-6 bg-gradient-card space-y-3">
        <BoardSection title="Message-to-Barrier Mapping">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Barrier</TableHead>
                <TableHead className="text-xs">Message Strategy</TableHead>
                <TableHead className="text-xs">Channel</TableHead>
                <TableHead className="text-xs w-[72px]">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {board.messageBarrierMap.map((entry, index) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-xs font-medium">
                    <Input
                      value={entry.barrier}
                      onChange={(event) => updateBarrierRow(entry.id, "barrier", event.target.value)}
                      aria-label={`Barrier ${index + 1}`}
                      className="h-8 text-xs"
                    />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <Input
                      value={entry.strategy}
                      onChange={(event) => updateBarrierRow(entry.id, "strategy", event.target.value)}
                      aria-label={`Message strategy ${index + 1}`}
                      className="h-8 text-xs"
                    />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <Input
                      value={entry.channel}
                      onChange={(event) => updateBarrierRow(entry.id, "channel", event.target.value)}
                      aria-label={`Mapping channel ${index + 1}`}
                      className="h-8 text-xs"
                    />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive"
                      aria-label={`Delete mapping row ${index + 1}`}
                      onClick={() => deleteBarrierRow(entry.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Button size="sm" variant="outline" className="gap-1" onClick={addBarrierRow}>
            <Plus className="h-3 w-3" /> Add Mapping Row
          </Button>
        </BoardSection>
      </Card>

      <Card className="p-6 bg-gradient-card space-y-3">
        <BoardSection title="A/B Pretest Questions">
          <div className="space-y-2">
            {board.pretestQuestions.map((question, index) => (
              <div key={`pretest-${index}`} className="flex items-center gap-2">
                <Input
                  value={question}
                  onChange={(event) => updateListItem("pretestQuestions", index, event.target.value)}
                  aria-label={`Pretest question ${index + 1}`}
                  className="h-9 text-xs"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive"
                  aria-label={`Delete pretest question ${index + 1}`}
                  onClick={() => deleteListItem("pretestQuestions", index)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => addListItem("pretestQuestions", "")}> 
            <Plus className="h-3 w-3" /> Add Pretest Question
          </Button>
        </BoardSection>
      </Card>
    </div>
  );
}
