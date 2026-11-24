/**
 * Florida B.E.S.T. math reference data (read-only, seeded once in production).
 *
 * Grades 3–6: FAST Mathematics reporting categories and the benchmarks in each,
 * from FLDOE "Test Design Summary and Blueprint: FAST Mathematics and B.E.S.T. EOCs"
 * (updated February 5, 2025). Codes listed in parentheses there as "also assesses"
 * are included under the same category.
 *
 * K–2: progress monitoring uses Renaissance Star Math, which has no FAST reporting
 * categories, so K–2 work is grouped by B.E.S.T. strand instead.
 */

export const STRANDS: Strand[] = [
  { code: 'NSO', name: 'Number Sense and Operations', color: 'chart-1' },
  { code: 'FR', name: 'Fractions', color: 'chart-2' },
  { code: 'AR', name: 'Algebraic Reasoning', color: 'chart-3' },
  { code: 'M', name: 'Measurement', color: 'chart-4' },
  { code: 'GR', name: 'Geometric Reasoning', color: 'chart-4' },
  { code: 'DP', name: 'Data Analysis and Probability', color: 'chart-3' },
];

export type Strand = { code: 'NSO' | 'FR' | 'AR' | 'M' | 'GR' | 'DP'; name: string; color: string };
export type ReportingCategory = { id: string; grade: number; short: AreaShort; name: string; percent: string; codes: string[] };
export type Area = { id: string; name: string; fullName: string };
type AreaShort = 'add' | 'mult' | 'frac' | 'whole' | 'alg' | 'geo' | 'nso';

const c = (grade: number, short: AreaShort, name: string, percent: string, codes: string[]): ReportingCategory => ({ id: `rc_${grade}_${short}`, grade, short, name, percent, codes });

export const REPORTING_CATEGORIES: ReportingCategory[] = [
  c(3, 'add', 'Number Sense and Additive Reasoning', '23–29%', ['MA.3.NSO.1.1', 'MA.3.NSO.1.2', 'MA.3.NSO.1.3', 'MA.3.NSO.1.4', 'MA.3.NSO.2.1', 'MA.3.AR.1.2', 'MA.3.AR.3.1', 'MA.3.AR.3.3']),
  c(3, 'mult', 'Number Sense and Multiplicative Reasoning', '23–29%', ['MA.3.NSO.2.2', 'MA.3.NSO.2.3', 'MA.3.NSO.2.4', 'MA.3.AR.1.1', 'MA.3.AR.2.1', 'MA.3.AR.2.2', 'MA.3.AR.2.3', 'MA.3.AR.3.2', 'MA.3.GR.2.1', 'MA.3.GR.2.2']),
  c(3, 'frac', 'Fractional Reasoning', '23–29%', ['MA.3.FR.1.1', 'MA.3.FR.1.2', 'MA.3.FR.1.3', 'MA.3.FR.2.1', 'MA.3.FR.2.2']),
  c(3, 'geo', 'Geometric Reasoning, Measurement, and Data Analysis and Probability', '23–29%', ['MA.3.GR.1.1', 'MA.3.GR.1.2', 'MA.3.GR.1.3', 'MA.3.GR.2.3', 'MA.3.GR.2.4', 'MA.3.M.1.1', 'MA.3.M.1.2', 'MA.3.M.2.1', 'MA.3.M.2.2', 'MA.3.DP.1.1', 'MA.3.DP.1.2']),

  c(4, 'whole', 'Number Sense and Operations with Whole Numbers', '31–37%', ['MA.4.NSO.1.1', 'MA.4.NSO.1.2', 'MA.4.NSO.1.3', 'MA.4.NSO.1.4', 'MA.4.NSO.1.5', 'MA.4.NSO.2.1', 'MA.4.NSO.2.2', 'MA.4.NSO.2.3', 'MA.4.NSO.2.4', 'MA.4.NSO.2.5', 'MA.4.AR.1.1', 'MA.4.AR.2.1', 'MA.4.AR.2.2', 'MA.4.AR.3.1', 'MA.4.AR.3.2']),
  c(4, 'frac', 'Number Sense and Operations with Fractions and Decimals', '31–37%', ['MA.4.NSO.2.6', 'MA.4.NSO.2.7', 'MA.4.FR.1.1', 'MA.4.FR.1.2', 'MA.4.FR.1.3', 'MA.4.FR.1.4', 'MA.4.FR.2.1', 'MA.4.FR.2.2', 'MA.4.FR.2.3', 'MA.4.FR.2.4', 'MA.4.AR.1.2', 'MA.4.AR.1.3', 'MA.4.M.2.2']),
  c(4, 'geo', 'Geometric Reasoning, Measurement, and Data Analysis and Probability', '31–37%', ['MA.4.GR.1.1', 'MA.4.GR.1.2', 'MA.4.GR.1.3', 'MA.4.GR.2.1', 'MA.4.GR.2.2', 'MA.4.M.1.1', 'MA.4.M.1.2', 'MA.4.M.2.1', 'MA.4.DP.1.1', 'MA.4.DP.1.2', 'MA.4.DP.1.3']),

  c(5, 'whole', 'Number Sense and Operations with Whole Numbers', '23–29%', ['MA.5.NSO.1.1', 'MA.5.NSO.1.2', 'MA.5.NSO.1.3', 'MA.5.NSO.1.4', 'MA.5.NSO.1.5', 'MA.5.NSO.2.1', 'MA.5.NSO.2.2']),
  c(5, 'frac', 'Number Sense and Operations with Fractions and Decimals', '23–29%', ['MA.5.NSO.2.3', 'MA.5.NSO.2.4', 'MA.5.NSO.2.5', 'MA.5.FR.1.1', 'MA.5.FR.2.1', 'MA.5.FR.2.2', 'MA.5.FR.2.3', 'MA.5.FR.2.4', 'MA.5.AR.1.2', 'MA.5.AR.1.3', 'MA.5.M.2.1']),
  c(5, 'alg', 'Algebraic Reasoning', '23–29%', ['MA.5.AR.1.1', 'MA.5.AR.2.1', 'MA.5.AR.2.2', 'MA.5.AR.2.3', 'MA.5.AR.2.4', 'MA.5.AR.3.1', 'MA.5.AR.3.2']),
  c(5, 'geo', 'Geometric Reasoning, Measurement, and Data Analysis and Probability', '23–29%', ['MA.5.GR.1.1', 'MA.5.GR.1.2', 'MA.5.GR.2.1', 'MA.5.GR.3.1', 'MA.5.GR.3.2', 'MA.5.GR.3.3', 'MA.5.GR.4.1', 'MA.5.GR.4.2', 'MA.5.DP.1.1', 'MA.5.DP.1.2', 'MA.5.M.1.1']),

  c(6, 'nso', 'Number Sense and Operations', '33–42%', ['MA.6.NSO.1.1', 'MA.6.NSO.1.2', 'MA.6.NSO.1.3', 'MA.6.NSO.1.4', 'MA.6.NSO.2.1', 'MA.6.NSO.2.2', 'MA.6.NSO.2.3', 'MA.6.NSO.3.1', 'MA.6.NSO.3.2', 'MA.6.NSO.3.3', 'MA.6.NSO.3.4', 'MA.6.NSO.3.5', 'MA.6.NSO.4.1', 'MA.6.NSO.4.2']),
  c(6, 'alg', 'Algebraic Reasoning', '25–36%', ['MA.6.AR.1.1', 'MA.6.AR.1.2', 'MA.6.AR.1.3', 'MA.6.AR.1.4', 'MA.6.AR.2.1', 'MA.6.AR.2.2', 'MA.6.AR.2.3', 'MA.6.AR.2.4', 'MA.6.AR.3.1', 'MA.6.AR.3.2', 'MA.6.AR.3.3', 'MA.6.AR.3.4', 'MA.6.AR.3.5']),
  c(6, 'geo', 'Geometric Reasoning, Data Analysis, and Probability', '25–36%', ['MA.6.GR.1.1', 'MA.6.GR.1.2', 'MA.6.GR.1.3', 'MA.6.GR.2.1', 'MA.6.GR.2.2', 'MA.6.GR.2.3', 'MA.6.GR.2.4', 'MA.6.DP.1.1', 'MA.6.DP.1.2', 'MA.6.DP.1.3', 'MA.6.DP.1.4', 'MA.6.DP.1.5', 'MA.6.DP.1.6']),
];

/** Short, plain names parents and Vienne see instead of the long FLDOE titles. */
export const AREA_LABEL: Record<AreaShort, string> = {
  add: 'Adding and place value',
  mult: 'Multiplying and dividing',
  frac: 'Fractions and decimals',
  whole: 'Whole numbers',
  alg: 'Patterns and equations',
  geo: 'Geometry, measurement and data',
  nso: 'Number sense',
};

export const strandOf = (code?: string | null) => code?.split('.')[2] ?? null;
export const gradeOf = (code?: string | null) => {
  const g = code?.split('.')[1];
  return g === 'K' ? 0 : Number(g);
};

export const categoriesFor = (grade: number) => REPORTING_CATEGORIES.filter((x) => x.grade === grade);
export const categoryOf = (code?: string | null) => (code ? REPORTING_CATEGORIES.find((x) => x.codes.includes(code)) ?? null : null);
export const isFastGrade = (grade: number) => grade >= 3 && grade <= 6;

/**
 * The "area" a benchmark (or a skill) counts toward for a student in `grade`:
 * the FAST reporting category in grades 3–6, otherwise the B.E.S.T. strand.
 */
export function areaFor(grade: number, { code, strand }: { code?: string | null; strand?: string | null }): Area {
  if (isFastGrade(grade) && code) {
    const cat = categoryOf(code);
    if (cat && cat.grade === grade) return { id: cat.id, name: AREA_LABEL[cat.short], fullName: cat.name };
  }
  const s = STRANDS.find((x) => x.code === (strand || strandOf(code)));
  return s ? { id: `strand_${s.code}`, name: s.name, fullName: s.name } : { id: 'other', name: 'Other', fullName: 'Other' };
}

/** All grade-level codes Vienne can tag a book question with. */
export const codesForGrade = (grade: number) => categoriesFor(grade).flatMap((x) => x.codes);

/** The area a teaching skill counts toward for a student in `grade`. */
export function skillArea(grade: number, skill?: { benchmarkCodes?: unknown; strand?: string } | null): Area {
  const prefix = `MA.${grade === 0 ? 'K' : grade}.`;
  const code = ((skill?.benchmarkCodes as string[] | undefined) || []).find((x) => x.startsWith(prefix));
  return areaFor(grade, { code, strand: skill?.strand });
}
