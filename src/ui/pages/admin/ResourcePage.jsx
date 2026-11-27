'use client';

import { useEffect, useRef, useState } from 'react';
import { FileUp, Trash2 } from 'lucide-react';
import { api, useAction, useQuery } from '../../api';
import { Button } from '../../components/ui/Button';
import { PageHeader, Section, StatusBadge } from '../../components/ui/Display';
import { PageLoading } from '../../components/ui/Display';
import { CheckRow, Field, Input, Segmented, Select, Switch, Textarea, GRADE_OPTIONS } from '../../components/ui/Form';
import { useResultToast, useUndoToast } from '../../components/ui/Toast';
import { fmtBytes, fullName, gradeLabel } from '../../lib/format';
import { useRouter } from '../../lib/router';
import { KIND_META } from './ContentPage';

const EMPTY = { title: '', description: '', kind: 'WORKSHEET', subjectId: 'sub_math', gradeMin: 0, gradeMax: 6, fileId: null, url: '', body: null, visibility: 'ALL', status: 'DRAFT', showInPreview: false, studentIds: [] };

/**
 * /admin/content/[resourceId] and /admin/content/new
 * Data: content.listResources, families.listFamilies, taxonomy.listSubjects. Writes: uploadFile, createResource, updateResource, deleteResource.
 */
export default function ResourcePage({ params }) {
  const isNew = params.resourceId === 'new';
  const { navigate } = useRouter();
  const show = useResultToast();
  const fileInput = useRef(null);
  const { data: resources } = useQuery(() => api.content.listResources(), []);
  const { data: families = [] } = useQuery(() => api.families.listFamilies({ status: 'ACTIVE' }), []);
  const existing = resources?.find((r) => r.id === params.resourceId);
  const [form, setForm] = useState(null);
  const [file, setFile] = useState(null);
  const [upload, uploading] = useAction(api.content.uploadFile);
  const [create, creating] = useAction(api.content.createResource);
  const [update, updating] = useAction(api.content.updateResource);
  const [remove] = useAction(api.content.deleteResource);
  const [restore] = useAction(api.content.restoreResource);
  const undoable = useUndoToast();

  useEffect(() => {
    if (isNew) setForm({ ...EMPTY });
    else if (existing) {
      setForm({ ...existing, url: existing.url ?? '', description: existing.description ?? '', studentIds: existing.sharedWith.map((s) => s.id) });
      setFile(existing.file);
    }
  }, [isNew, existing?.id]);

  if (!form) return <PageLoading />;
  const set = (p) => setForm((f) => ({ ...f, ...p }));
  const students = families.flatMap((f) => f.students);
  const needsFile = form.kind === 'WORKSHEET' || form.kind === 'IMAGE';
  const needsUrl = form.kind === 'VIDEO' || form.kind === 'LINK';

  const submit = async () => {
    const input = {
      title: form.title, description: form.description || null, kind: form.kind, subjectId: 'sub_math',
      gradeMin: Number(form.gradeMin), gradeMax: Number(form.gradeMax), fileId: needsFile ? file?.id ?? null : null,
      url: needsUrl ? form.url : null, body: form.kind === 'NOTE' ? { type: 'doc', text: form.body?.text ?? '' } : null,
      visibility: form.visibility, status: form.status, showInPreview: form.showInPreview, studentIds: form.visibility === 'SELECTED' ? form.studentIds : [],
    };
    const res = isNew ? await create(input) : await update({ resourceId: existing.id, ...input });
    const data = show(res, isNew ? 'Resource added' : 'Changes saved');
    if (data && isNew) navigate(`/admin/content/${data.id}`);
  };

  return (
    <>
      <PageHeader
        back={{ href: '/admin/content', label: 'Content' }}
        title={isNew ? 'Add resource' : form.title || 'Untitled'}
        subtitle={isNew ? 'Worksheets, videos, links and lesson notes for your students.' : `${KIND_META[form.kind].label}. Last edited ${new Date(existing.updatedAt).toLocaleDateString()}.`}
        actions={
          <>
            {!isNew && <StatusBadge status={existing.status} />}
            <Button variant="primary" disabled={creating || updating || uploading} onClick={submit}>{isNew ? 'Add resource' : 'Save changes'}</Button>
          </>
        }
      />

      <div className="grid items-start gap-6 @4xl/page:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Section title="Details">
            <div className="space-y-5 p-4 @3xl/page:p-5">
              <Field label="Type">
                <Segmented label="Type" value={form.kind} onChange={(kind) => set({ kind })} className="w-full" options={Object.entries(KIND_META).map(([value, m]) => ({ value, label: m.label.replace('Lesson note', 'Note') }))} />
              </Field>
              <Field label="Title">{(id) => <Input id={id} value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="Fraction strips worksheet" />}</Field>
              <Field label="Short description">{(id) => <Input id={id} value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="What it’s for, in a sentence" />}</Field>

              {needsFile && (
                <Field label="File" hint="PDF, PNG, JPG or WebP, up to 25 MB.">
                  <div className="flex items-center gap-3 rounded-md border border-dashed border-input/70 p-3">
                    <FileUp size={20} className="shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0 flex-1">
                      {file ? (
                        <>
                          <p className="truncate text-body font-medium">{file.filename}</p>
                          <p className="text-small text-muted-foreground">{fmtBytes(file.sizeBytes)}</p>
                        </>
                      ) : (
                        <p className="text-body text-muted-foreground">No file attached</p>
                      )}
                    </div>
                    <input
                      ref={fileInput}
                      type="file"
                      aria-label="Choose a file to attach"
                      accept="application/pdf,image/png,image/jpeg,image/webp"
                      className="sr-only"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const data = show(await upload({ file: f, filename: f.name, mimeType: f.type, sizeBytes: f.size }), 'File uploaded');
                        if (data) setFile(data);
                        e.target.value = '';
                      }}
                    />
                    <Button size="sm" onClick={() => fileInput.current?.click()} disabled={uploading}>{file ? 'Replace' : 'Choose file'}</Button>
                  </div>
                </Field>
              )}
              {needsUrl && <Field label={form.kind === 'VIDEO' ? 'YouTube or Vimeo link' : 'Link'}>{(id) => <Input id={id} type="url" value={form.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://" />}</Field>}
              {form.kind === 'NOTE' && <Field label="Note">{(id) => <Textarea id={id} rows={8} value={form.body?.text ?? ''} onChange={(e) => set({ body: { type: 'doc', text: e.target.value } })} />}</Field>}
            </div>
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Who can see it">
            <div className="space-y-5 p-4 @3xl/page:p-5">
              <div className="grid grid-cols-2 gap-3">
                <Field label="From">{(id) => <Select id={id} value={form.gradeMin} onChange={(e) => set({ gradeMin: e.target.value })}>{GRADE_OPTIONS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}</Select>}</Field>
                <Field label="To">{(id) => <Select id={id} value={form.gradeMax} onChange={(e) => set({ gradeMax: e.target.value })}>{GRADE_OPTIONS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}</Select>}</Field>
              </div>
              <Field label="Share with">
                <Segmented label="Share with" value={form.visibility} onChange={(visibility) => set({ visibility })} className="w-full" options={[{ value: 'ALL', label: 'Everyone' }, { value: 'GRADES', label: 'These grades' }, { value: 'SELECTED', label: 'Chosen students' }]} />
              </Field>
            </div>
            {form.visibility === 'SELECTED' && (
              <div className="max-h-64 overflow-y-auto py-1">
                {students.map((s) => (
                  <CheckRow key={s.id} checked={form.studentIds.includes(s.id)} onChange={(c) => set({ studentIds: c ? [...form.studentIds, s.id] : form.studentIds.filter((x) => x !== s.id) })} meta={gradeLabel(s.grade)}>
                    {fullName(s)}
                  </CheckRow>
                ))}
              </div>
            )}
            <div className="space-y-4 p-4 @3xl/page:p-5">
              <Switch checked={form.status === 'PUBLISHED'} onChange={(v) => set({ status: v ? 'PUBLISHED' : 'DRAFT' })} label="Published" description="Drafts are only visible to you." />
              <Switch checked={form.showInPreview} onChange={(showInPreview) => set({ showInPreview })} label="Show in preview" description="Families without an invite code see the title, locked." />
            </div>
          </Section>
          {!isNew && (
            <Button variant="destructive" icon={Trash2} onClick={async () => { if (undoable(await remove({ resourceId: existing.id }), 'Resource deleted', async () => { const r = await restore({ resourceId: existing.id }); if (r.ok) navigate(`/admin/content/${existing.id}`); return r; })) navigate('/admin/content'); }}>
              Delete resource
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
