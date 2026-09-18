import { createFileRoute, Navigate } from "@tanstack/react-router";

/**
 * Upload settings used to live in their own settings page, which meant leaving
 * the place they apply to in order to change them. They now sit on the upload
 * page itself, and this route only exists so old links keep working.
 */
export const Route = createFileRoute("/$locale/_root-layout/settings/upload")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <Navigate
      from="/$locale/settings/upload"
      to="/$locale/upload"
      params={(prev) => ({ locale: prev.locale })}
    />
  );
}
