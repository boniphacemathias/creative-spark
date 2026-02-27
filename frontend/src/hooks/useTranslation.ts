import {
  ReactNode,
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import staticTranslations from "@/data/translations.json";
import {
  ADMIN_TRANSLATIONS_CHANGED_EVENT,
  getAdminTranslationDictionary,
  normalizeAdminTranslationKey,
  readAdminTranslationStore,
  setAdminActiveLocale,
  upsertAdminTranslationDictionary,
} from "@/lib/admin-translations";
import { ACTIVE_WORKSPACE_STORAGE_KEY, getActiveWorkspaceId } from "@/lib/workspace";

type SupportedLocale = "en" | "sw";
type TranslationDictionary = Record<string, string>;

interface TranslationContextValue {
  language: SupportedLocale;
  setLanguage: (nextLanguage: string) => void;
  t: (keyOrText: string, params?: Record<string, string | number>) => string;
  translateText: (source: string) => string;
  dictionary: TranslationDictionary;
}

const STATIC_TRANSLATIONS = staticTranslations as Record<string, TranslationDictionary>;
const TRANSLATABLE_ATTRIBUTES = ["placeholder", "title", "aria-label"] as const;
const SKIPPED_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "PRE", "CODE"]);
const SOURCE_CAPTURE_DELAY_MS = 800;
const textNodeCache = new WeakMap<Text, { source: string; applied: string }>();
const attributeCache = new WeakMap<Element, Record<string, { source: string; applied: string }>>();

function normalizeLocale(value: unknown): SupportedLocale {
  return String(value || "").trim().toLowerCase() === "sw" ? "sw" : "en";
}

function normalizeKey(value: string): string {
  return normalizeAdminTranslationKey(value);
}

function hasTranslatableContent(value: string): boolean {
  return /[a-zA-Z]/.test(value);
}

function isLikelyTranslationKey(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  return /^[a-z0-9._-]+$/i.test(trimmed) && !/\s/.test(trimmed);
}

function preserveWhitespace(source: string, translatedCore: string): string {
  const leading = source.match(/^\s*/)?.[0] || "";
  const trailing = source.match(/\s*$/)?.[0] || "";
  return `${leading}${translatedCore}${trailing}`;
}

function applyCase(sourceWord: string, translatedWord: string): string {
  if (!translatedWord) {
    return translatedWord;
  }
  if (sourceWord.toUpperCase() === sourceWord) {
    return translatedWord.toUpperCase();
  }
  if (sourceWord[0]?.toUpperCase() === sourceWord[0]) {
    return translatedWord[0].toUpperCase() + translatedWord.slice(1);
  }
  return translatedWord;
}

function interpolate(input: string, params?: Record<string, string | number>): string {
  if (!params) {
    return input;
  }

  return Object.entries(params).reduce((output, [key, value]) => {
    const token = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g");
    return output.replace(token, String(value));
  }, input);
}

function resolveDictionaryValue(
  source: string,
  locale: SupportedLocale,
  localeDictionary: TranslationDictionary,
  englishDictionary: TranslationDictionary,
): string {
  const normalizedSource = source.trim();
  if (!normalizedSource) {
    return source;
  }

  const normalizedKey = normalizeKey(normalizedSource);
  if (locale === "en") {
    const englishValue = englishDictionary[normalizedSource] || englishDictionary[normalizedKey];
    if (englishValue) {
      return preserveWhitespace(source, englishValue);
    }
    return source;
  }

  const direct =
    localeDictionary[normalizedSource] ||
    localeDictionary[normalizedKey] ||
    localeDictionary[normalizeKey(englishDictionary[normalizedKey] || "")];
  if (direct) {
    return preserveWhitespace(source, direct);
  }

  let replaced = false;
  const wordTranslated = normalizedSource.replace(/[A-Za-z][A-Za-z'-]*/g, (word) => {
    const translatedWord = localeDictionary[normalizeKey(word)];
    if (!translatedWord) {
      return word;
    }
    replaced = true;
    return applyCase(word, translatedWord);
  });

  if (replaced) {
    return preserveWhitespace(source, wordTranslated);
  }

  return source;
}

function shouldSkipTextNode(node: Text): boolean {
  const parent = node.parentElement;
  if (!parent) {
    return true;
  }
  if (SKIPPED_TAGS.has(parent.tagName)) {
    return true;
  }
  if (parent.closest("[data-no-auto-translate='true']")) {
    return true;
  }
  return false;
}

const TranslationContext = createContext<TranslationContextValue>({
  language: "en",
  setLanguage: () => undefined,
  t: (input: string) => input,
  translateText: (input: string) => input,
  dictionary: {},
});

export function TranslationProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState(() => readAdminTranslationStore());
  const [language, setLanguageState] = useState<SupportedLocale>(() =>
    normalizeLocale(readAdminTranslationStore().activeLocale),
  );
  const captureQueueRef = useRef<Record<string, string>>({});
  const captureTimeoutRef = useRef<number | null>(null);
  const isApplyingTranslationRef = useRef(false);
  const storeRef = useRef(store);
  const languageRef = useRef(language);

  useEffect(() => {
    storeRef.current = store;
  }, [store]);

  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  const englishDictionary = useMemo(() => {
    return {
      ...(STATIC_TRANSLATIONS.en || {}),
      ...(store.locales.en || {}),
    };
  }, [store.locales.en]);

  const activeDictionary = useMemo(() => {
    const staticLocale = STATIC_TRANSLATIONS[language] || {};
    const storedLocale = store.locales[language] || {};
    return {
      ...englishDictionary,
      ...staticLocale,
      ...storedLocale,
    };
  }, [englishDictionary, language, store.locales]);

  const flushCapturedSources = useCallback(() => {
    const pending = captureQueueRef.current;
    captureQueueRef.current = {};
    if (captureTimeoutRef.current !== null) {
      window.clearTimeout(captureTimeoutRef.current);
      captureTimeoutRef.current = null;
    }

    const keys = Object.keys(pending);
    if (keys.length === 0) {
      return;
    }

    const nextStore = upsertAdminTranslationDictionary("en", pending, "merge");
    setStore(nextStore);
  }, []);

  const queueSourceCapture = useCallback(
    (source: string) => {
      if (typeof window === "undefined") {
        return;
      }
      const trimmed = source.trim();
      if (!trimmed || !hasTranslatableContent(trimmed)) {
        return;
      }
      if (isLikelyTranslationKey(trimmed)) {
        return;
      }
      const key = normalizeKey(trimmed);
      if (!key) {
        return;
      }
      const existingEnglish = storeRef.current.locales.en || {};
      if (existingEnglish[key] === trimmed) {
        return;
      }
      captureQueueRef.current[key] = trimmed;
      if (captureTimeoutRef.current !== null) {
        return;
      }
      captureTimeoutRef.current = window.setTimeout(() => {
        flushCapturedSources();
      }, SOURCE_CAPTURE_DELAY_MS);
    },
    [flushCapturedSources],
  );

  const setLanguage = useCallback((nextLanguage: string) => {
    const normalized = normalizeLocale(nextLanguage);
    const nextStore = setAdminActiveLocale(normalized);
    setStore(nextStore);
    setLanguageState(normalizeLocale(nextStore.activeLocale));
  }, []);

  const translateText = useCallback(
    (source: string) => {
      if (!source) {
        return "";
      }
      queueSourceCapture(source);
      return resolveDictionaryValue(source, languageRef.current, activeDictionary, englishDictionary);
    },
    [activeDictionary, englishDictionary, queueSourceCapture],
  );

  const t = useCallback(
    (keyOrText: string, params?: Record<string, string | number>) => {
      const source = String(keyOrText || "");
      const translated = translateText(source);
      return interpolate(translated, params);
    },
    [translateText],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncFromStorage = () => {
      const nextStore = readAdminTranslationStore();
      setStore(nextStore);
      setLanguageState(normalizeLocale(nextStore.activeLocale));
    };

    const onStorage = (event: StorageEvent) => {
      if (!event.key) {
        return;
      }
      if (
        event.key === ACTIVE_WORKSPACE_STORAGE_KEY ||
        event.key.startsWith("creative-spark-admin-translations:")
      ) {
        syncFromStorage();
      }
    };

    const onTranslationStoreChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{ workspaceId?: string }>;
      const targetWorkspace = customEvent.detail?.workspaceId;
      if (targetWorkspace && targetWorkspace !== getActiveWorkspaceId()) {
        return;
      }
      syncFromStorage();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(
      ADMIN_TRANSLATIONS_CHANGED_EVENT,
      onTranslationStoreChanged as EventListener,
    );
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(
        ADMIN_TRANSLATIONS_CHANGED_EVENT,
        onTranslationStoreChanged as EventListener,
      );
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const applyTextNode = (node: Text) => {
      if (shouldSkipTextNode(node)) {
        return;
      }

      const current = node.nodeValue || "";
      if (!current || !hasTranslatableContent(current)) {
        return;
      }

      const previous = textNodeCache.get(node);
      const source = previous && current === previous.applied ? previous.source : current;
      queueSourceCapture(source);
      const translated = resolveDictionaryValue(source, language, activeDictionary, englishDictionary);
      if (current !== translated) {
        node.nodeValue = translated;
      }
      textNodeCache.set(node, { source, applied: translated });
    };

    const applyElementAttributes = (element: Element) => {
      if (element.closest("[data-no-auto-translate='true']")) {
        return;
      }

      const elementCache = attributeCache.get(element) || {};
      for (const attribute of TRANSLATABLE_ATTRIBUTES) {
        const current = element.getAttribute(attribute);
        if (!current || !hasTranslatableContent(current)) {
          continue;
        }

        const previous = elementCache[attribute];
        const source = previous && current === previous.applied ? previous.source : current;
        queueSourceCapture(source);
        const translated = resolveDictionaryValue(source, language, activeDictionary, englishDictionary);
        if (current !== translated) {
          element.setAttribute(attribute, translated);
        }
        elementCache[attribute] = { source, applied: translated };
      }
      attributeCache.set(element, elementCache);
    };

    const applyTranslationsToNode = (root: Node) => {
      if (root.nodeType === Node.TEXT_NODE) {
        applyTextNode(root as Text);
        return;
      }

      if (root.nodeType !== Node.ELEMENT_NODE) {
        return;
      }

      const rootElement = root as Element;
      applyElementAttributes(rootElement);
      rootElement.querySelectorAll("*").forEach((element) => {
        applyElementAttributes(element);
      });

      const textWalker = document.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT);
      let textNode = textWalker.nextNode();
      while (textNode) {
        applyTextNode(textNode as Text);
        textNode = textWalker.nextNode();
      }
    };

    const runWithGuard = (fn: () => void) => {
      if (isApplyingTranslationRef.current) {
        return;
      }
      isApplyingTranslationRef.current = true;
      try {
        fn();
      } finally {
        isApplyingTranslationRef.current = false;
      }
    };

    runWithGuard(() => {
      if (document.body) {
        applyTranslationsToNode(document.body);
      }
    });

    const observer = new MutationObserver((mutations) => {
      runWithGuard(() => {
        for (const mutation of mutations) {
          if (mutation.type === "characterData") {
            applyTranslationsToNode(mutation.target);
            continue;
          }
          if (mutation.type === "attributes") {
            applyTranslationsToNode(mutation.target);
            continue;
          }
          mutation.addedNodes.forEach((node) => {
            applyTranslationsToNode(node);
          });
        }
      });
    });

    if (document.body) {
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: [...TRANSLATABLE_ATTRIBUTES],
      });
    }

    return () => {
      observer.disconnect();
      if (captureTimeoutRef.current !== null) {
        window.clearTimeout(captureTimeoutRef.current);
        captureTimeoutRef.current = null;
      }
      flushCapturedSources();
    };
  }, [activeDictionary, englishDictionary, flushCapturedSources, language, queueSourceCapture]);

  const value = useMemo<TranslationContextValue>(
    () => ({
      language,
      setLanguage,
      t,
      translateText,
      dictionary: activeDictionary,
    }),
    [activeDictionary, language, setLanguage, t, translateText],
  );

  return createElement(TranslationContext.Provider, { value }, children);
}

function useTranslation() {
  return useContext(TranslationContext);
}

export default useTranslation;