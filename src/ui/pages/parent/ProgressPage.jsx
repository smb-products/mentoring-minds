'use client';

import { useState } from 'react';
import { FileBarChart } from 'lucide-react';
import { api, useQuery } from '../../api';
import { ChildSwitcher } from '../../components/shell/ChildSwitcher';
import { LockedPage, useLocked } from '../../components/shell/Locked';
import { useShell } from '../../components/shell/ShellContext';
import { AreaBars, areaColor, Empty, Figures, PageHeader, Row, Section, SkillMeter, Stars, subjectBg } from '../../components/ui/Display';
import { FastResults } from '../../components/fast/FastResults';
import { PageLoading } from '../../components/ui/Display';
import { cn } from '../../lib/cn';
import { fmtDate, fmtDateYear } from '../../lib/format';
import { useRouter } from '../../lib/router';

/** /parent/progress — data: reports.listForStudent (published only), assignments.listForStudent */
export default function ParentProgressPage() {
  return useLocked() ? <LockedPage title="Progress" /> : <ParentProgress />;
}

function ParentProgress() {
  const { activeStudent: kid } = useShell();
  const { navigate } = useRouter();
  const { data: reports = [] } = useQuery(() => (kid ? api.reports.listForStudent({ studentId: kid.id }) : []), [kid?.id]);
  const { data: work = [] } = useQuery(() => (kid ? api.assignments.listForStudent({ studentId: kid.id }) : []), [kid?.id]);
  const [openId, setOpenId] = useState(null);
  if (!kid) return <PageLoading />;

  const graded = work.filter((w) => w.status === 'GRADED');
  const scored = graded.filter((w) => w.maxScore);
  const avg = scored.length ? Math.round((scored.reduce((n, w) => n + w.score / w.maxScore, 0) / scored.length) * 100) : null;
  const report = reports.find((r) => r.id === openId) ?? reports[0];

  // Ratings grouped by FAST area (grades 3–6) or strand (K–2).
  const byArea = report
    ? report.ratings.reduce((acc, r) => {
        (acc[r.area.id] ||= { area: r.area, ratings: [] }).ratings.push(r);
        return acc;
      }, {})
    : {};

  return (
    <>
      <PageHeader title="Progress" subtitle={`How ${kid.firstName} is doing, in Vienne’s words.`} />

      {/* Stars stay beside each graded assignment (Recent results), not in the stats. */}
      <ChildSwitcher className="mb-4" />
      <Figures
        className="mb-6"
        items={[
          { label: 'Done', value: graded.filter((w) => w.assignment.kind === 'BOOK').length },
          { label: 'Average score', value: avg != null ? `${avg}%` : '—' },
        ]}
      />

      <div className="grid items-start gap-6 @4xl/page:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Section
          title={report ? `Report for ${fmtDate(report.periodStart)} – ${fmtDateYear(report.periodEnd)}` : 'Latest report'}
          description={report ? `Shared ${fmtDate(report.publishedAt)}` : null}
        >
          {!report ? (
            <Empty icon={FileBarChart} title="No reports yet">Vienne shares a report every so often, rating each skill {kid.firstName} is working on.</Empty>
          ) : (
            <>
              <p className="px-4 py-4 text-body @3xl/page:px-5">{report.summary}</p>
              {Object.values(byArea).map(({ area, ratings }) => (
                <div key={area.id} className="px-4 py-4 @3xl/page:px-5">
                  <p className="mb-2 flex items-center gap-2 text-heading" title={area.fullName}>
                    <span className={cn('size-2.5 rounded-xs', subjectBg(areaColor(area)))} aria-hidden />
                    {area.name}
                  </p>
                  <ul className="space-y-3">
                    {ratings.map((r) => (
                      <li key={r.id} className="flex flex-col gap-1.5 @xl/page:flex-row @xl/page:items-center @xl/page:justify-between">
                        <div className="min-w-0">
                          <p className="text-body font-medium">{r.skill.name}</p>
                          {r.comment && <p className="text-small text-muted-foreground">{r.comment}</p>}
                        </div>
                        <SkillMeter rating={r.rating} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </>
          )}
        </Section>

        <div className="space-y-6">
          <Section title="School test results" description={kid.grade >= 3 ? 'From the FAST score report in the Family Portal. Add each one after it comes out.' : 'From the Star Math report school sends home.'}>
            <div className="p-4 @3xl/page:p-5"><FastResults student={kid} /></div>
          </Section>
          {kid.bookAreas && (
            <Section title="Book homework by area" description="Right answers out of everything checked so far.">
              <div className="p-4 @3xl/page:p-5"><AreaBars areas={kid.bookAreas} empty="Finished book homework shows up here." /></div>
            </Section>
          )}
          {reports.length > 1 && (
            <Section title="All reports">
              {reports.map((r) => (
                <Row key={r.id} onClick={() => setOpenId(r.id)} className={cn(r.id === report?.id && 'bg-muted')}>
                  <FileBarChart size={17} strokeWidth={1.75} className="text-muted-foreground" aria-hidden />
                  <span className="tabular flex-1 text-body font-medium">{fmtDate(r.periodStart)} – {fmtDateYear(r.periodEnd)}</span>
                </Row>
              ))}
            </Section>
          )}
          <Section title="Recent results">
            {graded.length === 0 ? (
              <Empty title="No results yet" />
            ) : (
              graded.slice(-5).reverse().map((w) => (
                <Row key={w.id} onClick={() => navigate(`/parent/learning/${w.id}`)}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-medium">{w.assignment.title}</p>
                    <p className="text-small text-muted-foreground">{fmtDate(w.submittedAt)}</p>
                  </div>
                  {w.maxScore != null && <span className="tabular text-body font-semibold">{w.score}/{w.maxScore}</span>}
                  <Stars count={w.stars} size={14} />
                </Row>
              ))
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
