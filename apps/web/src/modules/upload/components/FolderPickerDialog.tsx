"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  normalizeFolderPathInput,
  normalizePrefix,
  parentPrefix,
} from "@/lib/s3/folder-path";
import {
  CheckIcon,
  ChevronRightIcon,
  CornerLeftUpIcon,
  FolderIcon,
  FolderPlusIcon,
  Loader2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { useTranslations } from "use-intl";
import { useS3FolderListing } from "../hooks/use-s3-folder-listing";

/**
 * Browses the folders that exist in the bucket and returns the chosen one.
 *
 * Typing a not-yet-existing path is accepted too, and a folder can be created
 * on the spot, so the picker does not force the user to go back to the gallery
 * when they want a new album for this upload.
 */
export function FolderPickerDialog({
  open,
  onOpenChange,
  value,
  root = "",
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The currently selected folder, `null` when the key template decides. */
  value: string | null;
  /** The highest folder the picker browses, normally the include path. */
  root?: string;
  onSelect: (folder: string | null) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <PickerBody
          value={value}
          root={root}
          onSelect={onSelect}
          onClose={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}

/**
 * Mounted only while the dialog is open, so browsing always starts from the
 * current selection without an effect that resets the state.
 */
function PickerBody({
  value,
  root,
  onSelect,
  onClose,
}: {
  value: string | null;
  root: string;
  onSelect: (folder: string | null) => void;
  onClose: () => void;
}) {
  const t = useTranslations("upload.settings.target.picker");
  const { folders, hasError, isCreating, refresh, createFolder } =
    useS3FolderListing();

  const initial = value ?? normalizePrefix(root);
  const [prefix, setPrefix] = useState(() => initial);
  const [typed, setTyped] = useState(() => initial);
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  useEffect(() => {
    void refresh(prefix);
  }, [prefix, refresh]);

  const current = normalizePrefix(prefix);
  const rootPrefix = normalizePrefix(root);
  const up = parentPrefix(current);
  const canGoUp = current !== rootPrefix;
  const typedFolder = typed.trim() === "" ? root : typed;
  const normalizedTyped = normalizeFolderPathInput(typedFolder);

  const goTo = (next: string) => {
    setPrefix(next);
    setTyped(next);
  };

  const breadcrumb = (() => {
    const items: { label: string; prefix: string }[] = [
      { label: rootPrefix === "" ? t("root") : rootPrefix, prefix: rootPrefix },
    ];
    let accumulated = rootPrefix;
    for (const part of current
      .slice(rootPrefix.length)
      .split("/")
      .filter(Boolean)) {
      accumulated += `${part}/`;
      items.push({ label: part, prefix: accumulated });
    }
    return items;
  })();

  const submitNewFolder = async () => {
    const name = newFolderName.trim();
    if (name === "") {
      return;
    }
    const target = normalizeFolderPathInput(`${current}${name}`);
    if (!target) {
      return;
    }
    const created = await createFolder(target);
    if (created) {
      setNewFolderName("");
      setIsCreatingNew(false);
      goTo(target);
      void refresh(target);
    }
  };

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{t("title")}</DialogTitle>
        <DialogDescription>{t("desc")}</DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("up")}
            title={t("up")}
            disabled={!canGoUp}
            onClick={() => goTo(up)}
          >
            <CornerLeftUpIcon className="size-4" />
          </Button>
          <nav
            aria-label={t("current")}
            className="flex min-w-0 flex-wrap items-center gap-0.5"
          >
            {breadcrumb.map((item, index) => {
              const isLast = index === breadcrumb.length - 1;
              return (
                <Fragment key={item.prefix}>
                  {index > 0 && (
                    <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isLast}
                    className={cn(
                      "max-w-40 truncate font-mono text-xs",
                      isLast && "font-medium",
                    )}
                    onClick={() => goTo(item.prefix)}
                  >
                    {item.label}
                  </Button>
                </Fragment>
              );
            })}
          </nav>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="upload-folder-path"
            className="text-sm font-medium text-muted-foreground"
          >
            {t("pathLabel")}
          </label>
          <div className="flex gap-2">
            <Input
              id="upload-folder-path"
              aria-label={t("pathLabel")}
              className="font-mono"
              placeholder={t("pathPlaceholder")}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && normalizedTyped) {
                  goTo(normalizedTyped);
                }
              }}
            />
            <Button
              variant="outline"
              disabled={!normalizedTyped}
              onClick={() => normalizedTyped && goTo(normalizedTyped)}
            >
              {t("go")}
            </Button>
          </div>
        </div>

        <div className="max-h-56 min-h-24 overflow-y-auto rounded-md border">
          {folders === null ? (
            <div className="flex h-24 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              {t("loading")}
            </div>
          ) : hasError ? (
            <div className="flex h-24 items-center justify-center gap-2 px-4 text-center text-sm text-destructive">
              <TriangleAlertIcon className="size-4 shrink-0" />
              {t("loadFailed")}
            </div>
          ) : folders.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
              {t("empty")}
            </div>
          ) : (
            <ul className="flex flex-col p-1">
              {folders.map((folder) => (
                <li key={folder}>
                  <button
                    type="button"
                    onClick={() => goTo(folder)}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left font-mono text-sm hover:bg-accent hover:text-accent-foreground"
                  >
                    <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">
                      {folder.slice(current.length, -1)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {isCreatingNew ? (
          <div className="flex items-center gap-2">
            <Input
              aria-label={t("newFolder")}
              autoFocus
              className="font-mono"
              placeholder={t("newFolderPlaceholder")}
              value={newFolderName}
              disabled={isCreating}
              onChange={(event) => setNewFolderName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void submitNewFolder();
                }
              }}
            />
            <Button
              size="icon-sm"
              aria-label={t("create")}
              title={t("create")}
              disabled={newFolderName.trim() === "" || isCreating}
              onClick={() => void submitNewFolder()}
            >
              <CheckIcon className="size-4" />
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="w-fit"
            onClick={() => setIsCreatingNew(true)}
          >
            <FolderPlusIcon className="size-4" />
            {t("newFolder")}
          </Button>
        )}
      </div>

      <DialogFooter className="sm:justify-between">
        <Button
          variant="ghost"
          onClick={() => {
            onSelect(null);
            onClose();
          }}
        >
          {t("useTemplate")}
        </Button>
        <Button
          disabled={!normalizedTyped}
          onClick={() => {
            onSelect(normalizePrefix(typedFolder));
            onClose();
          }}
        >
          {t("select")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
