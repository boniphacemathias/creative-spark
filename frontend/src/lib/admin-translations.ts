import { getActiveWorkspaceId } from "@/lib/workspace";
import staticTranslations from "@/data/translations.json";

export interface TranslationDictionary {
  [key: string]: string;
}

export interface AdminTranslationStore {
  version: 1;
  updatedAt: string;
  activeLocale: string;
  locales: Record<string, TranslationDictionary>;
}

export interface TranslationImportResult {
  locale: string;
  imported: number;
  overwritten: number;
  skipped: number;
  store: AdminTranslationStore;
}

const STORAGE_KEY_PREFIX = "creative-spark-admin-translations";
const DEFAULT_LOCALE = "en";
const MAX_TRANSLATION_KEYS = 10000;
export const ADMIN_TRANSLATIONS_CHANGED_EVENT = "creative-spark-admin-translations-change";

const DEFAULT_EN_MESSAGES: TranslationDictionary = {
  "admin.title": "Admin Dashboard",
  "admin.overview": "Overview",
  "admin.data": "Data & Files",
  "admin.translations": "Translations",
  "admin.refresh": "Refresh",
  "admin.export": "Export",
  "admin.import": "Import",
  "admin.save": "Save",
  "admin.upload_files": "Upload Files",
  "admin.download": "Download",
  "admin.workspace": "Workspace",
  "admin.role": "Role",
};

const STATIC_TRANSLATION_MAP = staticTranslations as Record<string, Record<string, string>>;
const DEFAULT_SW_MESSAGES: TranslationDictionary = {
  ...(STATIC_TRANSLATION_MAP.sw || {}),
};

function nowIso() {
  return new Date().toISOString();
}

function getStorageKey(): string {
  return `${STORAGE_KEY_PREFIX}:${getActiveWorkspaceId()}`;
}

function normalizeLocale(value: unknown): string {
  const normalized = String(value || "")
    .trim()
    .replace(/_/g, "-")
    .toLowerCase();
  if (!normalized) {
    return DEFAULT_LOCALE;
  }
  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,2}$/.test(normalized)) {
    return DEFAULT_LOCALE;
  }
  return normalized.slice(0, 24);
}

export function normalizeAdminTranslationKey(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 120);
}

function sanitizeDictionary(input: unknown): TranslationDictionary {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  const output: TranslationDictionary = {};
  for (const [rawKey, rawValue] of Object.entries(input as Record<string, unknown>)) {
    if (Object.keys(output).length >= MAX_TRANSLATION_KEYS) {
      break;
    }
    const key = normalizeAdminTranslationKey(rawKey);
    if (!key) {
      continue;
    }
    const value = String(rawValue ?? "").trim().slice(0, 1200);
    if (!value) {
      continue;
    }
    output[key] = value;
  }
  return output;
}

function createDefaultStore(): AdminTranslationStore {
  const fallbackEn = sanitizeDictionary(STATIC_TRANSLATION_MAP.en || {});
  const fallbackSw = sanitizeDictionary(STATIC_TRANSLATION_MAP.sw || {});
  return {
    version: 1,
    updatedAt: nowIso(),
    activeLocale: DEFAULT_LOCALE,
    locales: {
      [DEFAULT_LOCALE]: { ...fallbackEn, ...DEFAULT_EN_MESSAGES },
      sw: { ...DEFAULT_SW_MESSAGES, ...fallbackSw },
    },
  };
}

function normalizeStore(input: unknown): AdminTranslationStore {
  const fallback = createDefaultStore();
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return fallback;
  }

  const source = input as Partial<AdminTranslationStore>;
  const localesInput =
    source.locales && typeof source.locales === "object" && !Array.isArray(source.locales)
      ? source.locales
      : {};
  const locales: Record<string, TranslationDictionary> = {};

  for (const [rawLocale, dictionary] of Object.entries(localesInput)) {
    const locale = normalizeLocale(rawLocale);
    const sanitized = sanitizeDictionary(dictionary);
    locales[locale] = sanitized;
  }

  if (!locales[DEFAULT_LOCALE]) {
    locales[DEFAULT_LOCALE] = { ...DEFAULT_EN_MESSAGES };
  } else {
    locales[DEFAULT_LOCALE] = {
      ...DEFAULT_EN_MESSAGES,
      ...locales[DEFAULT_LOCALE],
    };
  }

  return {
    version: 1,
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : nowIso(),
    activeLocale: locales[normalizeLocale(source.activeLocale)] ? normalizeLocale(source.activeLocale) : DEFAULT_LOCALE,
    locales,
  };
}

function writeStore(store: AdminTranslationStore): AdminTranslationStore {
  if (typeof window === "undefined") {
    return store;
  }
  const next = normalizeStore({
    ...store,
    updatedAt: nowIso(),
  });
  window.localStorage.setItem(getStorageKey(), JSON.stringify(next));
  window.dispatchEvent(
    new CustomEvent(ADMIN_TRANSLATIONS_CHANGED_EVENT, {
      detail: {
        workspaceId: getActiveWorkspaceId(),
        locale: next.activeLocale,
        updatedAt: next.updatedAt,
      },
    }),
  );
  return next;
}

export function readAdminTranslationStore(): AdminTranslationStore {
  if (typeof window === "undefined") {
    return createDefaultStore();
  }
  const raw = window.localStorage.getItem(getStorageKey());
  if (!raw) {
    return writeStore(createDefaultStore());
  }

  try {
    return normalizeStore(JSON.parse(raw));
  } catch {
    return writeStore(createDefaultStore());
  }
}

export function listAdminTranslationLocales(): string[] {
  const store = readAdminTranslationStore();
  return Object.keys(store.locales).sort((left, right) => left.localeCompare(right));
}

export function getAdminTranslationDictionary(locale: string): TranslationDictionary {
  const store = readAdminTranslationStore();
  const normalizedLocale = normalizeLocale(locale);
  return {
    ...(store.locales[DEFAULT_LOCALE] || {}),
    ...(store.locales[normalizedLocale] || {}),
  };
}

export function getAdminLocaleMessages(locale: string): TranslationDictionary {
  const store = readAdminTranslationStore();
  const normalizedLocale = normalizeLocale(locale);
  return { ...(store.locales[normalizedLocale] || {}) };
}

export function setAdminActiveLocale(locale: string): AdminTranslationStore {
  const store = readAdminTranslationStore();
  const normalizedLocale = normalizeLocale(locale);
  if (!store.locales[normalizedLocale]) {
    store.locales[normalizedLocale] = {};
  }
  store.activeLocale = normalizedLocale;
  return writeStore(store);
}

export function upsertAdminTranslationDictionary(
  locale: string,
  dictionary: TranslationDictionary,
  mode: "merge" | "replace" = "merge",
): AdminTranslationStore {
  const store = readAdminTranslationStore();
  const normalizedLocale = normalizeLocale(locale);
  const sanitized = sanitizeDictionary(dictionary);
  const existing = store.locales[normalizedLocale] || {};

  store.locales[normalizedLocale] = mode === "replace" ? sanitized : { ...existing, ...sanitized };
  store.activeLocale = normalizedLocale;
  return writeStore(store);
}

export function deleteAdminTranslationLocale(locale: string): AdminTranslationStore {
  const store = readAdminTranslationStore();
  const normalizedLocale = normalizeLocale(locale);
  if (normalizedLocale === DEFAULT_LOCALE) {
    return store;
  }
  delete store.locales[normalizedLocale];
  if (!store.locales[store.activeLocale]) {
    store.activeLocale = DEFAULT_LOCALE;
  }
  return writeStore(store);
}

export function exportAdminTranslationLocale(locale: string): string {
  const normalizedLocale = normalizeLocale(locale);
  const dictionary = getAdminTranslationDictionary(normalizedLocale);
  return JSON.stringify(
    {
      locale: normalizedLocale,
      messages: dictionary,
      exportedAt: nowIso(),
    },
    null,
    2,
  );
}

export function importAdminTranslationLocale(
  locale: string,
  payload: string,
  mode: "merge" | "replace" = "merge",
): TranslationImportResult {
  const parsed = JSON.parse(payload) as unknown;
  const source =
    parsed && typeof parsed === "object" && !Array.isArray(parsed) && "messages" in parsed
      ? (parsed as { messages: unknown }).messages
      : parsed;
  const dictionary = sanitizeDictionary(source);
  const normalizedLocale = normalizeLocale(locale);
  const store = readAdminTranslationStore();
  const existing = store.locales[normalizedLocale] || {};

  let imported = 0;
  let overwritten = 0;
  let skipped = 0;
  for (const [key, value] of Object.entries(dictionary)) {
    if (!key || !value) {
      skipped += 1;
      continue;
    }
    imported += 1;
    if (existing[key] && existing[key] !== value) {
      overwritten += 1;
    }
  }

  const nextStore = upsertAdminTranslationDictionary(normalizedLocale, dictionary, mode);
  return {
    locale: normalizedLocale,
    imported,
    overwritten,
    skipped,
    store: nextStore,
  };
}

export function exportAdminTranslationsPack(): string {
  const store = readAdminTranslationStore();
  return JSON.stringify(
    {
      version: 1,
      activeLocale: store.activeLocale,
      locales: store.locales,
      exportedAt: nowIso(),
    },
    null,
    2,
  );
}

export function importAdminTranslationsPack(
  payload: string,
  mode: "merge" | "replace" = "merge",
): AdminTranslationStore {
  const parsed = JSON.parse(payload) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid language pack payload.");
  }

  const source = parsed as { locales?: unknown; activeLocale?: unknown };
  if (!source.locales || typeof source.locales !== "object" || Array.isArray(source.locales)) {
    throw new Error("Language pack must include a locales object.");
  }

  const store = readAdminTranslationStore();
  const nextLocales =
    mode === "replace"
      ? {}
      : {
          ...store.locales,
        };

  for (const [rawLocale, dictionary] of Object.entries(source.locales as Record<string, unknown>)) {
    const locale = normalizeLocale(rawLocale);
    const sanitized = sanitizeDictionary(dictionary);
    nextLocales[locale] =
      mode === "replace"
        ? sanitized
        : {
            ...(nextLocales[locale] || {}),
            ...sanitized,
          };
  }

  const nextStore = writeStore({
    version: 1,
    updatedAt: nowIso(),
    activeLocale: normalizeLocale(source.activeLocale || store.activeLocale),
    locales: nextLocales,
  });

  return nextStore;
}
