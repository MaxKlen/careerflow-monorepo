import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'CareerFlow', description: 'A traceable workspace for your next career step.' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body><div className="site">{children}</div></body></html>; }
