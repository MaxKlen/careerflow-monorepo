import { cookies } from 'next/headers';
import { apiFetch } from '@/lib/api';
import { API_URL } from '@/lib/api';
import StagePicker from '@/components/StagePicker';
import ConfirmRequirement from './ConfirmRequirement';
import Timeline from './Timeline';
import Link from 'next/link';
import InviteEmployer from './InviteEmployer';

export default async function Application({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieHeader = (await cookies()).toString();
  const [data, eventData] = await Promise.all([
    apiFetch<any>(`/applications/${id}`, { cookies: cookieHeader }),
    apiFetch<{ events: any[] }>(`/applications/${id}/events`, { cookies: cookieHeader }),
  ]);

  return (
    <>
      <div className="grid">
        <div className="card">
          <h1>Application workspace</h1>
          <p className="muted">Application {data.application.id}</p>
          <p>Current stage: <b>{data.application.stage}</b></p>
          <StagePicker id={id} stage={data.application.stage} />
        </div>
        <div className="card">
          <h2>Requirement / evidence map</h2>
          <p className="notice">Phrase match is a text cue; confirm evidence to mark it linked; none means no link.</p>
          {data.requirements.length ? data.requirements.map((requirement: any) => (
            <div
              className="split"
              style={{ borderBottom: '1px solid #e5eeea', padding: '12px 0' }}
              key={requirement.id}
            >
              <span>{requirement.text}</span>
              <span className="pill">{requirement.state}</span>
              {requirement.state !== 'linked' && (
                <ConfirmRequirement
                  applicationId={data.application.id}
                  requirementId={requirement.id}
                  workspaceId={data.application.workspaceId}
                />
              )}
            </div>
          )) : (
            <p className="muted">No requirements were carried into this application.</p>
          )}
        </div>
      </div>
      <div className="card"><h3 style={{ marginBlockStart: 0 }}>Interview</h3><Link href={`/applications/${data.application.id}/interview`}><button className="btn">Prepare for interview</button></Link></div>
      <InviteEmployer applicationId={data.application.id} />
      <section className="card" aria-labelledby="timeline-heading" style={{ marginBlockStart: 20 }}>
        <h2 id="timeline-heading">Timeline</h2>
        <Timeline applicationId={data.application.id} events={eventData.events} />
        <p style={{ marginBlockStart: 8 }}><a href={`${API_URL}/calendar/applications/${data.application.id}.ics`} download>Add application events to calendar (.ics)</a></p>
      </section>
    </>
  );
}
