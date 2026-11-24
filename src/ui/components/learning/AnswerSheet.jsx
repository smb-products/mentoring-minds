import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Check, Clock, Delete, X } from 'lucide-react';
import { OverlayContext } from '../shell/Masthead';
import { api, useAction } from '../../api';
import { shrinkPhoto } from '../../lib/shrinkPhoto';
import { cn } from '../../lib/cn';
import { Button, IconButton } from '../ui/Button';
import { useResultToast } from '../ui/Toast';

const LETTERS_MC = ['A', 'B', 'C', 'D'];
const LETTERS_MULTI = ['A', 'B', 'C', 'D', 'E'];
const PAD = ['7', '8', '9', 'del', '4', '5', '6', '/', '1', '2', '3', '.', '-', '0', ' ', 'clear'];
const PAD_LABEL = { del: 'Delete', '/': 'Fraction bar', '.': 'Decimal point', '-': 'Minus', ' ': 'Space', clear: 'Clear' };

/**
 * The kid's answer sheet. The child works in their own book; this screen only has
 * numbered answer slots (no question text, no answers). Progress saves as they go.
 * Scoring happens on the server (assignments.submitAnswerSheet).
 */
export function AnswerSheet({ submission, onClose }) {
  const show = useResultToast();
  const a = submission.assignment;
  const slots = a.slots;
  const testName = a.book?.tests.find((t) => t.key === a.bookTest)?.name ?? a.title;
  const [index, setIndex] = useState(0);
  const [review, setReview] = useState(false);
  const [answers, setAnswers] = useState(() => Object.fromEntries((submission.draft || []).map((d) => [d.number, d.value])));
  const [photos, setPhotos] = useState({});
  const [result, setResult] = useState(null);
  const [submit, submitting] = useAction(api.assignments.submitAnswerSheet);
  const [saveDraft] = useAction(api.assignments.saveAnswerDraft);
  const [upload, uploading] = useAction(api.content.uploadFile);
  const host = useContext(OverlayContext);
  const headingRef = useRef(null);
  const slot = slots[index];
  const filled = (s) => (s.format === 'OPEN' ? !!photos[s.number] : String(answers[s.number] ?? '').trim() !== '');
  const left = slots.filter((s) => !filled(s));

  // Save the draft a moment after each change, so closing the app loses nothing.
  useEffect(() => {
    if (result) return undefined;
    const t = window.setTimeout(() => saveDraft({ submissionId: submission.id, answers: Object.entries(answers).map(([number, value]) => ({ number: Number(number), value })) }), 600);
    return () => window.clearTimeout(t);
  }, [answers, result, saveDraft, submission.id]);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [index, review, host]);

  const setValue = useCallback((v) => setAnswers((all) => ({ ...all, [slot.number]: v })), [slot]);
  const press = useCallback(
    (key) => {
      const cur = String(answers[slot.number] ?? '');
      if (key === 'del') return setValue(cur.slice(0, -1));
      if (key === 'clear') return setValue('');
      if (cur.length >= 10) return undefined;
      return setValue(cur + key);
    },
    [answers, slot, setValue],
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') return onClose();
      if (review || result || slot.format !== 'NUMERIC') return undefined;
      if (/^[0-9./ -]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('del');
      return undefined;
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, press, review, result, slot]);

  const finish = async () => {
    const data = show(
      await submit({
        submissionId: submission.id,
        answers: slots.filter((s) => s.format !== 'OPEN').map((s) => ({ number: s.number, value: answers[s.number] ?? '' })),
        photos: Object.entries(photos).map(([number, f]) => ({ number: Number(number), fileId: f.id })),
      }),
    );
    if (data) setResult(data);
  };

  if (!host) return null;
  return createPortal(
    <div className="absolute inset-0 z-[60] flex flex-col bg-background" role="dialog" aria-modal="true" aria-label={`${a.title} answer sheet`}>
      <div className="flex shrink-0 items-center gap-3 px-4 py-3 @3xl/app:px-8">
        <IconButton icon={X} label="Close. Your answers are saved." onClick={onClose} />
        <div className="flex min-w-0 flex-1 gap-1" aria-hidden>
          {slots.map((s, i) => (
            <span
              key={s.number}
              className={cn(
                'h-2 min-w-0 flex-1 rounded-full transition-colors',
                result ? (result.answers.find((x) => x.number === s.number)?.correct === true ? 'bg-good' : result.answers.find((x) => x.number === s.number)?.correct === false ? 'bg-critical' : 'bg-warning') : filled(s) ? 'bg-primary' : i === index && !review ? 'bg-brand-soft-foreground/30' : 'bg-muted',
              )}
            />
          ))}
        </div>
        <span className="tabular w-16 text-right text-[14px] font-bold text-muted-foreground">{result ? 'Done' : review ? 'Check' : `${index + 1} of ${slots.length}`}</span>
      </div>

      {result ? (
        <Results result={result} slots={slots} onClose={onClose} />
      ) : review ? (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-2xl px-5 pb-6 pt-6 @3xl/app:pt-10">
              <h2 ref={headingRef} tabIndex={-1} className="font-display text-[28px] font-semibold leading-tight outline-none">{left.length ? `${left.length} still empty` : 'All done! Check your answers'}</h2>
              <p className="mt-1 text-[16px] text-muted-foreground">Tap any number to change it.</p>
              <ol className="mt-6 grid grid-cols-4 gap-2.5 @xl/app:grid-cols-5">
                {slots.map((s, i) => (
                  <li key={s.number}>
                    <button
                      type="button"
                      onClick={() => {
                        setIndex(i);
                        setReview(false);
                      }}
                      className={cn('flex h-[4.5rem] w-full flex-col items-center justify-center rounded-2xl border-2 text-center', filled(s) ? 'border-border bg-card' : 'border-dashed border-warning bg-warning-soft')}
                    >
                      <span className="tabular text-[13px] font-bold text-muted-foreground">#{s.number}</span>
                      <span className="tabular max-w-full truncate px-1 font-display text-[20px] font-semibold">{s.format === 'OPEN' ? (photos[s.number] ? 'Photo' : '—') : answers[s.number] || '—'}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-5 py-3 @3xl/app:px-8">
            <Button size="lg" variant="ghost" onClick={() => setReview(false)}>Back</Button>
            <Button size="lg" variant="reward" className="min-w-40" disabled={submitting || left.length > 0} onClick={finish}>
              {submitting ? 'Checking…' : 'Hand it in'}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-xl flex-col px-5 pb-6 pt-5 @3xl/app:pt-10">
              <p className="text-[15px] font-bold text-muted-foreground">{testName} in your book</p>
              <h2 ref={headingRef} tabIndex={-1} className="mt-1 font-display text-[40px] font-semibold leading-none text-foreground outline-none">Question {slot.number}</h2>
              <p className="mt-2 text-[16px] text-muted-foreground">
                {slot.format === 'MC' && 'Pick one letter.'}
                {slot.format === 'MULTI' && 'Pick every letter that is right.'}
                {slot.format === 'NUMERIC' && 'Type your answer. For a fraction, use the / key.'}
                {slot.format === 'OPEN' && 'Show your work on paper, then take a photo of it.'}
              </p>

              {slot.format === 'MC' && (
                <div className="mt-6 grid grid-cols-2 gap-3" role="radiogroup" aria-label={`Answer for question ${slot.number}`}>
                  {LETTERS_MC.map((l) => (
                    <Letter key={l} letter={l} selected={answers[slot.number] === l} role="radio" onClick={() => setValue(l)} />
                  ))}
                </div>
              )}

              {slot.format === 'MULTI' && (
                <div className="mt-6 grid grid-cols-3 gap-3" role="group" aria-label={`Answers for question ${slot.number}`}>
                  {LETTERS_MULTI.map((l) => {
                    const set = String(answers[slot.number] ?? '').split(',').filter(Boolean);
                    const on = set.includes(l);
                    return <Letter key={l} letter={l} selected={on} role="checkbox" onClick={() => setValue((on ? set.filter((x) => x !== l) : [...set, l]).sort().join(','))} />;
                  })}
                </div>
              )}

              {slot.format === 'NUMERIC' && (
                <div className="mt-6">
                  <output aria-live="polite" aria-label={`Your answer for question ${slot.number}`} className="tabular flex h-20 items-center justify-center rounded-2xl border-2 border-primary bg-card px-4 font-display text-[40px] font-semibold">
                    {answers[slot.number] ? answers[slot.number].replace(/ /g, '  ') : <span className="text-subtle-foreground">?</span>}
                  </output>
                  <div className="mt-4 grid grid-cols-4 gap-2.5">
                    {PAD.map((k) => (
                      <button
                        key={k}
                        type="button"
                        aria-label={PAD_LABEL[k] ?? k}
                        onClick={() => press(k)}
                        className={cn(
                          'grid h-16 place-items-center rounded-2xl border-2 font-display text-[26px] font-semibold transition-transform active:translate-y-[2px]',
                          /\d/.test(k) ? 'border-border bg-card shadow-[0_3px_0_var(--border)]' : 'border-transparent bg-muted text-muted-foreground',
                        )}
                      >
                        {k === 'del' ? <Delete size={26} aria-hidden /> : k === ' ' ? <span className="text-[15px] font-bold">space</span> : k === 'clear' ? <span className="text-[15px] font-bold">clear</span> : k === '-' ? '−' : k}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {slot.format === 'OPEN' && (
                <div className="mt-6">
                  {photos[slot.number] ? (
                    <div className="flex items-center gap-3 rounded-2xl border-2 border-good bg-good-soft/50 p-4">
                      <Check size={24} className="text-good" aria-hidden />
                      <p className="min-w-0 flex-1 truncate text-[16px] font-bold">{photos[slot.number].filename}</p>
                      <Button onClick={() => setPhotos((p) => ({ ...p, [slot.number]: undefined }))}>Retake</Button>
                    </div>
                  ) : (
                    <label className={cn('flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-input bg-card text-center', uploading && 'opacity-60')}>
                      <Camera size={34} className="text-brand" aria-hidden />
                      <span className="text-[18px] font-extrabold">{uploading ? 'Sending…' : 'Take a photo'}</span>
                      <span className="text-[14px] text-muted-foreground">Vienne will check this one herself.</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="sr-only"
                        onChange={async (e) => {
                          const picked = e.target.files?.[0];
                          if (!picked) return;
                          const { file: f } = await shrinkPhoto(picked);
                          const data = show(await upload({ file: f, filename: f.name, mimeType: f.type || 'image/jpeg', sizeBytes: f.size }));
                          if (data) setPhotos((p) => ({ ...p, [slot.number]: data }));
                          e.target.value = '';
                        }}
                      />
                    </label>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-5 py-3 @3xl/app:px-8">
            <Button size="lg" variant="ghost" disabled={index === 0} onClick={() => setIndex(index - 1)}>Back</Button>
            {index === slots.length - 1 ? (
              <Button size="lg" variant="primary" className="min-w-40" onClick={() => setReview(true)}>Check my answers</Button>
            ) : (
              <Button size="lg" variant="primary" className="min-w-40" onClick={() => setIndex(index + 1)}>{filled(slot) ? 'Next' : 'Skip for now'}</Button>
            )}
          </div>
        </>
      )}
    </div>,
    host,
  );
}

function Letter({ letter, selected, onClick, role }) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        'grid h-24 place-items-center rounded-2xl border-2 font-display text-[40px] font-semibold transition-[transform,box-shadow,border-color,background-color] duration-100 active:translate-y-[2px]',
        selected ? 'border-primary bg-brand-soft text-foreground shadow-[0_3px_0_var(--primary)]' : 'border-border bg-card text-foreground shadow-[0_3px_0_var(--border)] hover:border-input/60',
      )}
    >
      {letter}
    </button>
  );
}

function Results({ result, slots, onClose }) {
  const waiting = result.status === 'SUBMITTED';
  const auto = result.answers.filter((x) => x.correct !== null);
  const right = auto.filter((x) => x.correct).length;
  const stars = waiting ? Math.max(1, Math.round((right / Math.max(auto.length, 1)) * 3)) : result.stars;
  const lines = { 3: 'Amazing work!', 2: 'Great job!', 1: 'Nice try! Keep practising.' };
  const missed = result.answers.filter((x) => x.correct === false).map((x) => x.number);
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-5 pb-8 pt-8 text-center @3xl/app:pt-14">
          <div className="flex justify-center gap-3" role="img" aria-label={`${stars} of 3 stars`}>
            {[1, 2, 3].map((n) => (
              <svg key={n} viewBox="0 0 24 24" className={cn('size-16 @3xl/app:size-20', n === 2 && '-mt-4')} aria-hidden>
                <path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9z" fill={n <= stars ? 'var(--reward)' : 'var(--muted)'} stroke={n <= stars ? 'var(--reward-edge)' : 'var(--border)'} strokeWidth="1.2" strokeLinejoin="round" />
              </svg>
            ))}
          </div>
          <h2 tabIndex={-1} ref={(el) => el?.focus({ preventScroll: true })} className="mt-5 font-display text-[34px] font-semibold outline-none">{lines[stars]}</h2>
          <p className="mt-1 text-[18px] font-bold text-muted-foreground">{right} of {auto.length} right</p>
          {waiting && <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-warning-soft px-3 py-1 text-[14.5px] font-bold text-warning-soft-foreground"><Clock size={15} aria-hidden />Vienne will check your written {slots.filter((s) => s.format === 'OPEN').length === 1 ? 'answer' : 'answers'}</p>}
          <ol className="mt-8 grid grid-cols-5 gap-2 @xl/app:grid-cols-8" aria-label="Your answers">
            {result.answers.map((x) => (
              <li key={x.number} className={cn('tabular grid h-12 place-items-center rounded-xl text-[16px] font-extrabold', x.correct === true ? 'bg-good-soft text-good-soft-foreground' : x.correct === false ? 'bg-critical-soft text-critical-soft-foreground' : 'bg-warning-soft text-warning-soft-foreground')}>
                <span>{x.number}<span className="sr-only">{x.correct === true ? ', right' : x.correct === false ? ', try again' : ', Vienne will check'}</span></span>
              </li>
            ))}
          </ol>
          {missed.length > 0 && (
            <p className="mx-auto mt-6 max-w-md text-[16px] leading-relaxed text-muted-foreground">
              {missed.length <= 6 ? (
                <>Try <span className="font-bold text-foreground">#{missed.join(', #')}</span> again in your book.</>
              ) : (
                <>Try the <span className="font-bold text-foreground">red ones</span> again in your book.</>
              )}{' '}
              They’re on your redo list, and Vienne will go over them with you.
            </p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 justify-center border-t border-border px-5 py-3">
        <Button size="lg" variant="primary" onClick={onClose} className="min-w-44">Done</Button>
      </div>
    </>
  );
}
