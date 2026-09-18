"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { displayOptionsAtom } from "@/stores/atoms/gallery";
import { useAtom, useAtomValue } from "jotai";
import { ChevronRightIcon, FolderTreeIcon, Trash2Icon } from "lucide-react";
import { Fragment, useState } from "react";
import { useTranslations } from "use-intl";
import { normalizePrefix } from "@/lib/s3/folder-path";
import {
  breadcrumbSegmentsAtom,
  currentPrefixAtom,
} from "../hooks/use-photo-list";
import { DeleteFolderDialog } from "./DeleteFolderDialog";

/**
 * Breadcrumb of the folder currently being browsed, plus the controls that act
 * on it. Render nothing when no folder filter is applied ("all photos" view).
 */
export function FolderBreadcrumb() {
  const t = useTranslations("gallery.folder");
  const [displayOptions, setDisplayOptions] = useAtom(displayOptionsAtom);
  const currentPrefix = useAtomValue(currentPrefixAtom);
  const segments = useAtomValue(breadcrumbSegmentsAtom);
  const [deleteOpened, setDeleteOpened] = useState(false);

  if (currentPrefix === undefined) {
    return null;
  }

  // The bucket root itself cannot be deleted, only the folders inside it.
  const deletablePrefix = normalizePrefix(currentPrefix);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <nav
        aria-label={t("browseByFolder")}
        className="flex min-w-0 flex-wrap items-center gap-1"
      >
        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1;
          const label = segment.name ?? t("allPhotos");
          return (
            <Fragment key={segment.prefix ?? "__all-photos__"}>
              {index > 0 && (
                <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
              )}
              {isLast ? (
                <span className="max-w-64 truncate px-2.5 text-sm font-medium">
                  {label}
                </span>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  title={t("goToFolder", { name: label })}
                  onClick={() =>
                    setDisplayOptions((prev) => ({
                      ...prev,
                      prefix: segment.prefix,
                    }))
                  }
                >
                  <span className="max-w-64 truncate">{label}</span>
                </Button>
              )}
            </Fragment>
          );
        })}
      </nav>

      <div className="flex shrink-0 items-center gap-2">
        <Button
          variant={displayOptions.includeSubfolders ? "secondary" : "outline"}
          size="sm"
          title={t("includeSubfoldersHint")}
          aria-pressed={displayOptions.includeSubfolders}
          onClick={() =>
            setDisplayOptions((prev) => ({
              ...prev,
              includeSubfolders: !prev.includeSubfolders,
            }))
          }
          className={cn(
            "shrink-0",
            displayOptions.includeSubfolders && "text-secondary-foreground",
          )}
        >
          <FolderTreeIcon className="size-4" />
          {t("includeSubfolders")}
        </Button>
        {deletablePrefix !== "" && (
          <Button
            variant="destructive"
            size="icon-sm"
            title={t("manage.deleteCurrent")}
            aria-label={t("manage.deleteCurrent")}
            onClick={() => setDeleteOpened(true)}
          >
            <Trash2Icon className="size-4" />
          </Button>
        )}
      </div>

      {deletablePrefix !== "" && (
        <DeleteFolderDialog
          prefix={deletablePrefix}
          open={deleteOpened}
          onOpenChange={setDeleteOpened}
        />
      )}
    </div>
  );
}
