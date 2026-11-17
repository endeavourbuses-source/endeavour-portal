import './globals.css';

export const metadata = { title: 'Endeavour Buses Portal', appleWebApp: { capable: true, title: 'Endeavour', statusBarStyle: 'black-translucent' as const } };
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#12284a' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <body>{children}</body>
    </html>
  );
}
