import { atom, type PrimitiveAtom, type SetStateAction } from "jotai";
import { splitAtom } from "jotai/utils";
import { monotonicFactory } from "ulid";
import { v4 as uuid } from "uuid";
import { toast } from "sonner";

import { defaultKeyTemplate, S3KeyMetadata } from "@/lib/s3/s3-key";
import {
  isSupportedFileType,
  processFile,
  type CompressOption,
} from "@/lib/utils/imageCompress";
import ImageS3Client from "@/lib/s3/image-s3-client";
import { uploadSettingsAtom } from "@/stores/atoms/settings";
import { setGalleryDirtyAtom } from "@/stores/atoms/gallery";
import type { S3Options } from "@/stores/schemas/settings";
import type { PendingUpload } from "../types";

export const fileListAtom = atom<PendingUpload[]>([]);

export const appendFilesAtom = atom(null, (get, set, newFiles: File[]) => {
  const uploadSettings = get(uploadSettingsAtom);
  const ulid = monotonicFactory();
  const uploadObjects = newFiles.map(
    (file) =>
      ({
        file,
        processedFile: null,
        key: S3KeyMetadata.create(
          file,
          uploadSettings?.keyTemplate ?? defaultKeyTemplate,
          ulid,
          uploadSettings?.targetFolder ?? null,
          uploadSettings?.keepTemplateSubdirs ?? true,
        ),
        compressOption: uploadSettings?.compressionOption ?? null,
        id: uuid(),
        status: "pending",
        supportProcess: isSupportedFileType(file),
      }) satisfies PendingUpload,
  );
  set(fileListAtom, [...get(fileListAtom), ...uploadObjects]);
});

export const clearUploadedFilesAtom = atom(
  (get) => {
    return get(fileListAtom).some((file) => file.status === "uploaded");
  },
  (get, set) => {
    const filtered = get(fileListAtom).filter(
      (file) => file.status !== "uploaded",
    );
    set(fileListAtom, filtered);
  },
);

export const fileAtomAtoms = splitAtom(fileListAtom, (file) => file.id);

export const processFileAtom = atom(
  null,
  async (get, set, atom: PrimitiveAtom<PendingUpload>) => {
    const initFile = get(atom);
    if (!initFile.compressOption || !isSupportedFileType(initFile.file)) {
      return;
    }
    set(atom, (prev) => ({
      ...prev,
      status: "processing",
    }));
    try {
      const file = get(atom);
      const processed = await processFile(
        file.file,
        file.compressOption!,
        () => {},
      );
      set(atom, (prev) => ({
        ...prev,
        processedFile: processed,
        key: S3KeyMetadata.updateFile(processed, prev.key),
        status: "processed",
      }));
    } catch (error) {
      toast.error(`Processing failed for ${get(atom).file.name}`);
      console.error("Processing failed", error);
      set(atom, (prev) => ({
        ...prev,
        status: "pending",
      }));
      throw error;
    }
  },
);

export const uploadFileAtom = atom(
  null,
  async (
    get,
    set,
    atom: PrimitiveAtom<PendingUpload>,
    s3Settings: S3Options,
  ) => {
    await set(processFileAtom, atom);
    const file = get(atom);
    const processedFile = file.processedFile ?? file.file;
    set(atom, (prev) => ({
      ...prev,
      status: "uploading",
    }));
    try {
      await new ImageS3Client(s3Settings).upload(
        processedFile,
        file.key.toString(),
      );
      set(atom, (prev) => ({
        ...prev,
        status: "uploaded",
      }));
      set(setGalleryDirtyAtom);
    } catch (error) {
      console.error("Upload failed", error);
      set(atom, (prev) => ({
        ...prev,
        status: "pending",
      }));
    }
  },
);

export const uploadAllFilesAtom = atom(
  null,
  async (get, set, s3Settings: S3Options) => {
    await Promise.all(
      get(fileAtomAtoms).map(async (atom) => {
        await set(uploadFileAtom, atom, s3Settings);
      }),
    );
  },
);

export const presetsAtom = atom(
  (get) => get(uploadSettingsAtom).keyTemplatePresets || [],
);

// MARK: upload destination

export type UploadTarget = {
  /** `null` follows the key template, `""` is the bucket root. */
  folder: string | null;
  keepTemplateSubdirs: boolean;
};

/**
 * Applies `mapper` to the files that are not in flight.
 *
 * Uploaded files are left alone: their key has already been used, and rewriting
 * it would make the copy button hand out a URL that does not exist. Uploading
 * files are left alone for the same reason — their key is already in a request.
 *
 * `alsoSkip` covers the states a specific update must not touch; changing the
 * compression while a file is being converted would otherwise discard the
 * result the in-flight conversion is about to write.
 */
function mapQueuedFiles(
  files: PendingUpload[],
  mapper: (item: PendingUpload) => PendingUpload,
  alsoSkip: PendingUpload["status"][] = [],
): PendingUpload[] {
  const skip = ["uploaded", "uploading", ...alsoSkip];
  return files.map((item) =>
    skip.includes(item.status) ? item : mapper(item),
  );
}

/** The folder the next uploads go to, together with the subfolder behaviour. */
export const uploadTargetAtom = atom(
  (get): UploadTarget => {
    const upload = get(uploadSettingsAtom);
    return {
      folder: upload.targetFolder ?? null,
      keepTemplateSubdirs: upload.keepTemplateSubdirs,
    };
  },
  (get, set, update: Partial<UploadTarget>) => {
    set(uploadSettingsAtom, (prev) => ({
      ...prev,
      ...("folder" in update ? { targetFolder: update.folder ?? null } : {}),
      ...("keepTemplateSubdirs" in update
        ? { keepTemplateSubdirs: update.keepTemplateSubdirs ?? true }
        : {}),
    }));
  },
);

/**
 * Changes the destination of the whole upload session.
 *
 * The choice is persisted as the default for the files added later, and the
 * files already queued follow along, so what the user sees is what is uploaded.
 */
export const applyUploadTargetAtom = atom(
  null,
  (get, set, update: Partial<UploadTarget>) => {
    set(uploadTargetAtom, update);
    const target = get(uploadTargetAtom);
    set(
      fileListAtom,
      mapQueuedFiles(get(fileListAtom), (item) => ({
        ...item,
        key: item.key.withFolder(target.folder, target.keepTemplateSubdirs),
      })),
    );
  },
);

/**
 * The default key template, as edited on the upload page.
 *
 * Queued files follow it, which keeps the per file key display and the preview
 * honest after the template is edited.
 */
export const applyUploadTemplateAtom = atom(
  (get) => get(uploadSettingsAtom).keyTemplate,
  (get, set, update: SetStateAction<string>) => {
    const next = get(uploadSettingsAtom).keyTemplate;
    const template = typeof update === "function" ? update(next) : update;
    set(uploadSettingsAtom, (prev) => ({ ...prev, keyTemplate: template }));
    set(
      fileListAtom,
      mapQueuedFiles(get(fileListAtom), (item) => ({
        ...item,
        key: S3KeyMetadata.updateTemplate(template, item.key),
      })),
    );
  },
);

/** The default compression option, applied to the queued files as well. */
export const applyUploadCompressionAtom = atom(
  (get) => get(uploadSettingsAtom).compressionOption,
  (get, set, option: CompressOption | null) => {
    set(uploadSettingsAtom, (prev) => ({
      ...prev,
      compressionOption: option,
    }));
    set(
      fileListAtom,
      mapQueuedFiles(
        get(fileListAtom),
        (item) => ({
          ...item,
          compressOption: option,
          // Whatever was processed before is now stale.
          processedFile: null,
          status: "pending",
        }),
        // A conversion in progress already picked its format; rewriting the
        // file now would throw its result away.
        ["processing"],
      ),
    );
  },
);

/** A key built from the current settings, for the destination preview. */
function buildPreviewKey(
  upload: { keyTemplate?: string; targetFolder?: string | null } | undefined,
  keepTemplateSubdirs: boolean,
) {
  const sample = new File([], "IMG_0001.jpg", { type: "image/jpeg" });
  return S3KeyMetadata.create(
    sample,
    upload?.keyTemplate ?? defaultKeyTemplate,
    // A fixed id keeps the preview stable while the user edits the settings.
    () => "01J00000000000000000000000",
    upload?.targetFolder ?? null,
    keepTemplateSubdirs,
  );
}

/**
 * The key a queued file will get, so the destination can be shown as a real
 * path instead of "folder X, some template". Falls back to a sample file when
 * nothing is queued yet.
 */
export const uploadDestinationPreviewAtom = atom((get) => {
  const queued = get(fileListAtom).find((item) => item.status !== "uploaded");
  if (queued) {
    return {
      key: queued.key.toString(),
      fileName: queued.file.name,
      fromSample: false,
    };
  }
  const target = get(uploadTargetAtom);
  return {
    key: buildPreviewKey(
      get(uploadSettingsAtom),
      target.keepTemplateSubdirs,
    ).toString(),
    fileName: "IMG_0001.jpg",
    fromSample: true,
  };
});
