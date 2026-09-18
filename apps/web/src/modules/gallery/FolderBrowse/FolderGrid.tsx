"use client";

import { displayOptionsAtom } from "@/stores/atoms/gallery";
import { useAtomValue, useSetAtom } from "jotai";
import { ChevronRightIcon, FolderIcon } from "lucide-react";
import { useTranslations } from "use-intl";
import { childFoldersAtom } from "../hooks/use-photo-list";

/**
 * The direct subfolders of the folder currently being browsed. Clicking a tile
 * enters that folder.
 */
export function FolderGrid() {
  const t = useTranslations("gallery.folder");
  const folders = useAtomValue(childFoldersAtom);
  const setDisplayOptions = useSetAtom(displayOptionsAtom);

  if (folders.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <FolderIcon className="size-4" />
        <span>{t("folders")}</span>
        <span className="text-xs">({folders.length})</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {folders.map((folder) => (
          <button
            key={folder.prefix}
            type="button"
            title={folder.prefix}
            onClick={() =>
              setDisplayOptions((prev) => ({
                ...prev,
                prefix: folder.prefix,
              }))
            }
            className="group flex items-center gap-3 rounded-lg border border-border bg-card/50 px-3 py-2.5 text-left transition-colors hover:border-foreground/20 hover:bg-accent"
          >
            <FolderIcon className="size-5 shrink-0 text-amber-500 group-hover:text-amber-600 dark:group-hover:text-amber-400" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {folder.name}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {t("photoCount", { count: folder.totalPhotoCount })}
              </span>
            </span>
            <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        ))}
      </div>
    </div>
  );
}
