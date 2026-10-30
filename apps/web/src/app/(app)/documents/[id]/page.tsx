import { cookies } from 'next/headers';
import { apiFetch } from '@/lib/api';
import DocumentEditor from './DocumentEditor';

interface DocumentRecord {
  id: string;
  title: string;
  kind: string;
}

interface DocumentVersion {
  id: string;
  content: string;
  provenance: Array<{ text: string; sourceType: string; sourceId?: string; note?: string }>;
  createdAt: string;
}

export default async function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieHeader = (await cookies()).toString();
  const { document, versions } = await apiFetch<{ document: DocumentRecord; versions: DocumentVersion[] }>(
    `/documents/${id}`,
    { cookies: cookieHeader },
  );
  return <DocumentEditor document={document} versions={versions} />;
}
