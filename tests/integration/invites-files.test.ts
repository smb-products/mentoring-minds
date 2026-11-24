/**
 * Invite codes (single use, hashed, guessing locked out) and files (real type
 * checked, downloads permission-checked on every request).
 */
import { describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, localTarget, ok } from './helpers';
import * as invites from '@/server/invites';
import * as content from '@/server/content';
import { GET as download } from '@/app/api/files/[id]/route';
import { PUT as uploadRoute } from '@/app/api/files/upload/[id]/route';

freshDemo();

describe('invite codes', () => {
  it('Vienne makes a code; only its hash is stored; a preview parent redeems it', async () => {
    as('u_admin');
    const { invite, code } = ok(await invites.createInvite({ parentName: 'Tom Hughes', parentEmail: 'tom.hughes@example.com', plannedStudents: [{ firstName: 'Ivy', lastName: 'Hughes', grade: 4 }] }));
    expect(code).toMatch(/^MM-[2-9A-HJ-NP-Z]{4}$/);
    expect(invite.status).toBe('ACTIVE');
    expect(invite.codeHint).toBe(`MM-••${code.slice(-2)}`);
    const row = await db.invite.findUniqueOrThrow({ where: { id: invite.id } });
    expect(row.codeHash).not.toContain(code);

    as('u_tom');
    expect(ok(await invites.redeemInvite({ code: code.toLowerCase() }))).toEqual({ status: 'ACTIVE' });
    const tom = await db.user.findUniqueOrThrow({ where: { id: 'u_tom' }, include: { students: { include: { subjects: true } }, conversation: true } });
    expect(tom.status).toBe('ACTIVE');
    expect(tom.students.map((s) => [s.firstName, s.grade, s.subjects.map((x) => x.subjectId)])).toEqual([['Ivy', 4, ['sub_math']]]);
    expect(tom.conversation).not.toBeNull();
    expect(await db.notification.count({ where: { userId: 'u_admin', type: 'INVITE_REDEEMED' } })).toBeGreaterThan(0);

    // Single use.
    as('u_lena');
    fails(await invites.redeemInvite({ code }), 'INVALID_CODE');
  });

  it('expired, revoked and replaced codes don’t work; Undo restores a revoked one', async () => {
    as('u_lena');
    fails(await invites.redeemInvite({ code: 'MM-6P3T' }), 'INVALID_CODE'); // expired in the demo
    as('u_admin');
    ok(await invites.revokeInvite({ inviteId: 'inv_carmen' }));
    as('u_lena');
    fails(await invites.redeemInvite({ code: 'MM-4D8F' }), 'INVALID_CODE');
    as('u_admin');
    ok(await invites.restoreInvite({ inviteId: 'inv_carmen' }));
    const { code } = ok(await invites.regenerateInvite({ inviteId: 'inv_carmen' }));
    as('u_lena');
    fails(await invites.redeemInvite({ code: 'MM-4D8F' }), 'INVALID_CODE'); // the old code stopped working
    expect(ok(await invites.redeemInvite({ code })).status).toBe('ACTIVE');
    as('u_admin');
    fails(await invites.revokeInvite({ inviteId: 'inv_carmen' }), 'INVALID', /already used/);
  });

  it('10 wrong guesses lock code entry for an hour, even for a right code', async () => {
    const guesser = await db.user.create({ data: { email: 'guesser@example.com', name: 'Guesser', status: 'PREVIEW' } });
    as(guesser.id);
    for (let i = 0; i < 10; i += 1) fails(await invites.redeemInvite({ code: `MM-ZZZ${i}` }), 'INVALID_CODE');
    fails(await invites.redeemInvite({ code: 'MM-9RT2' }), 'LOCKED');
    expect((await db.user.findUniqueOrThrow({ where: { id: guesser.id } })).redeemLockedUntil!.getTime()).toBeGreaterThan(Date.now() + 50 * 60000);
  });

  it('two people redeeming the same code at once: only one gets it', async () => {
    as('u_admin');
    const { code } = ok(await invites.createInvite({ parentName: 'Race', plannedStudents: [{ firstName: 'Kid', grade: 2 }] }));
    const a = await db.user.create({ data: { email: 'race.a@example.com', name: 'A', status: 'PREVIEW' } });
    as(a.id);
    const [r1, r2] = await Promise.all([invites.redeemInvite({ code }), invites.redeemInvite({ code })]);
    expect([r1.ok, r2.ok].filter(Boolean)).toHaveLength(1);
    expect(await db.student.count({ where: { parentId: a.id } })).toBe(1);
  });

  it('Vienne can’t redeem codes, and child names are required', async () => {
    as('u_admin');
    fails(await invites.redeemInvite({ code: 'MM-9RT2' }), 'INVALID', /for families/);
    fails(await invites.createInvite({ parentName: 'X', plannedStudents: [] }), 'INVALID', /at least one child/);
    fails(await invites.createInvite({ parentName: 'X', plannedStudents: [{ firstName: ' ', grade: 2 }] }), 'INVALID', /first name/);
  });
});

const PDF = new TextEncoder().encode('%PDF-1.4\n%%EOF\n');

async function put(fileId: string, url: string, headers: Record<string, string>, body: Uint8Array) {
  return uploadRoute(new Request(new URL(url, 'http://localhost'), { method: 'PUT', headers, body: body as unknown as BodyInit }), { params: Promise.resolve({ id: fileId }) } as never);
}
const get = (fileId: string) => download(new Request(`http://localhost/api/files/${fileId}`), { params: Promise.resolve({ id: fileId }) } as never);

describe('uploads', () => {
  it('a real PDF uploads; a fake one (text renamed .pdf) is refused and removed', async () => {
    as('u_admin');
    const good = ok(await content.createUpload({ filename: 'worksheet.pdf', mimeType: 'application/pdf', sizeBytes: PDF.byteLength }));
    expect((await put(good.file.id, localTarget(good.upload).url, localTarget(good.upload).headers, PDF)).status).toBe(204);
    expect(ok(await content.finishUpload({ fileId: good.file.id })).uploadedAt).toBeTruthy();

    const fakeBytes = new TextEncoder().encode('just some text...');
    const fake = ok(await content.createUpload({ filename: 'fake.pdf', mimeType: 'application/pdf', sizeBytes: fakeBytes.byteLength }));
    await put(fake.file.id, localTarget(fake.upload).url, localTarget(fake.upload).headers, fakeBytes);
    fails(await content.finishUpload({ fileId: fake.file.id }), 'INVALID', /isn’t a real PDF/);
    expect(await db.fileAsset.findUnique({ where: { id: fake.file.id } })).toBeNull();
  });

  it('refuses the wrong type, big files, bodies over the declared size, and bad tokens', async () => {
    as('u_admin');
    fails(await content.createUpload({ filename: 'a.exe', mimeType: 'application/x-msdownload', sizeBytes: 10 }), 'INVALID', /PDF, PNG, JPG or WebP/);
    fails(await content.createUpload({ filename: 'big.pdf', mimeType: 'application/pdf', sizeBytes: 26 * 1024 * 1024 }), 'INVALID', /25 MB/);
    const r = ok(await content.createUpload({ filename: 'w.pdf', mimeType: 'application/pdf', sizeBytes: 4 }));
    expect((await put(r.file.id, localTarget(r.upload).url, localTarget(r.upload).headers, PDF)).status).toBe(413);
    expect((await put(r.file.id, `/api/files/upload/${r.file.id}?t=1.forged`, localTarget(r.upload).headers, PDF)).status).toBe(403);
    expect((await put(r.file.id, localTarget(r.upload).url, { 'Content-Type': 'image/png' }, PDF)).status).toBe(415);
  });

  it('only the uploader can finish an upload', async () => {
    as('u_ana');
    const r = ok(await content.createUpload({ filename: 'w.pdf', mimeType: 'application/pdf', sizeBytes: PDF.byteLength }));
    as('u_daniel');
    fails(await content.finishUpload({ fileId: r.file.id }), 'FORBIDDEN');
  });
});

describe('downloads', () => {
  it('Vienne can open anything; a parent only their child’s work and resources they can see', async () => {
    as('u_admin');
    expect((await get('fa_arjun_work')).status).toBe(200);
    as('u_priya');
    const own = await get('fa_arjun_work');
    expect(own.status).toBe(200);
    expect(own.headers.get('cache-control')).toContain('no-store');
    as('u_ana');
    expect((await get('fa_arjun_work')).status).toBe(403); // another family's child
    expect((await get('fa_fraction_strips')).status).toBe(200); // a published resource for everyone
    expect((await get('does_not_exist')).status).toBe(404);
    as(null);
    expect((await get('fa_fraction_strips')).status).toBe(401);
    const preview = await db.user.create({ data: { email: 'preview@example.com', name: 'Preview', status: 'PREVIEW' } });
    as(preview.id);
    expect((await get('fa_fraction_strips')).status).toBe(403); // preview account
  });

  it('worksheets revalidate with an ETag (304); the permission check still runs first', async () => {
    as('u_ana');
    const first = await get('fa_fraction_strips');
    const etag = first.headers.get('etag');
    expect(etag).toBeTruthy();
    const again = await download(new Request('http://localhost/api/files/fa_fraction_strips', { headers: { 'if-none-match': etag! } }), { params: Promise.resolve({ id: 'fa_fraction_strips' }) } as never);
    expect(again.status).toBe(304);
    as(null);
    const anon = await download(new Request('http://localhost/api/files/fa_fraction_strips', { headers: { 'if-none-match': etag! } }), { params: Promise.resolve({ id: 'fa_fraction_strips' }) } as never);
    expect(anon.status).toBe(401);
  });

  it('a resource shared with selected students opens only for them', async () => {
    as('u_admin');
    const pdf = ok(await content.createUpload({ filename: 'private.pdf', mimeType: 'application/pdf', sizeBytes: PDF.byteLength }));
    await put(pdf.file.id, localTarget(pdf.upload).url, localTarget(pdf.upload).headers, PDF);
    ok(await content.finishUpload({ fileId: pdf.file.id }));
    const res = ok(await content.createResource({ title: 'For Lucia', kind: 'WORKSHEET', fileId: pdf.file.id, status: 'PUBLISHED', visibility: 'SELECTED', studentIds: ['s_lucia'] }));
    expect(res.sharedWith.map((s) => s?.id)).toEqual(['s_lucia']);
    as('u_ana');
    expect((await get(pdf.file.id)).status).toBe(200);
    expect(ok(await content.listResourcesForStudent({ studentId: 's_lucia' })).some((r) => r.id === res.id)).toBe(true);
    expect(ok(await content.listResourcesForStudent({ studentId: 's_mateo' })).some((r) => r.id === res.id)).toBe(false);
    as('u_daniel');
    expect((await get(pdf.file.id)).status).toBe(403);

    // The bin: hidden at once, back with Undo.
    as('u_admin');
    ok(await content.deleteResource({ resourceId: res.id }));
    as('u_ana');
    expect((await get(pdf.file.id)).status).toBe(403);
    as('u_admin');
    ok(await content.restoreResource({ resourceId: res.id }));
    as('u_ana');
    expect((await get(pdf.file.id)).status).toBe(200);
  });

  it('resources validate in plain words', async () => {
    as('u_admin');
    fails(await content.createResource({ title: '', kind: 'LINK', url: 'https://x.org' }), 'INVALID', /title/);
    fails(await content.createResource({ title: 'Video', kind: 'VIDEO', url: 'not a link' }), 'INVALID', /https/);
    fails(await content.createResource({ title: 'Sheet', kind: 'WORKSHEET' }), 'INVALID', /Attach a file/);
    fails(await content.createResource({ title: 'Note', kind: 'NOTE', body: { text: ' ' } }), 'INVALID', /Write the note/);
    const note = ok(await content.createResource({ title: 'Note', kind: 'NOTE', body: { text: 'Bring your book' } }));
    expect(note.status).toBe('DRAFT');
    expect(ok(await content.setPublishStatus({ resourceId: note.id, status: 'PUBLISHED' })).status).toBe('PUBLISHED');
  });
});
