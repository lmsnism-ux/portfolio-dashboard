import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ImagePlus, LoaderCircle, ShieldCheck } from 'lucide-react';
import { patchHoldingsBulk } from '../api';
import type { AccountData, HoldingData, PortfolioSummary } from '../types';

interface CandidateRow {
  holding: HoldingData;
  selected: boolean;
  shares: string;
  avgPrice: string;
  snapshotVal: string;
  source: string;
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

// 임계값: 낮을수록 더 많이 매칭(OCR 노이즈 허용), 높을수록 정밀
const MATCH_THRESHOLD = 0.4;
// 매칭 줄 기준 전후 몇 줄에서 숫자를 추출할지
const CONTEXT_BEFORE = 1;
const CONTEXT_AFTER = 4;

function extractCandidates(text: string, account: AccountData): CandidateRow[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const keyedLines = lines.map((line) => normalized(line));
  const rows: CandidateRow[] = [];

  account.holdings.forEach((holding) => {
    const nameKey = normalized(holding.name);
    const tickerKey = normalized(holding.ticker ?? '');

    // OCR 잡음을 견디는 퍼지 매칭: 줄마다 이름/티커 포함도 점수를 매겨 최고점 줄을 고른다.
    let bestIndex = -1;
    let bestScore = 0;
    keyedLines.forEach((key, index) => {
      let score = 0;
      if (tickerKey.length >= 2) score = Math.max(score, containment(tickerKey, key));
      if (nameKey.length >= 2) score = Math.max(score, containment(nameKey, key));
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
    if (!values.length) return;

    if (holding.is_snapshot) {
      // 스냅샷 종목(예수금·수동입력 잔액): 숫자 1개를 총 평가금액으로 추출
      const snapshotVal = closest(values, holding.value_krw);
      rows.push({
        holding,
        selected: true,
        shares: '',
        avgPrice: '',
        snapshotVal: snapshotVal == null ? '' : String(snapshotVal),
        source,
      });
    } else {
      const shares = closest(values, holding.shares);
      const avgPrice = closest(values, holding.avg_price, shares ?? undefined);
      rows.push({
        holding,
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

export default function ScreenshotImportCard({ data }: { data: PortfolioSummary }) {
  const queryClient = useQueryClient();
  const [accountName, setAccountName] = useState(data.accounts[0]?.name ?? '');
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<CandidateRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [rawOcrText, setRawOcrText] = useState('');
  const account = useMemo(
    () => data.accounts.find((item) => item.name === accountName) ?? data.accounts[0],
    [accountName, data.accounts],
  );

  useEffect(() => () => {
    previewUrls.forEach((url) => URL.revokeObjectURL(url));
  }, [previewUrls]);

  const recognizeFiles = async (files: File[]) => {
    if (!account || !files.length) return;
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
    setProgress(0);
    setStatus(valid.length > 1
      ? `이미지 ${valid.length}장에서 글자를 읽는 중이에요. 처음에는 한글 인식 파일을 내려받아 조금 걸릴 수 있어요.`
      : '이미지에서 글자를 읽는 중이에요. 처음에는 한글 인식 파일을 내려받아 조금 걸릴 수 있어요.');

    let worker: Awaited<ReturnType<(typeof import('tesseract.js'))['createWorker']>> | null = null;
    try {
      const { createWorker } = await import('tesseract.js');
      worker = await createWorker('kor+eng', 1, {
        logger: (message) => {
          if (message.status === 'recognizing text') setProgress(Math.round((message.progress ?? 0) * 100));
        },
      });
      // 여러 장을 순차 인식해 후보를 누적·병합(같은 종목은 수량이 채워진 쪽 우선).
      const merged = new Map<string, CandidateRow>();
      const allTexts: string[] = [];
      for (let i = 0; i < valid.length; i += 1) {
        if (valid.length > 1) setStatus(`이미지 ${i + 1}/${valid.length}에서 글자를 읽는 중이에요.`);
        setProgress(0);
        const result = await worker.recognize(valid[i]);
        allTexts.push(result.data.text);
        for (const candidate of extractCandidates(result.data.text, account)) {
          const key = candidate.holding.ticker || candidate.holding.name;
          const existing = merged.get(key);
          if (!existing || (!existing.shares && candidate.shares)) merged.set(key, candidate);
        }
      }
      setRawOcrText(allTexts.join('\n---\n'));
      const candidates = [...merged.values()];
      setRows(candidates);
      setProgress(100);
      setStatus(candidates.length
        ? `${candidates.length}개 종목을 찾았어요. 숫자를 확인한 뒤 반영해주세요.`
        : '일치하는 종목을 찾지 못했어요. 계좌와 캡처의 종목명이 맞는지 아래 인식 텍스트를 확인해주세요.');
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
    if (!account) return;
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
            account_name: account.name,
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
          account_name: account.name,
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
            <p className="mt-1 text-xs leading-relaxed text-toss-text-tertiary">증권사 잔고 화면을 읽어 기존 종목의 수량과 평단 후보를 만들어요.</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="search-field">
            <span className="text-xs font-semibold">계좌</span>
            <select value={accountName} onChange={(event) => { setAccountName(event.target.value); setRows([]); }} className="min-w-0 flex-1 bg-transparent text-sm text-toss-text-primary outline-none">
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
          <details className="mt-3">
            <summary className="cursor-pointer text-[11px] text-toss-text-tertiary select-none">인식된 텍스트 보기 (매칭 안 될 때 확인)</summary>
            <pre className="mt-2 max-h-48 overflow-y-auto rounded-xl bg-toss-bg p-3 text-[10px] leading-relaxed text-toss-text-secondary whitespace-pre-wrap break-all">{rawOcrText}</pre>
          </details>
        )}

        {rows.length > 0 && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-2 text-[11px] text-toss-text-tertiary"><ShieldCheck size={14} />OCR 숫자는 틀릴 수 있어요. 수량과 평단을 반드시 확인해주세요.</div>
            {rows.map((row, index) => (
              <div key={row.holding.ticker || row.holding.name} className="rounded-2xl border border-toss-border p-4">
                <label className="flex items-center gap-2 text-sm font-bold text-toss-text-primary">
                  <input type="checkbox" checked={row.selected} onChange={(event) => updateRow(index, { selected: event.target.checked })} />
                  {row.holding.name}
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
      </div>
    </section>
  );
}
