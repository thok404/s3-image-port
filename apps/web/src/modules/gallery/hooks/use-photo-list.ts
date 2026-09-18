import type { Photo } from "@/stores/schemas/photo";
import ImageS3Client from "@/lib/s3/image-s3-client";
import { compareAsc, compareDesc, isAfter, isBefore } from "date-fns";
import Fuse from "fuse.js";
import { atom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "use-intl";
import { validS3SettingsAtom, s3SettingsAtom } from "@/stores/atoms/settings";
import { getTimeRange } from "./use-display-control";
import {
  deriveBreadcrumbSegments,
  deriveChildFolders,
  isFolderMarker,
  isPhotoInFolderScope,
  normalizePrefix as normalizePrefixForBrowse,
  type BreadcrumbSegment,
  type ChildFolder,
} from "@/lib/s3/folder-path";
import {
  currentPageAtom,
  photosAtom,
  displayOptionsAtom,
  galleryDirtyStatusAtom,
} from "@/stores/atoms/gallery";

export const photosAtomReadOnly = atom((get) => get(photosAtom));

export { normalizePrefix } from "@/lib/s3/folder-path";

export const availablePrefixesAtom = atom<
  { name: string; hierarchy: number }[]
>((get) => {
  const photos = get(photosAtomReadOnly);
  const prefixes = new Set(
    photos.flatMap((photo) => {
      if (isFolderMarker(photo.Key)) {
        // the marker's own folder, e.g. `i/2024/` for the key `i/2024/`
        return [photo.Key];
      }
      const parts = photo.Key.split("/");
      return parts
        .slice(0, -1)
        .map((_, index) => parts.slice(0, index + 1).join("/"));
    }),
  );
  return [...Array.from(prefixes), ""]
    .map((prefix) => {
      const hierarchy = prefix.split("/").length - 1;
      return { name: prefix, hierarchy };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
});

export type { ChildFolder, BreadcrumbSegment } from "@/lib/s3/folder-path";

/** The prefix the user is currently browsing, `undefined` means "all photos". */
export const currentPrefixAtom = atom((get) => get(displayOptionsAtom).prefix);

/**
 * The folder the gallery treats as its root. When the S3 settings restrict the
 * listing to an include path, that path *is* the root as far as the user is
 * concerned, so new folders have to be created inside it.
 */
export const folderRootAtom = atom((get) =>
  normalizePrefixForBrowse(get(s3SettingsAtom).includePath ?? ""),
);

/**
 * The folder used to compute the folder list. Falls back to the bucket root
 * when no prefix filter is applied, so the root folders are always reachable.
 */
export const browsePrefixAtom = atom((get) =>
  normalizePrefixForBrowse(get(currentPrefixAtom) ?? ""),
);

/** The folder new folders are created in. */
export const parentPrefixAtom = atom((get) =>
  get(currentPrefixAtom) === undefined
    ? get(folderRootAtom)
    : get(browsePrefixAtom),
);

/**
 * Direct subfolders of the folder currently being browsed, derived from the
 * loaded photo list.
 */
export const childFoldersAtom = atom<ChildFolder[]>((get) =>
  deriveChildFolders(get(photosAtomReadOnly), get(browsePrefixAtom)),
);

/**
 * Number of photos at or below the folder currently being browsed. Folder
 * markers are not photos, so they are not counted.
 */
export const currentFolderPhotoCountAtom = atom((get) => {
  const base = get(browsePrefixAtom);
  return get(photosAtomReadOnly).filter(
    (photo) =>
      !isFolderMarker(photo.Key) &&
      photo.Key.startsWith(base) &&
      photo.Key.length > base.length,
  ).length;
});

export const breadcrumbSegmentsAtom = atom<BreadcrumbSegment[]>((get) =>
  deriveBreadcrumbSegments(get(currentPrefixAtom)),
);

export const filteredPhotosAtom = atom<Photo[]>((get) => {
  const photos = get(photosAtomReadOnly);
  const displayOptions = get(displayOptionsAtom);

  const searchedPhotos = displayOptions.searchTerm
    ? new Fuse(photos, {
        keys: ["Key"],
        threshold: 0.3,
      })
        .search(displayOptions.searchTerm)
        .map((result) => result.item)
    : photos;

  const displayedPhotos = searchedPhotos
    .filter((photo) => {
      // Folder markers are in the list to keep empty folders browsable, they
      // are not photos and have nothing to render in the grid.
      if (isFolderMarker(photo.Key)) {
        return false;
      }
      if (
        !isPhotoInFolderScope(
          photo,
          displayOptions.prefix,
          displayOptions.includeSubfolders,
        )
      ) {
        return false;
      }
      const [from, to] = getTimeRange(displayOptions.dateRangeType);
      if (from && isBefore(photo.LastModified, from)) {
        return false;
      }
      if (to && isAfter(photo.LastModified, to)) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (displayOptions.searchTerm) {
        return 0; // Fuse.js already sorted by relevance
      }
      if (displayOptions.sortBy === "key") {
        return displayOptions.sortOrder === "asc"
          ? a.Key.localeCompare(b.Key)
          : b.Key.localeCompare(a.Key);
      } else {
        return displayOptions.sortOrder === "asc"
          ? compareAsc(a.LastModified, b.LastModified)
          : compareDesc(a.LastModified, b.LastModified);
      }
    });
  return displayedPhotos;
});

export const filteredPhotosCountAtom = atom((get) => {
  return get(filteredPhotosAtom).length;
});

export const PER_PAGE = 20;

export const showingPhotosAtom = atom<Photo[]>((get) => {
  const start = (get(currentPageAtom) - 1) * PER_PAGE;
  const end = start + PER_PAGE;
  return get(filteredPhotosAtom).slice(start, end);
});

export const useFetchPhotoList = () => {
  const setPhotos = useSetAtom(photosAtom);
  const s3Settings = useAtomValue(validS3SettingsAtom);
  const t = useTranslations("gallery.store");
  const setGalleryDirty = useSetAtom(galleryDirtyStatusAtom);

  const [status, setStatus] = useState<"idle" | "loading">("idle");

  const fetchPhotoList = useCallback(
    async (
      {
        toastLevel = "info",
      }: {
        toastLevel: "info" | "error" | "silent";
      } = { toastLevel: "info" },
    ) => {
      if (!s3Settings) {
        if (toastLevel !== "silent") {
          toast.error(t("s3SettingsNotFound"));
        }
        console.error("S3 settings not found");
        return;
      }
      let photos: Photo[];
      try {
        setStatus("loading");
        photos = await new ImageS3Client(s3Settings).list();
        setGalleryDirty(false);
      } catch (error) {
        if (toastLevel !== "silent") {
          toast.error(t("failedToFetchPhotos"));
        }
        console.error("Failed to fetch photos", error);
        return;
      } finally {
        setStatus("idle");
      }
      if (photos) {
        if (toastLevel !== "silent" && toastLevel !== "error") {
          toast.message(t("fetchedPhotos"));
        }
        console.log("Fetched photos", photos.length);
        setPhotos(photos);
      } else {
        if (toastLevel !== "silent") {
          toast.error(t("failedToFetchPhotos"));
        }
        console.error("Failed to fetch photos");
      }
    },
    [s3Settings, setPhotos, t, setGalleryDirty],
  );

  const isLoading = status === "loading";

  return { fetchPhotoList, status, isLoading };
};
