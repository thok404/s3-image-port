"use client";

import { displayOptionsAtom } from "@/stores/atoms/gallery";
import { useAtomValue, useSetAtom } from "jotai";
import { FolderIcon } from "lucide-react";
import { useTranslations } from "use-intl";
import { childFoldersAtom } from "../hooks/use-photo-list";
import { FolderTileMenu } from "./FolderTileMenu";
import { NewFolderButton } from "./NewFolderButton";

/**
 * The direct subfolders of the folder currently being browsed. Clicking a tile
 * enters that folder, the tile menu manages it.
 *
 * The header is always rendered so a folder can be created even when the bucket
 * (or the current folder) holds none yet.
 */
export function FolderGrid() {
  const t = useTranslations("gallery.folder");
  const folders = useAtomValue(childFoldersAtom);
  const setDisplayOptions = useSetAtom(displayOptionsAtom);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <FolderIcon className="size-4" />
          <span>{t("folders")}</span>
          <span className="text-xs">({folders.length})</span>
        </div>
        <NewFolderButton />
      </div>
      {folders.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {folders.map((folder) => (
            <div key={folder.prefix} className="relative">
              <button
                type="button"
                title={folder.prefix}
                onClick={() =>
                  setDisplayOptions((prev) => ({
                    ...prev,
                    prefix: folder.prefix,
                  }))
                }
                className="flex w-full items-center gap-3 rounded-lg border border-border bg-card/50 py-2.5 pr-10 pl-3 text-left transition-colors hover:border-foreground/20 hover:bg-accent"
              >
                <FolderIcon className="size-5 shrink-0 text-amber-500" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {folder.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {t("photoCount", { count: folder.totalPhotoCount })}
                  </span>
                </span>
              </button>
              <div className="absolute top-1/2 right-1 -translate-y-1/2">
                <FolderTileMenu folder={folder} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
