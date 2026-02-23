import { KeyValueStorage } from "@/lib/storage/kv-storage";
import { LocalStorageKV } from "@/lib/storage/local-storage-kv";

export type DriveEntryType = "folder" | "file";

export interface DriveFolder {
  id: string;
  type: "folder";
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DriveFile {
  id: string;
  type: "file";
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  extractedText: string;
  folderId: string | null;
}

export type DriveEntry = DriveFolder | DriveFile;

export interface DriveStore {
  version: 1;
  updatedAt: string;
  folders: DriveFolder[];
  files: DriveFile[];
}

export interface DriveUploadInput {
  name: string;
  mimeType: string;
  size: number;
  content: string;
  tags?: string[];
}

const DRIVE_STORAGE_KEY = "sbcc_builder_ai_drive_v1";

function nowIso(): string {
  return new Date().toISOString();
}

function buildId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function createEmptyStore(): DriveStore {
  return {
    version: 1,
    updatedAt: nowIso(),
    folders: [],
    files: [],
  };
}

function isTextLike(mimeType: string, name: string): boolean {
  const loweredName = name.toLowerCase();
  return (
    mimeType.startsWith("text/") ||
    mimeType.includes("json") ||
    mimeType.includes("csv") ||
    loweredName.endsWith(".txt") ||
    loweredName.endsWith(".csv") ||
    loweredName.endsWith(".json") ||
    loweredName.endsWith(".md")
  );
}

function extractTextFromContent(input: DriveUploadInput): string {
  if (!input.content) {
    return "";
  }

  if (isTextLike(input.mimeType, input.name)) {
    return input.content.slice(0, 120000);
  }

  return `Binary file uploaded: ${input.name}`;
}

function sortByName<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
}

export class DriveStorageService {
  constructor(private readonly storage: KeyValueStorage) {}

  private read(): DriveStore {
    const raw = this.storage.getItem(DRIVE_STORAGE_KEY);
    if (!raw) {
      const fresh = createEmptyStore();
      this.write(fresh);
      return fresh;
    }

    try {
      const parsed = JSON.parse(raw) as DriveStore;
      if (parsed.version !== 1 || !Array.isArray(parsed.folders) || !Array.isArray(parsed.files)) {
        throw new Error("Invalid drive store shape");
      }
      return parsed;
    } catch {
      const fresh = createEmptyStore();
      this.write(fresh);
      return fresh;
    }
  }

  private write(store: DriveStore): void {
    this.storage.setItem(DRIVE_STORAGE_KEY, JSON.stringify(store));
  }

  private touch(store: DriveStore): DriveStore {
    return {
      ...store,
      updatedAt: nowIso(),
    };
  }

  listEntries(folderId: string | null = null, searchQuery = ""): DriveEntry[] {
    const store = this.read();
    const query = searchQuery.trim().toLowerCase();

    const folders = store.folders.filter((folder) => folder.parentId === folderId);
    const files = store.files.filter((file) => file.folderId === folderId);

    const entries: DriveEntry[] = [...sortByName(folders), ...sortByName(files)];

    if (!query) {
      return entries;
    }

    return entries.filter((entry) => {
      const tags = entry.type === "file" ? entry.tags.join(" ") : "";
      const extracted = entry.type === "file" ? entry.extractedText : "";
      return `${entry.name} ${tags} ${extracted}`.toLowerCase().includes(query);
    });
  }

  listFolders(): DriveFolder[] {
    return sortByName(this.read().folders);
  }

  getFolderById(folderId: string | null): DriveFolder | null {
    if (!folderId) {
      return null;
    }
    return this.read().folders.find((folder) => folder.id === folderId) ?? null;
  }

  createFolder(name: string, parentId: string | null = null): DriveFolder {
    const normalizedName = normalizeName(name);
    if (!normalizedName) {
      throw new Error("Folder name cannot be empty.");
    }

    const store = this.read();
    const conflict = store.folders.some(
      (folder) => folder.parentId === parentId && folder.name.toLowerCase() === normalizedName.toLowerCase(),
    );

    if (conflict) {
      throw new Error("A folder with this name already exists in the selected location.");
    }

    const timestamp = nowIso();
    const folder: DriveFolder = {
      id: buildId("drive-folder"),
      type: "folder",
      name: normalizedName,
      parentId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const nextStore = this.touch({ ...store, folders: [...store.folders, folder] });
    this.write(nextStore);

    return folder;
  }

  async uploadFile(file: File, folderId: string | null = null, tags: string[] = []): Promise<DriveFile> {
    const content = await file.text();
    return this.uploadFileFromContent(
      {
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        content,
        tags,
      },
      folderId,
    );
  }

  uploadFileFromContent(input: DriveUploadInput, folderId: string | null = null): DriveFile {
    const normalizedName = normalizeName(input.name);
    if (!normalizedName) {
      throw new Error("File name cannot be empty.");
    }

    const store = this.read();
    const timestamp = nowIso();
    const file: DriveFile = {
      id: buildId("drive-file"),
      type: "file",
      name: normalizedName,
      mimeType: input.mimeType,
      size: input.size,
      createdAt: timestamp,
      updatedAt: timestamp,
      tags: Array.from(new Set((input.tags ?? []).map((tag) => tag.trim()).filter(Boolean))),
      extractedText: extractTextFromContent(input),
      folderId,
    };

    const nextStore = this.touch({ ...store, files: [...store.files, file] });
    this.write(nextStore);

    return file;
  }

  renameEntry(id: string, nextName: string): DriveEntry | null {
    const normalized = normalizeName(nextName);
    if (!normalized) {
      throw new Error("Name cannot be empty.");
    }

    const store = this.read();
    const timestamp = nowIso();

    const folderIndex = store.folders.findIndex((folder) => folder.id === id);
    if (folderIndex >= 0) {
      const target = store.folders[folderIndex];
      store.folders[folderIndex] = { ...target, name: normalized, updatedAt: timestamp };
      this.write(this.touch(store));
      return store.folders[folderIndex];
    }

    const fileIndex = store.files.findIndex((file) => file.id === id);
    if (fileIndex >= 0) {
      const target = store.files[fileIndex];
      store.files[fileIndex] = { ...target, name: normalized, updatedAt: timestamp };
      this.write(this.touch(store));
      return store.files[fileIndex];
    }

    return null;
  }

  moveEntry(id: string, destinationFolderId: string | null): DriveEntry | null {
    const store = this.read();
    const timestamp = nowIso();

    const folderIndex = store.folders.findIndex((folder) => folder.id === id);
    if (folderIndex >= 0) {
      if (id === destinationFolderId) {
        throw new Error("Folder cannot be moved into itself.");
      }
      if (this.isDescendant(store.folders, id, destinationFolderId)) {
        throw new Error("Folder cannot be moved into its descendant.");
      }
      const target = store.folders[folderIndex];
      store.folders[folderIndex] = { ...target, parentId: destinationFolderId, updatedAt: timestamp };
      this.write(this.touch(store));
      return store.folders[folderIndex];
    }

    const fileIndex = store.files.findIndex((file) => file.id === id);
    if (fileIndex >= 0) {
      const target = store.files[fileIndex];
      store.files[fileIndex] = { ...target, folderId: destinationFolderId, updatedAt: timestamp };
      this.write(this.touch(store));
      return store.files[fileIndex];
    }

    return null;
  }

  deleteEntry(id: string): boolean {
    const store = this.read();

    const folder = store.folders.find((candidate) => candidate.id === id);
    if (folder) {
      const folderIds = this.collectFolderTreeIds(store.folders, folder.id);
      const nextFolders = store.folders.filter((candidate) => !folderIds.has(candidate.id));
      const nextFiles = store.files.filter((file) => !folderIds.has(file.folderId ?? "") && file.folderId !== folder.id);
      this.write(this.touch({ ...store, folders: nextFolders, files: nextFiles }));
      return true;
    }

    const nextFiles = store.files.filter((file) => file.id !== id);
    if (nextFiles.length !== store.files.length) {
      this.write(this.touch({ ...store, files: nextFiles }));
      return true;
    }

    return false;
  }

  search(query: string): DriveEntry[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return [];
    }

    const store = this.read();
    const entries: DriveEntry[] = [...store.folders, ...store.files];

    return entries
      .filter((entry) => {
        const tags = entry.type === "file" ? entry.tags.join(" ") : "";
        const extracted = entry.type === "file" ? entry.extractedText : "";
        return `${entry.name} ${tags} ${extracted}`.toLowerCase().includes(normalized);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  getBreadcrumbs(folderId: string | null): DriveFolder[] {
    const store = this.read();
    if (!folderId) {
      return [];
    }

    const byId = new Map(store.folders.map((folder) => [folder.id, folder]));
    const chain: DriveFolder[] = [];

    let cursor: string | null = folderId;
    while (cursor) {
      const folder = byId.get(cursor);
      if (!folder) {
        break;
      }
      chain.unshift(folder);
      cursor = folder.parentId;
    }

    return chain;
  }

  getAllFiles(): DriveFile[] {
    return sortByName(this.read().files);
  }

  clearAll(): void {
    this.write(createEmptyStore());
  }

  private collectFolderTreeIds(folders: DriveFolder[], rootId: string): Set<string> {
    const ids = new Set<string>([rootId]);
    let expanded = true;

    while (expanded) {
      expanded = false;
      for (const folder of folders) {
        if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
          ids.add(folder.id);
          expanded = true;
        }
      }
    }

    return ids;
  }

  private isDescendant(folders: DriveFolder[], sourceId: string, targetId: string | null): boolean {
    if (!targetId) {
      return false;
    }

    const byId = new Map(folders.map((folder) => [folder.id, folder]));
    let cursor: string | null = targetId;

    while (cursor) {
      if (cursor === sourceId) {
        return true;
      }
      cursor = byId.get(cursor)?.parentId ?? null;
    }

    return false;
  }
}

let singleton: DriveStorageService | null = null;

export function getDriveStorageService(): DriveStorageService {
  if (!singleton) {
    singleton = new DriveStorageService(new LocalStorageKV());
  }
  return singleton;
}

export function resetDriveStorageServiceForTests(service?: DriveStorageService): void {
  singleton = service ?? null;
}

export { DRIVE_STORAGE_KEY };
