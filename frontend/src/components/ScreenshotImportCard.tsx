import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronRight, ImagePlus, LoaderCircle, Plus, Search, ShieldCheck } from 'lucide-react';
import { createHolding, patchHoldingsBulk, searchTickers } from '../api';
import type { TickerSearchResult } from '../api';
import type { AccountData, HoldingData, PortfolioSummary } from '../types';

interface CandidateRow {
  holding: HoldingData;
  accountName: string;
  selected: boolean;
  shares: string;
  avgPrice: string;
  snapshotVal: string;
  source: string;
}

interface OcrWord {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

interface OcrLine {
  text: string;
  words: OcrWord[];
  top: number;
  height: number;
}

function normalized(value: string): string {
  return value.toLocaleLowerCase('ko-KR').replace(/[^a-z0-9가-힣]/g, '');
}

function bigrams(value: string): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < value.length - 1; i += 1) {
    const gram = value.slice(i, i + 2);
    map.set(gram, (map.get(gram) ?? 0) + 1);
  }
  return map;
}

// needle(종목명/티커)가 haystack(OCR 한 줄)에 얼마나 들어있는지 0~1. 부분 일치·OCR 잡음에 강함.
function containment(needle: string, haystack: string): number {
  if (needle.length < 2) return needle.length > 0 && haystack.includes(needle) ? 1 : 0;
  if (haystack.includes(needle)) return 1;
  const hay = bigrams(haystack);
  const need = bigrams(needle);
  let hit = 0;
  let total = 0;
  for (const [gram, count] of need) {
    total += count;
    hit += Math.min(count, hay.get(gram) ?? 0);
  }
  return total ? hit / total : 0;
}

// 종목명/OCR 줄을 의미 토큰(영문런·숫자런·한글런)으로 분리
function wordTokens(value: string): string[] {
  return value.toLocaleLowerCase('ko-KR').match(/[a-z]+\d*|\d+|[가-힣]+/g) ?? [];
}

// OCR 줄의 핵심 토큰(숫자 제외)이 종목명 토큰에 얼마나 들어있는지 0~1.
// 종목명이 길고("SOL AI반도체TOP2플러스") OCR엔 약어("SOL TOP2")만 잡힐 때 잡아낸다.
// 2개 이상 일치할 때만 신뢰(단일 'SOL' 오탐 방지).
function tokenContainment(nameTokens: string[], lineTokens: string[]): number {
  const sig = lineTokens.filter((t) => t.length >= 2 && !/^\d+$/.test(t));
  if (!sig.length) return 0;
  // 한 글자/한 자리 토큰(예: '적극투자형2'의 '2')은 식별력이 없어 제외 — 깨진 OCR 토큰과의 우연한 일치 방지
  const names = nameTokens.filter((n) => n.length >= 2);
  const hit = sig.filter((t) => names.some((n) => n === t || n.includes(t) || t.includes(n))).length;
  return hit >= 2 ? hit / sig.length : 0;
}

function numbersIn(value: string, ticker: string | null): number[] {
  return (value.match(/[-+]?\d[\d,]*(?:\.\d+)?/g) ?? [])
    .filter((token) => token.replace(/,/g, '') !== ticker)
    .map((token) => Number(token.replace(/,/g, '')))
    .filter((number) => Number.isFinite(number) && number >= 0 && number < 100_000_000_000);
}

function closest(values: number[], target: number | null, excluded?: number): number | null {
  const pool = values.filter((value) => value !== excluded);
  if (!pool.length) return null;
  if (!target || target <= 0) return pool[0];
  return [...pool].sort((a, b) => Math.abs(Math.log((a || 0.0001) / target)) - Math.abs(Math.log((b || 0.0001) / target)))[0];
}

function parseTsv(tsv: string | null | undefined): OcrLine[] {
  if (!tsv) return [];
  const groups = new Map<string, OcrWord[]>();
  tsv.split(/\r?\n/).slice(1).forEach((row) => {
    const columns = row.split('\t');
    if (columns.length < 12 || columns[0] !== '5' || !columns[11]?.trim()) return;
    const key = `${columns[1]}:${columns[2]}:${columns[3]}:${columns[4]}`;
    const words = groups.get(key) ?? [];
    words.push({
      text: columns[11].trim(),
      left: Number(columns[6]),
      top: Number(columns[7]),
      width: Number(columns[8]),
      height: Number(columns[9]),
    });
    groups.set(key, words);
  });
  return [...groups.values()].map((words) => {
    const sorted = words.sort((a, b) => a.left - b.left);
    const top = Math.min(...sorted.map((word) => word.top));
    const bottom = Math.max(...sorted.map((word) => word.top + word.height));
    return { words: sorted, text: sorted.map((word) => word.text).join(' '), top, height: bottom - top };
  });
}

function headerPosition(lines: OcrLine[], patterns: RegExp[]): number | null {
  for (const line of lines) {
    if (patterns.some((pattern) => pattern.test(normalized(line.text)))) {
      const left = Math.min(...line.words.map((word) => word.left));
      const right = Math.max(...line.words.map((word) => word.left + word.width));
      return (left + right) / 2;
    }
    for (const word of line.words) {
      const key = normalized(word.text);
      if (patterns.some((pattern) => pattern.test(key))) return word.left + word.width / 2;
    }
  }
  return null;
}

function numberWords(line: OcrLine, ticker: string | null): Array<{ value: number; x: number }> {
  const result: Array<{ value: number; x: number }> = [];
  line.words.forEach((word) => {
    const values = numbersIn(word.text, ticker);
    values.forEach((value) => result.push({ value, x: word.left + word.width / 2 }));
  });
  return result;
}

function numberWordsOnVisualRow(lines: OcrLine[], lineIndex: number, ticker: string | null): Array<{ value: number; x: number }> {
  const target = lines[lineIndex];
  if (!target) return [];
  const centerY = target.top + target.height / 2;
  const tolerance = Math.max(24, target.height * 1.25);
  return lines.flatMap((line) => {
    const lineCenter = line.top + line.height / 2;
    return Math.abs(lineCenter - centerY) <= tolerance ? numberWords(line, ticker) : [];
  });
}

function nearestColumn(values: Array<{ value: number; x: number }>, x: number | null): number | null {
  if (x == null || !values.length) return null;
  return [...values].sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0].value;
}

async function preprocessImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(2.5, Math.max(1, 2200 / bitmap.width));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    return file;
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  let luminance = 0;
  for (let index = 0; index < image.data.length; index += 4) {
    luminance += image.data[index] * 0.299 + image.data[index + 1] * 0.587 + image.data[index + 2] * 0.114;
  }
  const invert = luminance / (image.data.length / 4) < 125;
  for (let index = 0; index < image.data.length; index += 4) {
    let gray = image.data[index] * 0.299 + image.data[index + 1] * 0.587 + image.data[index + 2] * 0.114;
    if (invert) gray = 255 - gray;
    gray = Math.max(0, Math.min(255, (gray - 128) * 1.45 + 128));
    image.data[index] = gray;
    image.data[index + 1] = gray;
    image.data[index + 2] = gray;
    image.data[index + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob ?? file), 'image/png'));
}

// 임계값: 낮을수록 더 많이 매칭(OCR 노이즈 허용), 높을수록 정밀
// 전체 계좌를 대조하므로 우연한 노이즈 매칭을 막기 위해 임계값을 높게 둔다.
// 정상 매칭(전체 이름·티커·약어 토큰)은 0.67~1.0 이라 충분히 통과한다.
const MATCH_THRESHOLD = 0.62;
// 매칭 줄 기준 전후 몇 줄에서 숫자를 추출할지
const CONTEXT_BEFORE = 1;
const CONTEXT_AFTER = 4;

// 단일 종목 상세 화면에서 라벨에 딸린 값을 뽑는다.
//  - 가로형: "보유 수량   1,470주" (라벨·값 같은 행)
//  - 세로형: "1주 평균금액" 줄 아래 "27,878원" (라벨 위, 값 아래)
// min: 이 값보다 작은 숫자는 라벨 부속('1주'의 1 등)으로 보고 무시한다.
// 잔고 "목록"의 컬럼 헤더는 같은 행/다음 줄에 자기 값이 없어 null → 기존 컬럼 로직을 방해하지 않는다.
function labeledValue(
  lines: string[],
  positionedLines: OcrLine[],
  patterns: RegExp[],
  ticker: string | null,
  min: number,
): number | null {
  for (let i = 0; i < lines.length; i += 1) {
    if (!patterns.some((pattern) => pattern.test(normalized(lines[i])))) continue;
    // 1) 같은 (시각적) 행
    const sameRow = (positionedLines[i]
      ? numberWordsOnVisualRow(positionedLines, i, ticker).map((entry) => entry.value)
      : numbersIn(lines[i], ticker)
    ).filter((value) => value >= min);
    if (sameRow.length) return Math.max(...sameRow);
    // 2) 세로형: 바로 아래 1~2줄
    for (let j = i + 1; j <= Math.min(lines.length - 1, i + 2); j += 1) {
      const below = numbersIn(lines[j], ticker).filter((value) => value >= min);
      if (below.length) return Math.max(...below);
    }
  }
  return null;
}

function extractCandidates(text: string, account: AccountData, tsv?: string | null): CandidateRow[] {
  const positionedLines = parseTsv(tsv);
  const lines = positionedLines.length
    ? positionedLines.map((line) => line.text)
    : text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const keyedLines = lines.map((line) => normalized(line));
  const tokenizedLines = lines.map((line) => wordTokens(line));
  const rows: CandidateRow[] = [];
  const sharesX = headerPosition(positionedLines, [/보유수량/, /잔고수량/, /^수량$/]);
  const avgPriceX = headerPosition(positionedLines, [/평균단가/, /매입단가/, /평단/, /^단가$/]);
  const snapshotX = headerPosition(positionedLines, [/평가금액/, /평가액/, /잔액/]);

  account.holdings.forEach((holding) => {
    const nameKey = normalized(holding.name);
    const tickerKey = normalized(holding.ticker ?? '');
    const nameTokens = wordTokens(holding.name);

    // OCR 잡음을 견디는 퍼지 매칭: 줄마다 이름/티커 포함도 점수를 매겨 최고점 줄을 고른다.
    let bestIndex = -1;
    let bestScore = 0;
    keyedLines.forEach((key, index) => {
      let score = 0;
      if (tickerKey.length >= 2) score = Math.max(score, containment(tickerKey, key));
      if (nameKey.length >= 2) score = Math.max(score, containment(nameKey, key));
      // 약어 대응: OCR 줄의 토큰이 종목명에 들어있는 비율(역방향)도 본다.
      score = Math.max(score, tokenContainment(nameTokens, tokenizedLines[index]));
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    if (bestIndex < 0 || bestScore < MATCH_THRESHOLD) return;

    // 매칭 줄 전후 컨텍스트를 넓게 스캔해 숫자를 추출한다.
    const from = Math.max(0, bestIndex - CONTEXT_BEFORE);
    const to = Math.min(lines.length, bestIndex + CONTEXT_AFTER + 1);
    const source = lines.slice(from, to).join(' ');
    const values = numbersIn(source, holding.ticker);
    const rowNumbers = positionedLines[bestIndex]
      ? numberWordsOnVisualRow(positionedLines, bestIndex, holding.ticker)
      : [];

    if (holding.is_snapshot) {
      // 스냅샷 종목(예수금·수동입력 잔액): 숫자 1개를 총 평가금액으로 추출
      const snapshotVal = nearestColumn(rowNumbers, snapshotX)
        ?? labeledValue(lines, positionedLines, [/평가금액/, /평가액/, /총금액/, /잔액/], holding.ticker, 100)
        ?? closest(values, holding.value_krw);
      rows.push({
        holding,
        accountName: account.name,
        selected: true,
        shares: '',
        avgPrice: '',
        snapshotVal: snapshotVal == null ? '' : String(snapshotVal),
        source,
      });
    } else {
      // 평단가: 컬럼 → 라벨-값(세로형 포함) → 기존값 근사
      const avgPrice = nearestColumn(rowNumbers, avgPriceX)
        ?? labeledValue(lines, positionedLines, [/평균금액/, /평균단가/, /매입단가/, /평단/, /^평균/], holding.ticker, 10)
        ?? closest(values, holding.avg_price);
      // 보유수량: 컬럼 → 라벨-값
      let shares = nearestColumn(rowNumbers, sharesX)
        ?? labeledValue(lines, positionedLines, [/보유수량/, /잔고수량/, /^수량/], holding.ticker, 1);
      // "보유 수량" 라벨이 OCR로 깨져도, 투자원금 ÷ 평균단가 로 수량을 역산한다.
      if (shares == null && avgPrice != null && avgPrice > 0) {
        const principal = labeledValue(lines, positionedLines, [/투자원금/, /매입금액/, /매수금액/, /투자금액/], holding.ticker, 100);
        if (principal != null) {
          const derived = principal / avgPrice;
          if (derived > 0 && derived < 100_000_000) {
            shares = derived >= 1 ? Math.round(derived) : Math.round(derived * 1e6) / 1e6;
          }
        }
      }
      if (shares == null) shares = closest(values, holding.shares);
      rows.push({
        holding,
        accountName: account.name,
        selected: true,
        shares: shares == null ? '' : String(shares),
        avgPrice: avgPrice == null ? '' : String(avgPrice),
        snapshotVal: '',
        source,
      });
    }
  });

  return rows;
}

// 종목을 모르는 상태에서도 이미지의 수량·평단을 추출한다(신규 종목 추가용).
function extractGeneric(text: string, tsv?: string | null): { shares: number | null; avgPrice: number | null } {
  const positionedLines = parseTsv(tsv);
  const lines = positionedLines.length
    ? positionedLines.map((line) => line.text)
    : text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const avgPrice = labeledValue(lines, positionedLines, [/평균금액/, /평균단가/, /매입단가/, /평단/, /^평균/], null, 10);
  let shares = labeledValue(lines, positionedLines, [/보유수량/, /잔고수량/, /^수량/], null, 1);
  if (shares == null && avgPrice != null && avgPrice > 0) {
    const principal = labeledValue(lines, positionedLines, [/투자원금/, /매입금액/, /매수금액/, /투자금액/], null, 100);
    if (principal != null) {
      const derived = principal / avgPrice;
      if (derived > 0 && derived < 100_000_000) {
        shares = derived >= 1 ? Math.round(derived) : Math.round(derived * 1e6) / 1e6;
      }
    }
  }
  return { shares, avgPrice };
}

export default function ScreenshotImportCard({ data }: { data: PortfolioSummary }) {
  const queryClient = useQueryClient();
  // '' = 전체 계좌에서 찾기 (기본). 특정 계좌명이면 그 계좌만 대조.
  const [accountName, setAccountName] = useState('');
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<CandidateRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [rawOcrText, setRawOcrText] = useState('');
  const targets = useMemo(
    () => (accountName ? data.accounts.filter((item) => item.name === accountName) : data.accounts),
    [accountName, data.accounts],
  );

  // ── 신규 종목 추가용 상태 (계좌에 없는 종목을 이미지로 새로 등록) ──
  const [newReady, setNewReady] = useState(false);       // OCR에서 숫자를 뽑아 새 종목 폼을 띄울 준비됨
  const [newName, setNewName] = useState('');
  const [newTicker, setNewTicker] = useState('');
  const [newAccount, setNewAccount] = useState(data.accounts[0]?.name ?? '');
  const [newShares, setNewShares] = useState('');
  const [newAvg, setNewAvg] = useState('');
  const [newSearchQ, setNewSearchQ] = useState('');
  const [newResults, setNewResults] = useState<TickerSearchResult[]>([]);
  const [newSearching, setNewSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 종목 검색(디바운스) — 깨진 OCR 이름을 정식명+티커로 바꾸기 위함
  useEffect(() => {
    const q = newSearchQ.trim();
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      if (q.length < 1) { setNewResults([]); return; }
      setNewSearching(true);
      const items = await searchTickers(q);
      setNewResults(items);
      setNewSearching(false);
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [newSearchQ]);

  const pickSearchResult = (r: TickerSearchResult) => {
    setNewName(r.name);
    setNewTicker(r.ticker);
    setNewResults([]);
    setNewSearchQ('');
  };

  const addNewHolding = async () => {
    if (!newName.trim() || !newAccount) return;
    const sharesN = parseFloat(newShares);
    const avgN = parseFloat(newAvg);
    const isUsd = data.accounts.find((a) => a.name === newAccount)?.currency === 'USD';
    setAdding(true);
    try {
      await createHolding({
        account_name: newAccount,
        name: newName.trim(),
        ticker: newTicker.trim() || null,
        shares: Number.isFinite(sharesN) ? sharesN : null,
        avg_price_krw: !isUsd && Number.isFinite(avgN) ? avgN : undefined,
        avg_price_usd: isUsd && Number.isFinite(avgN) ? avgN : undefined,
      });
      await queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      setStatus(`'${newName.trim()}'을(를) ${newAccount}에 새로 추가했어요.`);
      setNewReady(false);
      setNewName(''); setNewTicker(''); setNewShares(''); setNewAvg('');
    } catch (err) {
      setStatus(`새 종목 추가 실패: ${(err as Error).message}`);
    } finally {
      setAdding(false);
    }
  };

  useEffect(() => () => {
    previewUrls.forEach((url) => URL.revokeObjectURL(url));
  }, [previewUrls]);

  const recognizeFiles = async (files: File[]) => {
    if (!targets.length || !files.length) return;
    const valid = files.filter((file) => file.type.startsWith('image/') && file.size <= 10 * 1024 * 1024);
    if (!valid.length) {
      setStatus('10MB 이하의 PNG, JPG 또는 WebP 이미지를 선택해주세요.');
      return;
    }
    setPreviewUrls((current) => {
      current.forEach((url) => URL.revokeObjectURL(url));
      return valid.map((file) => URL.createObjectURL(file));
    });
    setRows([]);
    setRawOcrText('');
    setNewReady(false);
    setProgress(0);
    setStatus(valid.length > 1
      ? `이미지 ${valid.length}장에서 글자를 읽는 중이에요. 처음에는 한글 인식 파일을 내려받아 조금 걸릴 수 있어요.`
      : '이미지에서 글자를 읽는 중이에요. 처음에는 한글 인식 파일을 내려받아 조금 걸릴 수 있어요.');

    let worker: Awaited<ReturnType<(typeof import('tesseract.js'))['createWorker']>> | null = null;
    try {
      const { createWorker, PSM } = await import('tesseract.js');
      worker = await createWorker('kor+eng', 1, {
        logger: (message) => {
          if (message.status === 'recognizing text') setProgress(Math.round((message.progress ?? 0) * 100));
        },
      });
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: '1' });
      // 여러 장을 순차 인식해 후보를 누적·병합(같은 종목은 수량이 채워진 쪽 우선).
      const merged = new Map<string, CandidateRow>();
      const allTexts: string[] = [];
      const generic = { shares: null as number | null, avgPrice: null as number | null };
      for (let i = 0; i < valid.length; i += 1) {
        if (valid.length > 1) setStatus(`이미지 ${i + 1}/${valid.length}에서 글자를 읽는 중이에요.`);
        setProgress(0);
        const scan = (txt: string, tsvData?: string | null) =>
          targets.flatMap((acc) => extractCandidates(txt, acc, tsvData));
        const processed = await preprocessImage(valid[i]);
        let result = await worker.recognize(processed, {}, { text: true, tsv: true });
        let candidates = scan(result.data.text, result.data.tsv);
        // 전처리 이미지에서 종목을 못 찾으면 원본도 다시 읽는다.
        if (!candidates.length) {
          const original = await worker.recognize(valid[i], {}, { text: true, tsv: true });
          result = original;
          candidates = scan(original.data.text, original.data.tsv);
        }
        allTexts.push(result.data.text);
        // 신규 종목 추가용: 종목과 무관하게 수량·평단을 한 번 뽑아 둔다(가장 정보 많은 이미지 기준).
        const g = extractGeneric(result.data.text, result.data.tsv);
        if (g.avgPrice != null && generic.avgPrice == null) generic.avgPrice = g.avgPrice;
        if (g.shares != null && generic.shares == null) generic.shares = g.shares;
        for (const candidate of candidates) {
          const key = `${candidate.accountName}|${candidate.holding.ticker || candidate.holding.name}`;
          const existing = merged.get(key);
          if (!existing || (!existing.shares && candidate.shares)) merged.set(key, candidate);
        }
      }
      setRawOcrText(allTexts.join('\n---\n'));
      const candidates = [...merged.values()];
      setRows(candidates);
      setProgress(100);
      // 이미지에서 수량/평단이 잡히면 '새 종목으로 추가' 폼을 준비한다.
      if (generic.shares != null || generic.avgPrice != null) {
        setNewShares(generic.shares != null ? String(generic.shares) : '');
        setNewAvg(generic.avgPrice != null ? String(generic.avgPrice) : '');
        setNewReady(true);
      }
      setStatus(candidates.length
        ? `${candidates.length}개 종목을 찾았어요. 숫자를 확인한 뒤 반영해주세요.`
        : '계좌에 이미 있는 종목은 못 찾았어요. 아래에서 새 종목으로 추가하거나 인식된 텍스트를 확인해주세요.');
    } catch (err) {
      setRawOcrText(String(err));
      setStatus('이미지를 읽지 못했어요. 인터넷 연결과 이미지 선명도를 확인해주세요.');
    } finally {
      await worker?.terminate();
    }
  };

  const updateRow = (index: number, patch: Partial<CandidateRow>) => {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  };

  const apply = async () => {
    const selected = rows.filter((row) => row.selected);
    if (!selected.length) {
      setStatus('반영할 종목을 하나 이상 선택해주세요.');
      return;
    }
    const invalid = selected.some((row) => {
      if (row.holding.is_snapshot) return !Number.isFinite(Number(row.snapshotVal)) || Number(row.snapshotVal) < 0;
      return !Number.isFinite(Number(row.shares)) || Number(row.shares) < 0;
    });
    if (invalid) {
      setStatus('수량 또는 잔액을 숫자로 확인해주세요.');
      return;
    }

    setSaving(true);
    setStatus('확인한 숫자를 자산에 반영하는 중이에요.');
    try {
      await patchHoldingsBulk(selected.map((row) => {
        if (row.holding.is_snapshot) {
          const val = Number(row.snapshotVal);
          return {
            account_name: row.accountName,
            holding_key: row.holding.ticker || row.holding.name,
            ...(Number.isFinite(val) && val >= 0
              ? row.holding.currency === 'USD'
                ? { snapshot_value_usd: val }
                : { snapshot_value_krw: val }
              : {}),
          };
        }
        const avgPrice = Number(row.avgPrice);
        return {
          account_name: row.accountName,
          holding_key: row.holding.ticker || row.holding.name,
          shares: Number(row.shares),
          ...(Number.isFinite(avgPrice) && avgPrice > 0
            ? row.holding.currency === 'USD'
              ? { avg_price_usd: avgPrice }
              : { avg_price_krw: avgPrice }
            : {}),
        };
      }));
      await queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      setStatus(`${selected.length}개 종목을 반영했어요.`);
      setRows([]);
    } catch {
      setStatus('반영하지 못했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="surface-card overflow-hidden" aria-labelledby="screenshot-import-title">
      <div className="p-5">
        <div className="flex items-start gap-3">
          <span className="icon-well"><ImagePlus size={19} /></span>
          <div>
            <h2 id="screenshot-import-title" className="text-base font-bold text-toss-text-primary">캡처로 자산 입력</h2>
            <p className="mt-1 text-xs leading-relaxed text-toss-text-tertiary">증권사 잔고 목록이나 종목 상세 화면을 읽어 수량·평단 후보를 만들어요. 모든 계좌에서 자동으로 찾아줘요.</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="search-field">
            <span className="text-xs font-semibold">계좌</span>
            <select value={accountName} onChange={(event) => { setAccountName(event.target.value); setRows([]); }} className="min-w-0 flex-1 bg-transparent text-sm text-toss-text-primary outline-none">
              <option value="">전체 계좌에서 찾기</option>
              {data.accounts.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
            </select>
          </label>
          <label className="secondary-button flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold">
            <ImagePlus size={17} />
            캡처 선택 (여러 장)
            <input type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" onChange={(event) => {
              const files = event.target.files ? Array.from(event.target.files) : [];
              if (files.length) void recognizeFiles(files);
              event.target.value = '';
            }} />
          </label>
        </div>

        {previewUrls.length > 0 && (
          <div className="mt-4 flex gap-2 overflow-x-auto scrollbar-none">
            {previewUrls.map((url, index) => (
              <img key={url} src={url} alt={`선택한 잔고 캡처 ${index + 1}`} className="h-40 w-auto shrink-0 rounded-2xl bg-toss-bg object-contain" />
            ))}
          </div>
        )}

        {status && (
          <div className="mt-4 rounded-xl bg-toss-blue-soft px-4 py-3 text-xs leading-relaxed text-toss-text-secondary">
            {progress > 0 && progress < 100 && <LoaderCircle size={14} className="mr-2 inline animate-spin text-toss-blue" />}
            {status}{progress > 0 && progress < 100 ? ` ${progress}%` : ''}
          </div>
        )}

        {rawOcrText && progress === 100 && (
          <details className="mt-3" open={rows.length === 0}>
            <summary className="cursor-pointer text-[11px] text-toss-text-tertiary select-none">인식된 텍스트 보기 (매칭 안 되면 이 내용을 확인·공유하세요)</summary>
            <pre className="mt-2 max-h-48 overflow-y-auto rounded-xl bg-toss-bg p-3 text-[10px] leading-relaxed text-toss-text-secondary whitespace-pre-wrap break-all">{rawOcrText}</pre>
          </details>
        )}

        {rows.length > 0 && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-2 text-[11px] text-toss-text-tertiary"><ShieldCheck size={14} />OCR 숫자는 틀릴 수 있어요. 수량과 평단을 반드시 확인해주세요.</div>
            {rows.map((row, index) => (
              <div key={`${row.accountName}|${row.holding.ticker || row.holding.name}`} className="rounded-2xl border border-toss-border p-4">
                <label className="flex items-center gap-2 text-sm font-bold text-toss-text-primary">
                  <input type="checkbox" checked={row.selected} onChange={(event) => updateRow(index, { selected: event.target.checked })} />
                  <span className="min-w-0">
                    <span className="block truncate">{row.holding.name}</span>
                    <span className="block text-[11px] font-medium text-toss-text-tertiary">{row.accountName}</span>
                  </span>
                </label>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {row.holding.is_snapshot ? (
                    <label className="col-span-2 text-[11px] text-toss-text-tertiary">
                      잔액 ({row.holding.currency === 'USD' ? 'USD' : 'KRW'})
                      <input inputMode="decimal" value={row.snapshotVal} onChange={(event) => updateRow(index, { snapshotVal: event.target.value })} className="mt-1 w-full rounded-xl bg-toss-bg px-3 py-2 text-sm text-toss-text-primary outline-none focus:ring-2 focus:ring-toss-blue" />
                    </label>
                  ) : (
                    <>
                      <label className="text-[11px] text-toss-text-tertiary">보유 수량<input inputMode="decimal" value={row.shares} onChange={(event) => updateRow(index, { shares: event.target.value })} className="mt-1 w-full rounded-xl bg-toss-bg px-3 py-2 text-sm text-toss-text-primary outline-none focus:ring-2 focus:ring-toss-blue" /></label>
                      <label className="text-[11px] text-toss-text-tertiary">평균 매수가<input inputMode="decimal" value={row.avgPrice} onChange={(event) => updateRow(index, { avgPrice: event.target.value })} className="mt-1 w-full rounded-xl bg-toss-bg px-3 py-2 text-sm text-toss-text-primary outline-none focus:ring-2 focus:ring-toss-blue" /></label>
                    </>
                  )}
                </div>
                <p className="mt-2 truncate text-[10px] text-toss-text-tertiary" title={row.source}>인식한 행: {row.source}</p>
              </div>
            ))}
            <button type="button" onClick={() => void apply()} disabled={saving} className="primary-button flex min-h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold disabled:opacity-50">
              <Check size={17} />확인한 숫자 반영
            </button>
          </div>
        )}

        {/* ── 새 종목으로 추가 (계좌에 없는 종목) ── */}
        {newReady && (
          <div className="mt-4 rounded-2xl border border-dashed border-toss-blue/40 bg-toss-blue-soft/40 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-toss-text-primary">
              <Plus size={16} className="text-toss-blue" />새 종목으로 추가
            </div>
            <p className="text-[11px] leading-relaxed text-toss-text-tertiary">
              계좌에 없는 종목이면 여기서 새로 추가하세요. 수량·평단은 이미지에서 채웠어요.
              한글 이름은 깨질 수 있으니 <b>검색으로 정확한 종목</b>을 골라주세요(가격 자동조회됨).
            </p>

            {/* 종목 검색 */}
            <div>
              <label className="search-field">
                <Search size={15} className="shrink-0" />
                <input
                  value={newSearchQ}
                  onChange={(e) => setNewSearchQ(e.target.value)}
                  placeholder="종목명·티커 검색 (예: SOL TOP2, QQQ)"
                  className="min-w-0 flex-1 bg-transparent text-sm text-toss-text-primary outline-none"
                />
                {newSearching && <LoaderCircle size={15} className="shrink-0 animate-spin text-toss-blue" />}
              </label>
              {newResults.length > 0 && (
                <div className="mt-2 rounded-xl border border-toss-border overflow-hidden divide-y divide-toss-border/60">
                  {newResults.map((r) => (
                    <button key={r.symbol} type="button" onClick={() => pickSearchResult(r)} className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-toss-bg">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-black ${r.market === 'KR' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400'}`}>{r.market}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-toss-text-primary">{r.name}</span>
                        <span className="block text-[10px] text-toss-text-tertiary">{r.ticker} · {r.type === 'ETF' ? 'ETF' : '주식'}</span>
                      </span>
                      <ChevronRight size={14} className="text-toss-text-tertiary shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 종목명 / 티커 */}
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-toss-text-tertiary">종목 이름
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="검색 후 자동 입력" className="mt-1 w-full rounded-xl bg-toss-bg px-3 py-2 text-sm text-toss-text-primary outline-none focus:ring-2 focus:ring-toss-blue" />
              </label>
              <label className="text-[11px] text-toss-text-tertiary">티커
                <input value={newTicker} onChange={(e) => setNewTicker(e.target.value)} placeholder="예: 0167A0" className="num mt-1 w-full rounded-xl bg-toss-bg px-3 py-2 text-sm text-toss-text-primary outline-none focus:ring-2 focus:ring-toss-blue uppercase" />
              </label>
            </div>

            {/* 계좌 / 수량 / 평단 */}
            <div className="grid grid-cols-3 gap-2">
              <label className="text-[11px] text-toss-text-tertiary">계좌
                <select value={newAccount} onChange={(e) => setNewAccount(e.target.value)} className="mt-1 w-full rounded-xl bg-toss-bg px-2 py-2 text-sm text-toss-text-primary outline-none focus:ring-2 focus:ring-toss-blue">
                  {data.accounts.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
                </select>
              </label>
              <label className="text-[11px] text-toss-text-tertiary">보유 수량
                <input inputMode="decimal" value={newShares} onChange={(e) => setNewShares(e.target.value)} className="num mt-1 w-full rounded-xl bg-toss-bg px-3 py-2 text-sm text-toss-text-primary outline-none focus:ring-2 focus:ring-toss-blue" />
              </label>
              <label className="text-[11px] text-toss-text-tertiary">평균 매수가
                <input inputMode="decimal" value={newAvg} onChange={(e) => setNewAvg(e.target.value)} className="num mt-1 w-full rounded-xl bg-toss-bg px-3 py-2 text-sm text-toss-text-primary outline-none focus:ring-2 focus:ring-toss-blue" />
              </label>
            </div>

            <button type="button" onClick={() => void addNewHolding()} disabled={adding || !newName.trim() || !newAccount} className="primary-button flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold disabled:opacity-50">
              <Plus size={16} />{adding ? '추가 중...' : `${newAccount || '계좌'}에 새 종목 추가`}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
