// The 9626 papers name every file <name>_<centre number>_<candidate number>, for example
// Gas_ZZ999_9999 (M/J/26), TTTVideo_ZZ999_9999 (F/M/25). With the candidate's details set once
// (File ▸ Candidate Details…), every Save and Export dialog suggests that name.

export interface Candidate {
  /** Two letters and three digits, upper case: KH012. */
  centre: string;
  /** Four digits: 0042. */
  number: string;
  /** For text such as "Video edited by: …" (F/M/25); may be empty. */
  name: string;
}

/** A name ending with any centre and candidate number (the papers' ZZ999_9999 too). */
const SUFFIX = /_[A-Za-z]{2}\d{3}_\d{4}$/;

export function examName(base: string, candidate: Candidate | null): string {
  if (!candidate) return base;
  return `${base.replace(SUFFIX, '')}_${candidate.centre}_${candidate.number}`;
}

const MAX_NAME = 80;

export function checkCandidate(input: {
  centre: string;
  number: string;
  name: string;
}): { candidate: Candidate } | { field: keyof Candidate; error: string } {
  const centre = input.centre.trim().toUpperCase();
  if (!/^[A-Z]{2}\d{3}$/.test(centre))
    return {
      field: 'centre',
      error: 'A centre number is two letters and three digits, for example ZZ999.',
    };
  const typed = input.number.trim();
  if (!/^\d{1,4}$/.test(typed))
    return { field: 'number', error: 'A candidate number has four digits, for example 9999.' };
  const name = input.name.trim();
  if (name.length > MAX_NAME)
    return { field: 'name', error: `Please keep the name to ${MAX_NAME} letters or fewer.` };
  return { candidate: { centre, number: typed.padStart(4, '0'), name } };
}

/** P8, GL2 (M23): the name, centre and candidate number a file's name holds in the papers' form. */
export function candidateInName(
  fileName: string,
): { base: string; centre: string; number: string } | null {
  const stem = fileName.replace(/\.[^.]*$/, '');
  const match = /^(.*)_([A-Za-z]{2}\d{3})_(\d{4})$/.exec(stem);
  return match ? { base: match[1]!, centre: match[2]!, number: match[3]! } : null;
}

/** The numbers the papers print as an example; a candidate puts their own instead. */
const EXAMPLE = 'ZZ999_9999';

/**
 * P8, GL2 (M23): whether a file is named as the papers ask, <name>_<centre>_<candidate>: the name
 * the task gives (`base`, if any; capitals do not matter), and the student's own numbers when
 * File ▸ Candidate Details… holds them. `why` says what is wrong.
 */
export function checkExamName(
  fileName: string,
  candidate: Candidate | null,
  base?: string,
): { pass: boolean; expected: string; actual: string; why?: string } {
  const numbers = candidate ? `${candidate.centre}_${candidate.number}` : '<centre>_<candidate>';
  const expected = `${base || '<name>'}_${numbers}`;
  const actual = fileName.replace(/\.[^.]*$/, '');
  const found = candidateInName(fileName);
  const fail = (why: string) => ({ pass: false, expected, actual, why });
  if (!found) return fail('it does not end with a centre and candidate number');
  if (base && found.base.toLowerCase() !== base.toLowerCase())
    return fail(`it starts with ${found.base}, not ${base}`);
  const theirs = `${found.centre.toUpperCase()}_${found.number}`;
  if (candidate && theirs !== numbers)
    return fail(
      theirs === EXAMPLE
        ? `${EXAMPLE} is the papers' example: put your own centre and candidate number`
        : `${theirs} are not your numbers (${numbers})`,
    );
  return { pass: true, expected, actual };
}
