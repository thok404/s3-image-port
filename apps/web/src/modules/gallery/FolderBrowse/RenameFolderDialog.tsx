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
import { useState } from "react";
import { useTranslations } from "use-intl";
import {
  isDescendantPrefix,
  normalizeFolderPathInput,
  normalizePrefix,
} from "@/lib/s3/folder-path";
import { useFolderOperations } from "../hooks/use-folder-operations";

/**
 * Renames a folder by moving it: S3 has no rename, so every object under the
 * prefix is copied to the new one and the old objects are deleted.
 *
 * The field holds the full path, which makes "rename" and "move" the same
 * operation.
 */
export function RenameFolderDialog({
  prefix,
  open,
  onOpenChange,
}: {
  prefix: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("gallery.folder.manage");
  const { moveFolder, isWorking } = useFolderOperations();
  const [path, setPath] = useState(prefix);

  // start from the current path again next time the dialog is opened
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setPath(prefix);
    }
    onOpenChange(next);
  };

  const target = normalizeFolderPathInput(path);
  const currentPath = normalizePrefix(prefix);
  const error =
    target === null
      ? t("invalidPath")
      : target === currentPath
        ? t("samePath")
        : isDescendantPrefix(currentPath, target)
          ? t("nestedPath")
          : null;

  const submit = async () => {
    if (error || !target) {
      return;
    }
    const moved = await moveFolder(currentPath, target);
    if (moved) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("renameTitle")}</DialogTitle>
          <DialogDescription>{t("renameDescription")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <label htmlFor="folder-new-path" className="text-sm font-medium">
            {t("newPathLabel")}
          </label>
          <Input
            id="folder-new-path"
            aria-label={t("newPathLabel")}
            value={path}
            autoFocus
            disabled={isWorking}
            className="font-mono"
            onChange={(event) => setPath(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !error) {
                void submit();
              }
            }}
          />
          <p
            className={
              error
                ? "text-xs text-destructive"
                : "text-xs text-muted-foreground"
            }
          >
            {error ?? t("renameWarning")}
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isWorking}
          >
            {t("cancel")}
          </Button>
          <Button onClick={submit} disabled={!!error || isWorking}>
            {isWorking ? t("moving") : t("renameConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
