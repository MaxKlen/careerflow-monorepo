import type { ReactNode } from 'react';
import AdminNav from '@/components/AdminNav';
export const metadata = { title: 'CareerFlow Admin' };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body style={{ fontFamily: 'system-ui', padding: 0, margin: 0, background: '#0b1f3a', color: 'white', minHeight: '100vh' }}>
    <AdminNav /><main style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>{children}</main>
  </body></html>;
}
