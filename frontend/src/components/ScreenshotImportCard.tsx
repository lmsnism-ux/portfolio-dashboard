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
  source: string;
}

function normalized(value: string): string {
  return value.toLocaleLowerCase('ko-KR').replace(/[^a-z0-9가-힣]/g, '');
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

function extractCandidates(text: string, account: AccountData): CandidateRow[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rows: CandidateRow[] = [];

  account.holdings.filter((holding) => !holding.is_snapshot).forEach((holding) => {
    const nameKey = normalized(holding.name);
    const tickerKey = normalized(holding.ticker ?? '');
    const index = lines.findIndex((line) => {
      const key = normalized(line);
      return (tickerKey.length >= 3 && key.includes(tickerKey)) || (nameKey.length >= 3 && key.includes(nameKey));
    });
    if (index < 0) return;

    const source = lines.slice(index, index + 3).join(' ');
    const values = numbersIn(source, holding.ticker);
    if (!values.length) return;
    const shares = closest(values, holding.shares);
    const avgPrice = closest(values, holding.avg_price, shares ?? undefined);
    rows.push({
      holding,
      selected: true,
      shares: shares == null ? '' : String(shares),
      avgPrice: avgPrice == null ? '' : String(avgPrice),
      source,
    });
  });

  return rows;
}

export default function ScreenshotImportCard({ data }: { data: PortfolioSummary }) {
  const queryClient = useQueryClient();
  const [accountName, setAccountName] = useState(data.accounts[0]?.name ?? '');
  const [previewUrl, setPreviewUrl] = useState('');
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<CandidateRow[]>([]);
  const [saving, setSaving] = useState(false);
  const account = useMemo(
    () => data.accounts.find((item) => item.name === accountName) ?? data.accounts[0],
    [accountName, data.accounts],
  );

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const recognize = async (file: File) => {
    if (!account) return;
    if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) {
      setStatus('10MB 이하의 PNG, JPG 또는 WebP 이미지를 선택해주세요.');
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setRows([]);
    setProgress(0);
    setStatus('이미지에서 글자를 읽는 중이에요. 처음에는 한글 인식 파일을 내려받아 조금 걸릴 수 있어요.');

    let worker: Awaited<ReturnType<(typeof import('tesseract.js'))['createWorker']>> | null = null;
    try {
      const { createWorker } = await import('tesseract.js');
      worker = await createWorker('kor+eng', 1, {
        logger: (message) => {
          if (message.status === 'recognizing text') setProgress(Math.round((message.progress ?? 0) * 100));
        },
      });
      const result = await worker.recognize(file);
      const candidates = extractCandidates(result.data.text, account);
      setRows(candidates);
      setProgress(100);
      setStatus(candidates.length
        ? `${candidates.length}개 종목을 찾았어요. 숫자를 확인한 뒤 반영해주세요.`
        : '일치하는 종목을 찾지 못했어요. 계좌 선택과 캡처의 종목명이 맞는지 확인해주세요.');
    } catch {
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
    const invalid = selected.some((row) => !Number.isFinite(Number(row.shares)) || Number(row.shares) < 0);
    if (invalid) {
      setStatus('보유 수량을 숫자로 확인해주세요.');
      return;
    }

    setSaving(true);
    setStatus('확인한 숫자를 자산에 반영하는 중이에요.');
    try {
      await patchHoldingsBulk(selected.map((row) => {
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
      setStatus('반영하지 못했어요. 위의 ‘편집 권한 연결’을 먼저 눌러주세요.');
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
            캡처 선택
            <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void recognize(file);
              event.target.value = '';
            }} />
          </label>
        </div>

        {previewUrl && <img src={previewUrl} alt="선택한 잔고 캡처 미리보기" className="mt-4 max-h-48 w-full rounded-2xl bg-toss-bg object-contain" />}

        {status && (
          <div className="mt-4 rounded-xl bg-toss-blue-soft px-4 py-3 text-xs leading-relaxed text-toss-text-secondary">
            {progress > 0 && progress < 100 && <LoaderCircle size={14} className="mr-2 inline animate-spin text-toss-blue" />}
            {status}{progress > 0 && progress < 100 ? ` ${progress}%` : ''}
          </div>
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
                  <label className="text-[11px] text-toss-text-tertiary">보유 수량<input inputMode="decimal" value={row.shares} onChange={(event) => updateRow(index, { shares: event.target.value })} className="mt-1 w-full rounded-xl bg-toss-bg px-3 py-2 text-sm text-toss-text-primary outline-none focus:ring-2 focus:ring-toss-blue" /></label>
                  <label className="text-[11px] text-toss-text-tertiary">평균 매수가<input inputMode="decimal" value={row.avgPrice} onChange={(event) => updateRow(index, { avgPrice: event.target.value })} className="mt-1 w-full rounded-xl bg-toss-bg px-3 py-2 text-sm text-toss-text-primary outline-none focus:ring-2 focus:ring-toss-blue" /></label>
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
