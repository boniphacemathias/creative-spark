import { RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, Wand2, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { CampaignData } from "@/types/campaign";
import { AIProvider, runChatTurnApi } from "@/lib/chat-api";

interface Props {
  campaign: CampaignData | null;
  scopeRef: RefObject<HTMLElement | null>;
}

type FieldTarget = HTMLInputElement | HTMLTextAreaElement;

const MAX_FIELD_OPTIONS = 5;
const HIDE_ASSIST_DELAY_MS = 90;

function isTextInputType(type: string): boolean {
  return ["text", "search", "url", "email", "tel", "number", "password"].includes(type);
}

function isFieldTarget(node: EventTarget | null): node is FieldTarget {
  if (!node || !(node instanceof HTMLElement)) {
    return false;
  }

  if (node instanceof HTMLTextAreaElement) {
    return !node.disabled && !node.readOnly;
  }

  if (node instanceof HTMLInputElement) {
    return isTextInputType(node.type) && !node.disabled && !node.readOnly;
  }

  return false;
}

function resolveFieldTarget(node: EventTarget | null): FieldTarget | null {
  if (isFieldTarget(node)) {
    return node;
  }
  if (!(node instanceof HTMLElement)) {
    return null;
  }
  const nearest = node.closest("input, textarea");
  return isFieldTarget(nearest) ? nearest : null;
}

function resolveLabel(scope: HTMLElement | null, field: FieldTarget): string {
  const ariaLabel = field.getAttribute("aria-label");
  if (ariaLabel && ariaLabel.trim()) {
    return ariaLabel.trim();
  }

  const id = field.id?.trim();
  if (id) {
    const byFor = scope?.querySelector(`label[for="${id}"]`) as HTMLLabelElement | null;
    if (byFor?.textContent?.trim()) {
      return byFor.textContent.trim();
    }
  }

  const wrappedLabel = field.closest("label");
  if (wrappedLabel?.textContent?.trim()) {
    return wrappedLabel.textContent.trim();
  }

  if (field.name?.trim()) {
    return field.name.trim();
  }

  if (field.placeholder?.trim()) {
    return field.placeholder.trim();
  }

  return "Current field";
}

function readFieldValue(field: FieldTarget): string {
  return String(field.value ?? "");
}

function writeFieldValue(field: FieldTarget, value: string) {
  const prototype = Object.getPrototypeOf(field) as { value?: PropertyDescriptor };
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  if (descriptor?.set) {
    descriptor.set.call(field, value);
  } else {
    field.value = value;
  }
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
}

function sanitizeForSingleLine(value: string): string {
  const first = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? "";
  return first.replace(/^[-*•\d.)\s]+/, "").trim();
}

function extractOptions(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const options: string[] = [];
  for (const line of lines) {
    const normalized = line.replace(/^[-*•\d.)\s]+/, "").trim();
    if (!normalized) {
      continue;
    }
    const exists = options.some((item) => item.toLowerCase() === normalized.toLowerCase());
    if (exists) {
      continue;
    }
    options.push(normalized);
    if (options.length >= MAX_FIELD_OPTIONS) {
      break;
    }
  }
  return options;
}

function buildQuickPrompts(label: string): string[] {
  return [
    `Write a strong draft for ${label}.`,
    `Give 3 concise options for ${label}.`,
    `Improve this field to be clearer and more professional.`,
    `Suggest a creative but practical version for ${label}.`,
  ];
}

function buildFieldPrompt(input: {
  label: string;
  placeholder: string;
  currentValue: string;
  userPrompt: string;
  singleLine: boolean;
}) {
  const { label, placeholder, currentValue, userPrompt, singleLine } = input;
  const outputRule = singleLine
    ? "Output rule: return a single line ready to paste. No bullets, no explanation."
    : "Output rule: return field-ready text only. Keep it practical and directly usable.";

  return [
    "You are filling one specific form field for a campaign workflow.",
    outputRule,
    `Field label: ${label}`,
    `Field placeholder: ${placeholder || "N/A"}`,
    `Current field value: ${currentValue || "(empty)"}`,
    `User instruction: ${userPrompt}`,
  ].join("\n");
}

export function FieldAIAssistPopup({ campaign, scopeRef }: Props) {
  const { toast } = useToast();
  const [targetField, setTargetField] = useState<FieldTarget | null>(null);
  const [targetLabel, setTargetLabel] = useState("");
  const [targetPlaceholder, setTargetPlaceholder] = useState("");
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [provider, setProvider] = useState<AIProvider>("openrouter");
  const [includeExternal, setIncludeExternal] = useState(false);
  const hideTimerRef = useRef<number | null>(null);
  const targetFieldRef = useRef<FieldTarget | null>(null);
  const popupSurfaceRef = useRef<HTMLDivElement | null>(null);
  const isPointerInsidePopupRef = useRef(false);

  const quickPrompts = useMemo(() => buildQuickPrompts(targetLabel || "this field"), [targetLabel]);

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

  useEffect(() => {
    targetFieldRef.current = targetField;
  }, [targetField]);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const hideAssist = useCallback(() => {
    clearHideTimer();
    targetFieldRef.current = null;
    setOpen(false);
    setTargetField(null);
    setAnchor(null);
  }, [clearHideTimer]);

  const fieldInScopeFocus = useCallback((scope: HTMLElement): FieldTarget | null => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !scope.contains(active)) {
      return null;
    }
    return resolveFieldTarget(active);
  }, []);

  const setFieldContext = useCallback(
    (scope: HTMLElement, nextField: FieldTarget) => {
      if (!nextField.isConnected) {
        return;
      }
      clearHideTimer();
      const isNewField = targetFieldRef.current !== nextField;
      targetFieldRef.current = nextField;
      setTargetField(nextField);
      setTargetLabel(resolveLabel(scope, nextField));
      setTargetPlaceholder(nextField.placeholder ?? "");
      if (isNewField) {
        setResponse("");
        setPrompt("");
        setOpen(false);
      }
      const rect = nextField.getBoundingClientRect();
      setAnchor({
        top: Math.max(12, rect.top + 8),
        left: Math.max(12, rect.right - 30),
      });
    },
    [clearHideTimer],
  );

  const scheduleHide = useCallback(
    (delayMs = HIDE_ASSIST_DELAY_MS) => {
      clearHideTimer();
      hideTimerRef.current = window.setTimeout(() => {
        hideTimerRef.current = null;
        const scope = scopeRef.current;
        if (!scope || isPointerInsidePopupRef.current) {
          return;
        }
        const focusedField = fieldInScopeFocus(scope);
        if (focusedField) {
          setFieldContext(scope, focusedField);
          return;
        }
        hideAssist();
      }, delayMs);
    },
    [clearHideTimer, fieldInScopeFocus, hideAssist, scopeRef, setFieldContext],
  );

  const updateAnchor = useCallback(() => {
    if (!targetField) {
      setAnchor(null);
      return;
    }
    if (!targetField.isConnected) {
      hideAssist();
      return;
    }
    const rect = targetField.getBoundingClientRect();
    setAnchor({
      top: Math.max(12, rect.top + 8),
      left: Math.max(12, rect.right - 30),
    });
  }, [hideAssist, targetField]);

  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope) {
      return;
    }

    const onFocusIn = (event: FocusEvent) => {
      const nextField = resolveFieldTarget(event.target);
      if (!nextField) {
        return;
      }
      setFieldContext(scope, nextField);
    };

    const onFocusOut = (event: FocusEvent) => {
      const nextNode = event.relatedTarget;
      if (nextNode instanceof Node && popupSurfaceRef.current?.contains(nextNode)) {
        clearHideTimer();
        return;
      }
      const nextField = resolveFieldTarget(nextNode);
      if (nextField && scope.contains(nextField)) {
        return;
      }
      scheduleHide();
    };

    const onMouseOver = (event: MouseEvent) => {
      const nextField = resolveFieldTarget(event.target);
      if (nextField && scope.contains(nextField)) {
        setFieldContext(scope, nextField);
        return;
      }
      const targetNode = event.target;
      if (
        targetNode instanceof Node &&
        popupSurfaceRef.current?.contains(targetNode)
      ) {
        clearHideTimer();
        return;
      }
      if (!fieldInScopeFocus(scope)) {
        scheduleHide();
      }
    };

    const onMouseLeave = () => {
      if (!fieldInScopeFocus(scope) && !isPointerInsidePopupRef.current) {
        scheduleHide();
      }
    };

    scope.addEventListener("focusin", onFocusIn);
    scope.addEventListener("focusout", onFocusOut);
    scope.addEventListener("mouseover", onMouseOver);
    scope.addEventListener("mouseleave", onMouseLeave);
    return () => {
      scope.removeEventListener("focusin", onFocusIn);
      scope.removeEventListener("focusout", onFocusOut);
      scope.removeEventListener("mouseover", onMouseOver);
      scope.removeEventListener("mouseleave", onMouseLeave);
    };
  }, [clearHideTimer, fieldInScopeFocus, scheduleHide, scopeRef, setFieldContext]);

  useEffect(() => {
    if (!targetField) {
      return;
    }
    updateAnchor();

    const onLayout = () => updateAnchor();
    window.addEventListener("resize", onLayout);
    window.addEventListener("scroll", onLayout, true);

    return () => {
      window.removeEventListener("resize", onLayout);
      window.removeEventListener("scroll", onLayout, true);
    };
  }, [targetField, updateAnchor]);

  useEffect(
    () => () => {
      clearHideTimer();
    },
    [clearHideTimer],
  );

  const runAssist = async (instruction: string) => {
    if (!targetField) {
      return;
    }
    const cleanInstruction = instruction.trim();
    if (!cleanInstruction) {
      toast({
        title: "Add instruction",
        description: "Write what you want AI to generate for this field.",
      });
      return;
    }

    const fullPrompt = buildFieldPrompt({
      label: targetLabel || "Current field",
      placeholder: targetPlaceholder,
      currentValue: readFieldValue(targetField),
      userPrompt: cleanInstruction,
      singleLine: targetField instanceof HTMLInputElement,
    });

    setIsRunning(true);
    try {
      const result = await runChatTurnApi({
        prompt: fullPrompt,
        campaign,
        includeExternal,
        provider,
      });
      setResponse(result.message.content.trim());
    } catch (error) {
      toast({
        title: "AI request failed",
        description: error instanceof Error ? error.message : "Unable to generate response.",
        variant: "destructive",
      });
    } finally {
      setIsRunning(false);
    }
  };

  const applyResponse = (mode: "replace" | "append", candidate?: string) => {
    if (!targetField) {
      return;
    }
    const raw = (candidate ?? response).trim();
    if (!raw) {
      return;
    }

    const current = readFieldValue(targetField);
    const singleLine = targetField instanceof HTMLInputElement;
    const output = singleLine ? sanitizeForSingleLine(raw) : raw;

    const separator = singleLine ? " " : "\n";
    const nextValue =
      mode === "append" && current.trim()
        ? `${current}${separator}${output}`.trim()
        : output;

    writeFieldValue(targetField, nextValue);
    targetField.focus();
    setOpen(false);
    toast({
      title: "Field updated",
      description: mode === "append" ? "AI content appended to field." : "AI content applied to field.",
    });
  };

  if (!targetField || !anchor) {
    return null;
  }

  const options = extractOptions(response);

  return (
    <>
      <div
        ref={popupSurfaceRef}
        onMouseEnter={() => {
          isPointerInsidePopupRef.current = true;
          clearHideTimer();
        }}
        onMouseLeave={() => {
          isPointerInsidePopupRef.current = false;
          scheduleHide();
        }}
      >
        <button
          type="button"
          className="fixed z-40 h-8 w-8 rounded-full border border-primary/40 bg-background shadow-lg text-primary hover:bg-primary/10"
          style={{ top: anchor.top, left: anchor.left }}
          onClick={() => setOpen((current) => !current)}
          title={`AI assist for ${targetLabel || "field"}`}
        >
          <Sparkles className="h-4 w-4 mx-auto" />
        </button>

        {open && (
          <Card className="fixed bottom-5 right-5 z-50 w-[370px] max-w-[calc(100vw-20px)] border-primary/30 shadow-xl">
            <div className="px-3 py-2 border-b border-border flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold">Field AI Assist</p>
                <p className="text-[11px] text-muted-foreground">{targetLabel || "Current field"}</p>
              </div>
              <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="px-3 py-2 border-b border-border flex items-center gap-2">
              <select
                aria-label="Field AI provider"
                value={provider}
                onChange={(event) => setProvider(event.target.value as AIProvider)}
                className="h-7 rounded border border-input bg-background px-2 text-[10px]"
              >
                <option value="openrouter">OpenRouter</option>
                <option value="gemini">Gemini</option>
              </select>
              <button
                type="button"
                className="text-[10px] text-muted-foreground hover:text-primary"
                onClick={() => setIncludeExternal((current) => !current)}
              >
                Web search {includeExternal ? "ON" : "OFF"}
              </button>
            </div>

            <div className="p-3 space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {quickPrompts.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      setPrompt(item);
                      void runAssist(item);
                    }}
                    className="rounded-full border border-border px-2 py-1 text-[10px] hover:border-primary/40 hover:text-primary"
                  >
                    <Wand2 className="h-3 w-3 inline mr-1" />
                    {item}
                  </button>
                ))}
              </div>

              <Textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Tell AI what to generate for this specific field..."
                className="min-h-[76px] text-xs"
              />

              <div className="flex items-center justify-between gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => void runAssist(prompt)}
                  disabled={isRunning}
                >
                  <Send className="h-3.5 w-3.5 mr-1" />
                  {isRunning ? "Generating..." : "Ask AI"}
                </Button>
                <Badge variant="outline" className="text-[10px]">
                  {targetField instanceof HTMLInputElement ? "Single line output" : "Rich text output"}
                </Badge>
              </div>

              {response && (
                <div className="rounded-md border border-border bg-muted/20 p-2 space-y-2">
                  <p className="text-[10px] font-medium text-muted-foreground">AI response</p>
                  <div className="max-h-40 overflow-auto whitespace-pre-wrap text-xs">{response}</div>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" className="h-7 text-[10px]" onClick={() => applyResponse("replace")}>
                      Replace
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px]"
                      onClick={() => applyResponse("append")}
                    >
                      Append
                    </Button>
                  </div>
                  {options.length > 1 && (
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground">Quick suggestions</p>
                      {options.map((option) => (
                        <button
                          key={option}
                          type="button"
                          className="w-full rounded border border-border px-2 py-1.5 text-left text-[11px] hover:border-primary/40 hover:bg-primary/5"
                          onClick={() => applyResponse("replace", option)}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
