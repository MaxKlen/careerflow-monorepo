export const metadata = { title: 'CareerFlow for Employers' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui', background: '#0b1f3a', color: 'white', margin: 0, padding: 0, minHeight: '100vh' }}>
        <nav style={{ padding: '12px 24px', borderBottom: '1px solid #1e3a5f', display: 'flex', gap: 16, alignItems: 'center' }}>
          <strong>CareerFlow for Employers</strong>
          <a href="/login" style={{ color: '#94a3b8', textDecoration: 'none', marginInlineStart: 'auto' }}>Sign in</a>
        </nav>
        <main style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>{children}</main>
      </body>
    </html>
  );
}
