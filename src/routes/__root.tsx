import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import appCss from "../styles.css?url";

const APP_NAME = "All about me";

function publicHref(path: string) {
  const base = import.meta.env.BASE_URL || "/";
  return `${base}${path.replace(/^\//, "")}`;
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      { name: "description", content: "Primary 3 writing: finish All about me one sentence at a time, then make yourself and pick a background." },
      { name: "theme-color", content: "#d8442c" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: publicHref("/favicon.svg") },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: publicHref("/__grok/manifest.webmanifest") },
      { rel: "apple-touch-icon", href: publicHref("/__grok/icon-180.png") },
    ],
  }),
  component: () => (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
