import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  MessageSquare,
  Send,
  X,
  Globe,
  RotateCcw,
  Maximize2,
  Minimize2,
  Copy,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CampaignData } from "@/types/campaign";
import { ChatMessage } from "@/lib/ai-chat/chat-engine";
import {
  AIProvider,
  appendChatMessageApi,
  clearChatMessages,
  listChatMessages,
  runChatTurnApi,
} from "@/lib/chat-api";
import { DriveFile } from "@/lib/drive-storage";
import { useToast } from "@/components/ui/use-toast";
import { updateCampaign } from "@/lib/campaign-storage";
import {
  applyAssistantMessageToCampaign,
  CHAT_APPLY_TARGET_OPTIONS,
  ChatApplyTarget,
} from "@/lib/ai-chat/chat-apply";
import { listDriveFiles as listDriveFilesApi } from "@/lib/drive-api";
import {
  AutoFillStep,
  autoFillStepLabel,
  buildAutoFillSuccessMessage,
  executeCampaignAutoFillStep,
  resolveAutoFillStepFromPromptContext,
} from "@/lib/ai-chat/chat-autofill";
import { dispatchCampaignPatchApplied } from "@/lib/campaign-events";
import { subscribeRealtimeStream } from "@/lib/realtime-api";

interface Props {
  campaigns: CampaignData[];
  activeCampaignId?: string;
}

interface MentionQuery {
  query: string;
  start: number;
  end: number;
}

const MAX_MENTION_SUGGESTIONS = 6;
const QUICK_ACTION_PROMPTS: Array<{ label: string; prompt: string; step?: AutoFillStep }> = [
  {
    label: "Summarize tagged docs",
    prompt: "Summarize key findings from tagged AI Drive documents and list practical next steps.",
  },
  {
    label: "Auto-fill Research",
    prompt: "/fill research using tagged documents as evidence",
    step: "research",
  },
  {
    label: "Auto-fill Comm Brief",
    prompt: "/fill communication-brief",
    step: "communicationBrief",
  },
  {
    label: "Auto-fill Creative Brief",
    prompt: "/fill creative-brief",
    step: "creativeBrief",
  },
  {
    label: "Generate Ideation",
    prompt: "/fill ideation with 6 unexpected but executable ideas",
    step: "ideation",
  },
  {
    label: "Generate Concepts",
    prompt: "/fill concepts from current ideas and insight",
    step: "concepts",
  },
];

function toHashtagToken(name: string): string {
  const withoutExtension = name.replace(/\.[^/.]+$/, "");
  const normalized = withoutExtension
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 50);
  return normalized || "document";
}

function buildDriveFileSearchText(file: DriveFile): string {
  return `${file.name} ${file.tags.join(" ")} ${file.extractedText}`.toLowerCase();
}

function detectMentionQuery(value: string, caretIndex: number): MentionQuery | null {
  const safeCaret = Math.max(0, Math.min(caretIndex, value.length));
  const segment = value.slice(0, safeCaret);
  const hashIndex = segment.lastIndexOf("#");

  if (hashIndex < 0) {
    return null;
  }

  const previousCharacter = hashIndex === 0 ? "" : segment[hashIndex - 1];
  if (previousCharacter && !/\s/.test(previousCharacter)) {
    return null;
  }

  const chunk = segment.slice(hashIndex + 1);
  if (chunk.includes("\n") || /\s/.test(chunk)) {
    return null;
  }

  return {
    query: chunk.toLowerCase(),
    start: hashIndex,
    end: safeCaret,
  };
}

function mergeDriveFiles(primary: DriveFile[], secondary: DriveFile[]): DriveFile[] {
  const byId = new Map<string, DriveFile>();
  for (const file of [...primary, ...secondary]) {
    if (!byId.has(file.id)) {
      byId.set(file.id, file);
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const tokenRegex = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let tokenMatch = tokenRegex.exec(text);
  let tokenIndex = 0;

  while (tokenMatch) {
    if (tokenMatch.index > lastIndex) {
      nodes.push(text.slice(lastIndex, tokenMatch.index));
    }

    const token = tokenMatch[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(
        <strong key={`${keyPrefix}-bold-${tokenIndex}`} className="font-semibold">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      nodes.push(
        <em key={`${keyPrefix}-italic-${tokenIndex}`} className="italic">
          {token.slice(1, -1)}
        </em>,
      );
    } else {
      nodes.push(token);
    }

    lastIndex = tokenMatch.index + token.length;
    tokenIndex += 1;
    tokenMatch = tokenRegex.exec(text);
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function renderFormattedMessage(content: string): ReactNode {
  const lines = content.split(/\r?\n/);

  return lines.map((line, index) => {
    const key = `line-${index}`;
    const trimmed = line.trim();
    if (!trimmed) {
      return <div key={key} className="h-2" />;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingText = headingMatch[2];
      const headingClass =
        level === 1
          ? "text-sm font-semibold"
          : level === 2
            ? "text-xs font-semibold"
            : "text-xs font-medium";
      return (
        <p key={key} className={headingClass}>
          {renderInlineMarkdown(headingText, `${key}-heading`)}
        </p>
      );
    }

    const bulletMatch = trimmed.match(/^[-*]\s+(.*)$/);
    if (bulletMatch) {
      return (
        <div key={key} className="flex gap-1.5 leading-relaxed">
          <span>•</span>
          <span>{renderInlineMarkdown(bulletMatch[1], `${key}-bullet`)}</span>
        </div>
      );
    }

    const numberedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numberedMatch) {
      return (
        <div key={key} className="flex gap-1.5 leading-relaxed">
          <span>{numberedMatch[1]}.</span>
          <span>{renderInlineMarkdown(numberedMatch[2], `${key}-ordered`)}</span>
        </div>
      );
    }

    return (
      <p key={key} className="leading-relaxed">
        {renderInlineMarkdown(trimmed, `${key}-paragraph`)}
      </p>
    );
  });
}

export function AIChatDock({ campaigns, activeCampaignId }: Props) {
  const { toast } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [open, setOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [isResettingChat, setIsResettingChat] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isRefreshingMessages, setIsRefreshingMessages] = useState(false);
  const [isLoadingDriveFiles, setIsLoadingDriveFiles] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastMessagesSyncAt, setLastMessagesSyncAt] = useState<string | null>(null);
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);
  const [lastFailedTaggedDocumentIds, setLastFailedTaggedDocumentIds] = useState<string[]>([]);
  const [includeExternal, setIncludeExternal] = useState(false);
  const [provider, setProvider] = useState<AIProvider>("openrouter");
  const [applyTargets, setApplyTargets] = useState<Record<string, ChatApplyTarget>>({});
  const [applyingMessageId, setApplyingMessageId] = useState<string | null>(null);
  const [availableDriveFiles, setAvailableDriveFiles] = useState<DriveFile[]>([]);
  const [taggedDriveFiles, setTaggedDriveFiles] = useState<DriveFile[]>([]);
  const [mentionQuery, setMentionQuery] = useState<MentionQuery | null>(null);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const refreshMessagesInFlightRef = useRef(false);
  const dockBottomClass = activeCampaignId ? "bottom-24 md:bottom-24" : "bottom-5";

  const activeCampaign = useMemo(() => {
    if (activeCampaignId) {
      return campaigns.find((campaign) => campaign.campaign.id === activeCampaignId) ?? null;
    }
    return campaigns[0] ?? null;
  }, [activeCampaignId, campaigns]);

  const campaignId = activeCampaign?.campaign.id ?? null;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const stored = window.localStorage.getItem("creative-spark-ai-provider");
    if (stored === "openrouter" || stored === "gemini") {
      setProvider(stored);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem("creative-spark-ai-provider", provider);
  }, [provider]);

  const refreshMessages = async ({
    showLoader = false,
    showError = false,
  }: {
    showLoader?: boolean;
    showError?: boolean;
  } = {}) => {
    if (!open) {
      return;
    }
    if (isSending || isAutoFilling || isResettingChat || refreshMessagesInFlightRef.current) {
      return;
    }

    refreshMessagesInFlightRef.current = true;
    if (showLoader) {
      setIsLoadingMessages(true);
    } else {
      setIsRefreshingMessages(true);
    }
    if (showError) {
      setLoadError(null);
    }

    try {
      const next = await listChatMessages(campaignId);
      setMessages(next);
      setLastMessagesSyncAt(new Date().toISOString());
    } catch (error) {
      if (showError) {
        setMessages([]);
        setLoadError(error instanceof Error ? error.message : "Unable to load chat history.");
      }
    } finally {
      if (showLoader) {
        setIsLoadingMessages(false);
      } else {
        setIsRefreshingMessages(false);
      }
      refreshMessagesInFlightRef.current = false;
    }
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    void refreshMessages({ showLoader: true, showError: true });
  }, [campaignId, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const unsubscribe = subscribeRealtimeStream({
      campaignId,
      onUpdate: (payload) => {
        if (!payload || typeof payload !== "object") {
          return;
        }
        if (payload.entity === "chat") {
          void refreshMessages({ showLoader: false, showError: false });
        }
      },
      onError: () => {
        // Realtime stream errors are non-blocking; manual refresh remains available.
      },
    });

    return () => unsubscribe();
  }, [open, campaignId, isAutoFilling, isResettingChat, isSending]);

  useEffect(() => {
    setTaggedDriveFiles([]);
    setMentionQuery(null);
    setActiveSuggestionIndex(0);
  }, [campaignId]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let active = true;
    const loadDriveFiles = async () => {
      setIsLoadingDriveFiles(true);
      try {
        const [scopedFiles, globalFiles] = await Promise.all([
          listDriveFilesApi(campaignId),
          campaignId ? listDriveFilesApi(null) : Promise.resolve([]),
        ]);
        if (!active) {
          return;
        }
        setAvailableDriveFiles(mergeDriveFiles(scopedFiles, globalFiles));
      } catch {
        if (!active) {
          return;
        }
        setAvailableDriveFiles([]);
      } finally {
        if (active) {
          setIsLoadingDriveFiles(false);
        }
      }
    };

    void loadDriveFiles();
    return () => {
      active = false;
    };
  }, [campaignId, open]);

  const mentionSuggestions = useMemo(() => {
    if (!mentionQuery) {
      return [];
    }

    const selectedIds = new Set(taggedDriveFiles.map((file) => file.id));
    const query = mentionQuery.query.trim();

    const scored = availableDriveFiles
      .filter((file) => !selectedIds.has(file.id))
      .map((file) => {
        const searchText = buildDriveFileSearchText(file);
        if (!query) {
          return { file, score: 1 };
        }

        const name = file.name.toLowerCase();
        let score = 0;
        if (name.startsWith(query)) {
          score += 6;
        }
        if (name.includes(query)) {
          score += 3;
        }
        if (searchText.includes(query)) {
          score += 1;
        }
        return { file, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.file.name.localeCompare(b.file.name))
      .slice(0, MAX_MENTION_SUGGESTIONS);

    return scored.map((entry) => entry.file);
  }, [availableDriveFiles, mentionQuery, taggedDriveFiles]);

  useEffect(() => {
    if (activeSuggestionIndex < mentionSuggestions.length) {
      return;
    }
    setActiveSuggestionIndex(0);
  }, [activeSuggestionIndex, mentionSuggestions.length]);

  const syncMentionState = (value: string, caretIndex: number) => {
    const nextMention = detectMentionQuery(value, caretIndex);
    setMentionQuery(nextMention);
    if (!nextMention) {
      setActiveSuggestionIndex(0);
    }
  };

  const insertTaggedDocument = (file: DriveFile) => {
    if (!mentionQuery) {
      return;
    }

    const token = `#${toHashtagToken(file.name)}`;
    const nextPrompt = `${prompt.slice(0, mentionQuery.start)}${token} ${prompt.slice(mentionQuery.end)}`;
    const nextCaretPosition = mentionQuery.start + token.length + 1;

    setPrompt(nextPrompt);
    setTaggedDriveFiles((current) => {
      if (current.some((candidate) => candidate.id === file.id)) {
        return current;
      }
      return [...current, file];
    });
    setMentionQuery(null);
    setActiveSuggestionIndex(0);

    window.requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }
      textarea.focus();
      textarea.setSelectionRange(nextCaretPosition, nextCaretPosition);
    });
  };

  const removeTaggedDocument = (fileId: string) => {
    setTaggedDriveFiles((current) => current.filter((file) => file.id !== fileId));
  };

  const startNewChat = async () => {
    if (isSending || isResettingChat || isAutoFilling) {
      return;
    }

    setIsResettingChat(true);
    try {
      await clearChatMessages(campaignId);
      setMessages([]);
      setPrompt("");
      setTaggedDriveFiles([]);
      setMentionQuery(null);
      setActiveSuggestionIndex(0);
      setLastFailedPrompt(null);
      setLastFailedTaggedDocumentIds([]);
      toast({
        title: "New chat started",
        description: "Previous chat history was cleared for this scope.",
      });
    } catch (error) {
      toast({
        title: "Unable to start new chat",
        description: error instanceof Error ? error.message : "Unknown error.",
        variant: "destructive",
      });
    } finally {
      setIsResettingChat(false);
    }
  };

  const runTurn = async (promptText: string, taggedDocumentIds: string[]) => {
    const trimmed = promptText.trim();
    if (!trimmed || isSending || isAutoFilling) {
      return;
    }
    const priorUserPrompts = messages
      .filter((message) => message.role === "user")
      .map((message) => message.content);
    const userMessage: ChatMessage = {
      id: `chat-user-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
    };

    setMessages((current) => [...current, userMessage]);
    setPrompt("");
    setTaggedDriveFiles([]);
    setMentionQuery(null);
    setIsSending(true);
    setLastFailedPrompt(null);
    setLastFailedTaggedDocumentIds([]);
    const requestedAutoFillStep = activeCampaign
      ? resolveAutoFillStepFromPromptContext(trimmed, priorUserPrompts)
      : null;

    try {
      const result = await runChatTurnApi({
        prompt: trimmed,
        campaign: activeCampaign,
        includeExternal,
        provider,
        taggedDocumentIds,
      });

      setMessages(result.messages);

      if (requestedAutoFillStep && activeCampaign?.campaign.id) {
        setIsAutoFilling(true);
        try {
          const autoFillResult = await executeCampaignAutoFillStep({
            step: requestedAutoFillStep,
            campaign: activeCampaign,
            campaignId: activeCampaign.campaign.id,
            taggedDocumentIds,
            availableDriveFiles,
          });

          const persisted = await updateCampaign(activeCampaign.campaign.id, (existing) => ({
            ...existing,
            ...autoFillResult.patch,
          }));

          if (!persisted) {
            throw new Error("Unable to persist auto-filled campaign fields.");
          }

          dispatchCampaignPatchApplied({
            campaignId: activeCampaign.campaign.id,
            patch: autoFillResult.patch,
            source: "ai-chat-autofill",
          });

          const confirmationMessage: ChatMessage = {
            id: `chat-auto-fill-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
            role: "assistant",
            content: buildAutoFillSuccessMessage(autoFillResult),
            createdAt: new Date().toISOString(),
            citations: [],
          };
          setMessages((current) => [...current, confirmationMessage]);
          try {
            await appendChatMessageApi(activeCampaign.campaign.id, confirmationMessage);
          } catch {
            // local confirmation already shown; persistence failure should not block chat flow
          }
          toast({
            title: `${autoFillStepLabel(autoFillResult.step)} auto-filled`,
            description: "All fields for this step were populated and saved.",
          });
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Unable to auto-fill requested step fields.";
          const failureMessage: ChatMessage = {
            id: `chat-auto-fill-error-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
            role: "assistant",
            content: `I could not auto-fill this step yet: ${message}`,
            createdAt: new Date().toISOString(),
            citations: [],
          };
          setMessages((current) => [...current, failureMessage]);
          try {
            await appendChatMessageApi(activeCampaign.campaign.id, failureMessage);
          } catch {
            // no-op
          }
          toast({
            title: "Auto-fill failed",
            description: message,
            variant: "destructive",
          });
        } finally {
          setIsAutoFilling(false);
        }
      }
    } catch (error) {
      const backendError =
        error instanceof Error ? error.message : "Failed to get AI response from backend.";
      setLastFailedPrompt(trimmed);
      setLastFailedTaggedDocumentIds(taggedDocumentIds);
      setMessages((current) => [
        ...current,
        {
          id: `chat-error-${Date.now()}`,
          role: "assistant",
          content: `Chat failed. Backend error: ${backendError}`,
          createdAt: new Date().toISOString(),
          citations: [],
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const send = async () => {
    await runTurn(prompt, taggedDriveFiles.map((file) => file.id));
  };

  const retryLastTurn = async () => {
    if (!lastFailedPrompt) {
      return;
    }
    await runTurn(lastFailedPrompt, lastFailedTaggedDocumentIds);
  };

  const runQuickAction = async (actionPrompt: string) => {
    await runTurn(actionPrompt, taggedDriveFiles.map((file) => file.id));
  };

  const copyMessageContent = async (value: string) => {
    const normalized = value.trim();
    if (!normalized) {
      return;
    }
    try {
      await navigator.clipboard.writeText(normalized);
      toast({
        title: "Copied",
        description: "Response copied to clipboard.",
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "Clipboard is not available in this browser context.",
        variant: "destructive",
      });
    }
  };

  const applyTargetForMessage = (messageId: string): ChatApplyTarget => {
    return applyTargets[messageId] ?? "appendices";
  };

  const applyAssistantMessage = async (message: ChatMessage) => {
    if (!activeCampaign?.campaign.id) {
      toast({
        title: "Select a campaign",
        description: "Open a campaign to apply AI output into campaign fields.",
      });
      return;
    }

    const target = applyTargetForMessage(message.id);
    setApplyingMessageId(message.id);
    try {
      const patchFromMessage = applyAssistantMessageToCampaign(activeCampaign, target, message.content);
      const result = await updateCampaign(activeCampaign.campaign.id, (existing) =>
        applyAssistantMessageToCampaign(existing, target, message.content),
      );

      if (!result) {
        toast({
          title: "Apply failed",
          description: "Unable to update campaign data from this response.",
        });
        return;
      }

      const targetLabel =
        CHAT_APPLY_TARGET_OPTIONS.find((option) => option.id === target)?.label ?? "Selected field";
      dispatchCampaignPatchApplied({
        campaignId: activeCampaign.campaign.id,
        patch: patchFromMessage,
        source: "ai-chat-apply",
      });
      toast({
        title: "Response applied",
        description: `Added AI output to ${targetLabel}.`,
      });
    } catch {
      toast({
        title: "Apply failed",
        description: "An error occurred while writing AI output to campaign data.",
      });
    } finally {
      setApplyingMessageId(null);
    }
  };

  return (
    <>
      {!open && (
        <Button
          type="button"
          className={`fixed right-5 z-50 shadow-amber gap-2 ${dockBottomClass}`}
          onClick={() => setOpen(true)}
        >
          <MessageSquare className="h-4 w-4" /> AI Chat
        </Button>
      )}

      {open && (
        <Card
          className={`fixed z-50 flex flex-col bg-background border-primary/30 shadow-xl ${
            isFullscreen
              ? "inset-3 md:inset-6"
              : `${dockBottomClass} right-5 w-[360px] max-w-[calc(100vw-24px)] h-[520px]`
          }`}
        >
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">AI Chat</p>
              <p className="text-[11px] text-muted-foreground">Context from campaign data + AI Drive</p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => setIsFullscreen((current) => !current)}
                title={isFullscreen ? "Exit full screen" : "Full screen"}
              >
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => void startNewChat()}
                title="Start new chat"
                disabled={isSending || isResettingChat || isAutoFilling}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => {
                  setOpen(false);
                  setIsFullscreen(false);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="px-4 py-2 border-b border-border flex items-center justify-between">
            <div className="min-w-0">
              <Badge variant="outline" className="text-[10px]">
                {activeCampaign ? activeCampaign.campaign.name : "No campaign selected"}
              </Badge>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {isRefreshingMessages
                  ? "Syncing new messages..."
                  : lastMessagesSyncAt
                    ? `Live sync ${new Date(lastMessagesSyncAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
                    : "Live sync pending"}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => void refreshMessages({ showLoader: false, showError: true })}
                title="Refresh messages"
                disabled={isLoadingMessages || isRefreshingMessages || isSending || isAutoFilling}
              >
                {isRefreshingMessages ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              </Button>
              <select
                aria-label="AI provider"
                value={provider}
                onChange={(event) => setProvider(event.target.value as AIProvider)}
                className="h-7 rounded border border-input bg-background px-2 text-[10px]"
              >
                <option value="openrouter">OpenRouter</option>
                <option value="gemini">Gemini</option>
              </select>
              <button
                type="button"
                className="text-[10px] inline-flex items-center gap-1 text-muted-foreground hover:text-primary"
                onClick={() => setIncludeExternal((current) => !current)}
              >
                <Globe className="h-3 w-3" />
                External search {includeExternal ? "ON" : "OFF"}
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-3 space-y-2">
            {isLoadingMessages && (
              <p className="text-xs text-muted-foreground">Loading chat history...</p>
            )}
            {loadError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <p>{loadError}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Close and reopen chat to reload history.
                </p>
              </div>
            )}
            {messages.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Ask about campaign strategy, brief generation, ideation options, or document evidence.
              </p>
            )}
            {messages.map((message) => (
              <div
                key={message.id}
                className={`rounded-md px-3 py-2 text-xs ${
                  message.role === "user"
                    ? "bg-primary/10 border border-primary/20"
                    : "bg-secondary/40 border border-border"
                }`}
              >
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{message.role}</p>
                <div className="space-y-1">{renderFormattedMessage(message.content)}</div>
                {message.citations && message.citations.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {message.citations.map((citation, index) => (
                      <p key={citation.id} className="text-[10px] text-muted-foreground">
                        [{index + 1}] {citation.label}: {citation.excerpt}
                      </p>
                    ))}
                  </div>
                )}
                {message.role === "assistant" && (
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[10px]"
                      onClick={() => void copyMessageContent(message.content)}
                    >
                      <Copy className="h-3.5 w-3.5 mr-1" />
                      Copy
                    </Button>
                    <select
                      value={applyTargetForMessage(message.id)}
                      onChange={(event) =>
                        setApplyTargets((current) => ({
                          ...current,
                          [message.id]: event.target.value as ChatApplyTarget,
                        }))
                      }
                      aria-label={`Apply section for message ${message.id}`}
                      className="h-7 rounded border border-input bg-background px-2 text-[10px]"
                    >
                      {CHAT_APPLY_TARGET_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[10px]"
                      onClick={() => void applyAssistantMessage(message)}
                      disabled={!activeCampaign || applyingMessageId === message.id}
                    >
                      {applyingMessageId === message.id ? "Applying..." : "Apply"}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="p-3 border-t border-border space-y-2">
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {QUICK_ACTION_PROMPTS.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => void runQuickAction(action.prompt)}
                    disabled={isSending || isAutoFilling || isResettingChat}
                    className="rounded-full border border-border px-2 py-1 text-[10px] hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                    title={action.step ? `${autoFillStepLabel(action.step)} quick action` : "Quick action"}
                  >
                    {action.label}
                  </button>
                ))}
              </div>

              <Textarea
                ref={textareaRef}
                value={prompt}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setPrompt(nextValue);
                  syncMentionState(nextValue, event.target.selectionStart ?? nextValue.length);
                }}
                onClick={(event) => {
                  const currentValue = event.currentTarget.value;
                  syncMentionState(currentValue, event.currentTarget.selectionStart ?? currentValue.length);
                }}
                onKeyUp={(event) => {
                  const currentValue = event.currentTarget.value;
                  syncMentionState(currentValue, event.currentTarget.selectionStart ?? currentValue.length);
                }}
                onKeyDown={(event) => {
                  if (!mentionQuery || mentionSuggestions.length === 0) {
                    return;
                  }

                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setActiveSuggestionIndex((current) => (current + 1) % mentionSuggestions.length);
                    return;
                  }

                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setActiveSuggestionIndex((current) =>
                      current === 0 ? mentionSuggestions.length - 1 : current - 1,
                    );
                    return;
                  }

                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    insertTaggedDocument(mentionSuggestions[activeSuggestionIndex]);
                    return;
                  }

                  if (event.key === "Escape") {
                    event.preventDefault();
                    setMentionQuery(null);
                    setActiveSuggestionIndex(0);
                  }
                }}
                placeholder="Ask AI to analyze documents and generate campaign actions (type # to tag a drive document)"
                className="min-h-[78px] text-xs"
              />

              {mentionQuery && mentionSuggestions.length > 0 && (
                <div className="rounded-md border border-border bg-background/95 p-1 max-h-32 overflow-auto space-y-1">
                  {mentionSuggestions.map((file, index) => (
                    <button
                      key={file.id}
                      type="button"
                      onClick={() => insertTaggedDocument(file)}
                      className={`w-full text-left rounded px-2 py-1.5 text-[11px] ${
                        index === activeSuggestionIndex ? "bg-primary/10 text-primary" : "hover:bg-muted"
                      }`}
                    >
                      <span className="font-medium">{file.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {taggedDriveFiles.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {taggedDriveFiles.map((file) => (
                    <button
                      key={file.id}
                      type="button"
                      className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-1 text-[10px] text-primary"
                      onClick={() => removeTaggedDocument(file.id)}
                      title="Remove tagged document"
                    >
                      #{toHashtagToken(file.name)} <X className="h-3 w-3" />
                    </button>
                  ))}
                </div>
              )}
            </div>
            {lastFailedPrompt && (
              <Button
                type="button"
                variant="outline"
                className="w-full h-8 text-xs"
                onClick={retryLastTurn}
                disabled={isSending || isAutoFilling}
              >
                Retry last failed query
              </Button>
            )}
            {isAutoFilling && (
              <p className="text-[10px] text-primary">Auto-filling requested step fields...</p>
            )}
            {isLoadingDriveFiles && (
              <p className="text-[10px] text-muted-foreground">Refreshing AI Drive context...</p>
            )}
            <Button
              type="button"
              className="w-full gap-2"
              onClick={send}
              disabled={isSending || isAutoFilling || prompt.trim().length === 0}
            >
              <Send className="h-3.5 w-3.5" /> {isSending ? "Thinking..." : "Send"}
            </Button>
          </div>
        </Card>
      )}
    </>
  );
}
