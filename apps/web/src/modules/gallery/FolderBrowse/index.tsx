"use client";

import { FolderBreadcrumb } from "./FolderBreadcrumb";
import { FolderGrid } from "./FolderGrid";

/**
 * Folder navigation for the gallery: a breadcrumb of the current path plus the
 * tiles of its direct subfolders, and the controls to manage them.
 */
export function FolderBrowse() {
  return (
    <div className="flex w-full flex-col gap-4">
      <FolderBreadcrumb />
      <FolderGrid />
    </div>
  );
}
