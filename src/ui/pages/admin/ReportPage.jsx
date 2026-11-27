'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, useAction, useQuery } from '../../api';
import { Button } from '../../components/ui/Button';
import { AreaBars, areaColor, Avatar, Empty, PageHeader, RATING_LABELS, Section, SkillMeter, StatusBadge, subjectBg } from '../../components/ui/Display';
import { skillArea } from '../../api/best';
import { FastResults } from '../../components/fast/FastResults';
import { cn } from '../../lib/cn';
import { PageLoading } from '../../components/ui/Display';
import { Field, Segmented, Textarea } from '../../components/ui/Form';
import { useResultToast } from '../../components/ui/Toast';
import { fmtDate, fmtDateYear, fullName, gradeLabel } from '../../lib/format';
import { Link } from '../../lib/router';

/**
 * /admin/reports/[reportId] — progress report editor.
 * Data: reports.getReport, taxonomy.listSubjects; writes: updateReport, setRatings, publishReport.
 */
export default function ReportPage({ params }) {
  const show = useResultToast();
  const { data: report } = useQuery(() => api.reports.getReport({ reportId: params.reportId }).catch((e) => { if (e?.code === 'NOT_FOUND') return null; throw e; }), [params.reportId]);
  const { data: subjects = [] } = useQuery(() => api.taxonomy.listSubjects(), []);
  const student = report?.student;
  const parent = report?.parent;

  const [summary, setSummary] = useState('');
  const [ratings, setRatings] = useState({});
  useEffect(() => {
    if (!report) return;
    setSummary(report.summary);
    setRatings(Object.fromEntries(report.ratings.map((r) => [r.skillId, r.rating])));
  }, [report?.id]);

  const [save, saving] = useAction(async () => {
    const a = await api.reports.updateReport({ reportId: report.id, summary });
    if (!a.ok) return a;
    return api.reports.setRatings({ reportId: report.id, ratings: Object.entries(ratings).filter(([, v]) => v).map(([skillId, rating]) => ({ skillId, rating })) });
  });
  const [publish, publishing] = useAction(api.reports.publishReport);

  // Skills grouped by the FAST area (grades 3–6) or strand (K–2) they count toward.
  const groups = useMemo(() => {
    if (!student) return [];
    const skills = (subjects[0]?.skills ?? []).filter((k) => student.grade >= k.gradeMin && student.grade <= k.gradeMax);
    const map = new Map();
    skills.forEach((k) => {
      const area = skillArea(student.grade, k);
      if (!map.has(area.id)) map.set(area.id, { area, skills: [] });
      map.get(area.id).skills.push(k);
    });
    return [...map.values()];
  }, [student, subjects]);
  if (report === null) return <Section><Empty title="We couldn’t find that report. It may have been removed." action={<Link href="/admin/reports" className="text-small hit-area font-medium text-brand hover:underline">Back to Reports</Link>} /></Section>;
  if (!report || !student) return <PageLoading />;
  const published = report.status === 'PUBLISHED';
  const rated = Object.values(ratings).filter(Boolean).length;

  return (
    <>
      <PageHeader
        back={{ href: `/admin/families/${parent.id}`, label: `${parent.name}’s family` }}
        title={`Progress report for ${student.firstName}`}
        subtitle={`${fmtDate(report.periodStart)} – ${fmtDateYear(report.periodEnd)}${published ? `. Published ${fmtDate(report.publishedAt)}.` : '. Draft, only you can see it.'}`}
        actions={
          published ? (
            <StatusBadge status="PUBLISHED" />
          ) : (
            <>
              <Button variant="glass" disabled={saving} onClick={async () => show(await save(), 'Draft saved')}>Save draft</Button>
              <Button
                variant="primary"
                disabled={publishing || saving}
                onClick={async () => {
                  if (show(await save())) show(await publish({ reportId: report.id }), 'Report published', `${parent.name.split(' ')[0]} has been notified.`);
                }}
              >
                Publish to family
              </Button>
            </>
          )
        }
      />

      <div className="grid items-start gap-6 @4xl/page:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Section title="Summary" description="Written for the family. Plain words, what’s improved, what’s next.">
            <div className="p-4 @3xl/page:p-5">
              <Field>{(id) => <Textarea id={id} aria-label="Summary" rows={6} value={summary} disabled={published} onChange={(e) => setSummary(e.target.value)} placeholder={`${student.firstName} has been working on…`} />}</Field>
            </div>
          </Section>

          {groups.map(({ area, skills }) => (
            <Section
              key={area.id}
              title={<span className="inline-flex items-center gap-2"><span className={cn('size-2.5 rounded-xs', subjectBg(areaColor(area)))} aria-hidden />{area.name}</span>}
              description={area.fullName !== area.name ? area.fullName : 'Rate the skills you worked on. Skip the rest.'}
            >
              {skills.map((k) => (
                <div key={k.id} className="flex flex-col gap-2 px-4 py-3 @3xl/page:flex-row @3xl/page:items-center @3xl/page:justify-between @3xl/page:px-5">
                  <p className="text-body font-medium">{k.name}</p>
                  {published ? (
                    ratings[k.id] ? <SkillMeter rating={ratings[k.id]} /> : <span className="text-small text-subtle-foreground">Not rated</span>
                  ) : (
                    <Segmented
                      label={`${k.name} rating`}
                      size="sm"
                      value={ratings[k.id] ?? 0}
                      onChange={(v) => setRatings((r) => ({ ...r, [k.id]: v }))}
                      options={[{ value: 0, label: 'Skip' }, ...RATING_LABELS.map((l, i) => ({ value: i + 1, label: l }))]}
                    />
                  )}
                </div>
              ))}
            </Section>
          ))}
        </div>

        <div className="space-y-5">
        <Section title="Book work this period">
          <div className="space-y-4 p-4 @3xl/page:p-5">
            <p className="text-body">
              {report.bookWork.assigned ? (
                <><span className="font-semibold">{report.bookWork.done} of {report.bookWork.assigned}</span> book assignments done.</>
              ) : (
                'No book work in these dates.'
              )}
            </p>
            <AreaBars areas={report.bookAreas} empty="Nothing checked yet in these dates." />
          </div>
        </Section>
        <Section title="Test results">
          <div className="p-4 @3xl/page:p-5"><FastResults student={student} canEdit={false} compact /></div>
        </Section>
        <Section title="About this report">
          <div className="flex items-center gap-3 px-4 py-4 @3xl/page:px-5">
            <Avatar name={fullName(student)} tone={student.avatarColor} size="md" />
            <div>
              <p className="text-body font-medium">{fullName(student)}</p>
              <p className="text-small text-muted-foreground">{gradeLabel(student.grade)}</p>
            </div>
          </div>
          <div className="space-y-2 px-4 py-4 text-body leading-relaxed text-muted-foreground @3xl/page:px-5">
            <p><span className="font-medium text-foreground">{rated}</span> skill{rated === 1 ? '' : 's'} rated.</p>
            <p>Publishing sends {parent.name.split(' ')[0]} one notification. Once published, the report can’t be edited.</p>
          </div>
        </Section>
        </div>
      </div>
    </>
  );
}
