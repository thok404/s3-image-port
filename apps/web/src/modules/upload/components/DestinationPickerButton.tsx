"use client";

import { Button } from "@/components/ui/button";
import { normalizePrefix } from "@/lib/s3/folder-path";
import { validS3SettingsAtom } from "@/stores/atoms/settings";
import { cn } from "@/lib/utils";
import { useAtomValue } from "jotai";
import { FolderOpenIcon } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { FolderPickerDialog } from "./FolderPickerDialog";

/**
 * The folder a set of uploads goes to, as a button that opens the picker.
 *
 * The picker never browses above the configured include path: that path is the
 * root the app manages, and picking something outside it would put files in a
 * place the gallery does not show.
 */
export function DestinationPickerButton({
  folder,
  onSelect,
  size = "default",
  className,
  ariaLabel,
}: {
  /** `null` follows the key template, `""` is the bucket root. */
  folder: string | null;
  onSelect: (folder: string | null) => void;
  size?: "default" | "sm";
  className?: string;
  ariaLabel?: string;
}) {
  const t = useTranslations("upload.settings.target");
  const s3Settings = useAtomValue(validS3SettingsAtom);
  const [open, setOpen] = useState(false);

  const label =
    folder === null
      ? t("followTemplate")
      : folder === ""
        ? t("bucketRoot")
        : folder;

  return (
    <>
      <Button
        variant="outline"
        size={size}
        aria-label={ariaLabel}
        data-testid="destination-picker-button"
        className={cn("min-w-0 justify-start", className)}
        onClick={() => setOpen(true)}
      >
        <FolderOpenIcon className="size-4 shrink-0" />
        <span className="truncate font-mono">{label}</span>
      </Button>

      <FolderPickerDialog
        open={open}
        onOpenChange={setOpen}
        value={folder}
        root={normalizePrefix(s3Settings?.includePath ?? "")}
        onSelect={onSelect}
      />
    </>
  );
}
