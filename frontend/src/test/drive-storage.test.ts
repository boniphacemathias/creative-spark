import { beforeEach, describe, expect, it } from "vitest";
import { getDriveStorageService } from "@/lib/drive-storage";

describe("drive-storage", () => {
  beforeEach(() => {
    getDriveStorageService().clearAll();
  });

  it("supports folder/file CRUD with move and rename", () => {
    const service = getDriveStorageService();

    const rootFolder = service.createFolder("Research");
    const nestedFolder = service.createFolder("Drafts", rootFolder.id);

    const file = service.uploadFileFromContent(
      {
        name: "notes.txt",
        mimeType: "text/plain",
        size: 42,
        content: "Audience: Caregivers\nInsight: Trust barrier",
        tags: ["research", "insight"],
      },
      nestedFolder.id,
    );

    expect(service.listEntries(nestedFolder.id)).toHaveLength(1);

    const renamedFile = service.renameEntry(file.id, "notes-renamed.txt");
    expect(renamedFile?.name).toBe("notes-renamed.txt");

    const movedFile = service.moveEntry(file.id, rootFolder.id);
    expect(movedFile).toMatchObject({
      id: file.id,
      folderId: rootFolder.id,
    });

    expect(service.listEntries(rootFolder.id).some((entry) => entry.id === file.id)).toBe(true);

    const deletedFolder = service.deleteEntry(nestedFolder.id);
    expect(deletedFolder).toBe(true);
  });

  it("indexes and searches metadata and extracted text", () => {
    const service = getDriveStorageService();
    service.uploadFileFromContent({
      name: "brief.txt",
      mimeType: "text/plain",
      size: 120,
      content: "Behavior change insight for mothers and elders.",
      tags: ["brief", "behavior"],
    });

    const searchResults = service.search("mothers");
    expect(searchResults.length).toBeGreaterThan(0);
    expect(searchResults[0].name).toContain("brief");
  });
});
