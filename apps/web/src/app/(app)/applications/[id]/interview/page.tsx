import { cookies } from 'next/headers';
import { apiFetch } from '@/lib/api';
import InterviewPrep from './InterviewPrep';

export default async function InterviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieHeader = (await cookies()).toString();
  const data = await apiFetch<any>(`/interview/${id}`, { cookies: cookieHeader });
  return <InterviewPrep applicationId={id} initial={data} />;
}
