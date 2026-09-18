"use client";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import { Switch } from "@/components/animate-ui/components/base/switch";
import { useAtomValue, useSetAtom } from "jotai";
import { XIcon } from "lucide-react";
import { useTranslations } from "use-intl";
import {
  applyUploadTargetAtom,
  uploadDestinationPreviewAtom,
  uploadTargetAtom,
} from "../atoms/upload-atoms";
import { DestinationPickerButton } from "./DestinationPickerButton";

/**
 * Where the queued files are uploaded to.
 *
 * The old app only offered the key template, so "put these in another folder"
 * meant editing a template full of placeholders and hoping. This field makes
 * the destination a first class choice, and shows the resulting path right
 * away so the choice can be verified before anything is uploaded.
 */
export function TargetFolderField() {
  const t = useTranslations("upload.settings.target");
  const target = useAtomValue(uploadTargetAtom);
  const applyTarget = useSetAtom(applyUploadTargetAtom);
  const preview = useAtomValue(uploadDestinationPreviewAtom);

  return (
    <div className="flex flex-col gap-4">
      <Field className="gap-2">
        <FieldLabel>{t("label")}</FieldLabel>
        <div className="flex items-center gap-2">
          <DestinationPickerButton
            folder={target.folder}
            onSelect={(folder) => applyTarget({ folder })}
          />
          {target.folder !== null && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("followTemplate")}
              title={t("followTemplate")}
              onClick={() => applyTarget({ folder: null })}
            >
              <XIcon className="size-4" />
            </Button>
          )}
        </div>
        <div
          className="rounded-md border bg-muted/40 px-3 py-2"
          data-testid="upload-destination-preview"
        >
          <div className="text-xs text-muted-foreground">{t("preview")}</div>
          <div className="font-mono text-sm break-all">
            <span className="text-muted-foreground">{preview.fileName} → </span>
            {preview.key}
          </div>
        </div>
      </Field>

      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor="upload-keep-subdirs">
            {t("keepSubdirs")}
          </FieldLabel>
          <FieldDescription>
            {target.folder === null
              ? t("keepSubdirsDisabled")
              : t("keepSubdirsDesc")}
          </FieldDescription>
        </FieldContent>
        <Switch
          id="upload-keep-subdirs"
          aria-label={t("keepSubdirs")}
          checked={target.keepTemplateSubdirs}
          disabled={target.folder === null}
          onCheckedChange={(checked) =>
            applyTarget({ keepTemplateSubdirs: checked })
          }
        />
      </Field>
    </div>
  );
}
