import { routing } from "@/i18n/routing";

// Static export has no middleware, so pick the locale in the browser.
const script = `(function () {
  var locales = ${JSON.stringify(routing.locales)};
  var lang = (navigator.language || "").slice(0, 2).toLowerCase();
  var locale = locales.indexOf(lang) !== -1 ? lang : ${JSON.stringify(routing.defaultLocale)};
  location.replace("/" + locale + "/");
})();`;

export default function RootPage() {
  return (
    <html lang={routing.defaultLocale}>
      <head>
        <meta httpEquiv="refresh" content={`0; url=/${routing.defaultLocale}/`} />
        <script dangerouslySetInnerHTML={{ __html: script }} />
      </head>
      <body />
    </html>
  );
}
