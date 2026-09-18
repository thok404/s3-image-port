"use client";

import { useAtomValue } from "jotai";
import { childFoldersAtom, currentPrefixAtom } from "../hooks/use-photo-list";
import { FolderBreadcrumb } from "./FolderBreadcrumb";
import { FolderGrid } from "./FolderGrid";

/**
 * Folder navigation for the gallery: a breadcrumb of the current path plus the
 * tiles of its direct subfolders. Hidden entirely when there is nothing to
 * navigate.
 */
export function FolderBrowse() {
  const folders = useAtomValue(childFoldersAtom);
  const currentPrefix = useAtomValue(currentPrefixAtom);

  if (folders.length === 0 && currentPrefix === undefined) {
    return null;
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <FolderBreadcrumb />
      <FolderGrid />
    </div>
  );
}
