import "./globals.css";

// The <html> element lives in [locale]/layout.tsx so lang/dir can vary per locale.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
