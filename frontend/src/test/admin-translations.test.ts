import { beforeEach, describe, expect, it } from "vitest";
import { createWorkspace, setActiveWorkspaceId } from "@/lib/workspace";
import {
  exportAdminTranslationLocale,
  getAdminTranslationDictionary,
  importAdminTranslationLocale,
  readAdminTranslationStore,
  setAdminActiveLocale,
  upsertAdminTranslationDictionary,
} from "@/lib/admin-translations";

describe("admin-translations", () => {
  beforeEach(() => {
    window.localStorage.clear();
    setActiveWorkspaceId("main");
  });

  it("seeds default english locale and supports locale updates", () => {
    const initial = readAdminTranslationStore();
    expect(initial.activeLocale).toBe("en");
    expect(initial.locales.en["admin.title"]).toBeDefined();

    const next = setAdminActiveLocale("sw");
    expect(next.activeLocale).toBe("sw");

    upsertAdminTranslationDictionary("sw", {
      "admin.title": "Dashibodi ya Msimamizi",
      "admin.refresh": "Sasisha",
    });

    const swDictionary = getAdminTranslationDictionary("sw");
    expect(swDictionary["admin.title"]).toBe("Dashibodi ya Msimamizi");
    expect(swDictionary["admin.refresh"]).toBe("Sasisha");
  });

  it("imports and exports locale payloads", () => {
    setAdminActiveLocale("fr");

    const importResult = importAdminTranslationLocale(
      "fr",
      JSON.stringify({
        locale: "fr",
        messages: {
          "admin.title": "Tableau d'administration",
          "admin.refresh": "Actualiser",
        },
      }),
      "replace",
    );
    expect(importResult.imported).toBe(2);

    const exported = exportAdminTranslationLocale("fr");
    expect(exported).toContain('"locale": "fr"');
    expect(exported).toContain('"admin.title": "Tableau d\'administration"');
  });

  it("keeps translation stores isolated by workspace", () => {
    upsertAdminTranslationDictionary("en", {
      "admin.title": "Main Workspace Admin",
    });

    createWorkspace("alpha");
    setActiveWorkspaceId("alpha");
    const alphaStore = readAdminTranslationStore();
    expect(alphaStore.locales.en["admin.title"]).not.toBe("Main Workspace Admin");

    setActiveWorkspaceId("main");
    const mainDictionary = getAdminTranslationDictionary("en");
    expect(mainDictionary["admin.title"]).toBe("Main Workspace Admin");
  });
});
