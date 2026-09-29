import React, { useState } from 'react';
import dtStyles from '../styles/DataTable.module.css';
import gwStyles from '../styles/GatewayTable.module.css';
import { cx } from '../utils/cx';

// Merge both module style objects so we can reference all classes via `s`
const s = { ...dtStyles, ...gwStyles };

interface GatewayMatchedRecord {
  'Match Method': string;
  'Name Match': string;
  'Amount Match': string;
  'Book Party': string;
  'Book Amt (Rs)': number;
  'Bank Party': string;
  'Bank Amt (Rs)': number;
  'Difference (Rs)': number;
  'Flags': string;
  'Gateway': string;
  'UTR': string;
  'Gross': number;
  'Fees': number;
  'Tax': number;
  'Credit Type': string;
}

interface GatewayMatchedTableProps {
  data: GatewayMatchedRecord[];
}

const GatewayMatchedTable: React.FC<GatewayMatchedTableProps> = ({ data }) => {
  const [filter, setFilter] = useState<string>('all');
  const [page, setPage]     = useState(0);
  const PER_PAGE = 25;

  if (!data || data.length === 0) {
    return (
      <div className={s['table-empty']}>
        <p>No gateway matched records found</p>
        <p className={s['subtitle']}>Matched gateway UTR entries will appear here after reconciliation</p>
      </div>
    );
  }

  const GW_COLORS: Record<string, string> = {
    'PayU Regular':   '#dbeafe',
    'PayU-Regular':   '#dbeafe',
    'PayU On-Demand': '#d0e4f2',
    'PayU-OnDemand':  '#d0e4f2',
    'CashFree':       '#d1fae5',
    'EaseBuzz':       '#ead1dc',
  };

  const gateways = Array.from(new Set(data.map(r => r['Gateway'] || r['Match Method'])));
  const counts: Record<string, number> = {
    all:      data.length,
    match:    data.filter(r => r['Name Match'] === 'Match').length,
    mismatch: data.filter(r => r['Name Match'] !== 'Match').length,
    ...Object.fromEntries(gateways.map(g => [g, data.filter(r => (r['Gateway'] || r['Match Method']) === g).length])),
  };

  const filtered = data.filter(r => {
    if (filter === 'all')      return true;
    if (filter === 'match')    return r['Name Match'] === 'Match';
    if (filter === 'mismatch') return r['Name Match'] !== 'Match';
    return (r['Gateway'] || r['Match Method']) === filter;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const slice      = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  const fmtAmt = (v: number) =>
    Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleFilter = (f: string) => { setFilter(f); setPage(0); };

  // Group totals for header
  const gwTotals = gateways.map(g => ({
    name:  g,
    count: data.filter(r => (r['Gateway'] || r['Match Method']) === g).length,
    net:   data.filter(r => (r['Gateway'] || r['Match Method']) === g)
               .reduce((sum, r) => sum + (r['Book Amt (Rs)'] || 0), 0),
    bank:  data.filter(r => (r['Gateway'] || r['Match Method']) === g)
               .reduce((sum, r) => sum + (r['Bank Amt (Rs)'] || 0), 0),
  }));

  return (
    <div className={s['table-container']}>
      {/* Gateway totals strip */}
      <div className={s['gw-totals-strip']}>
        {gwTotals.map(gw => (
          <div
            key={gw.name}
            className={s['gw-total-card']}
            style={{ borderLeftColor: GW_COLORS[gw.name] || '#e5e7eb' }}
          >
            <span className={s['gw-total-name']}>{gw.name}</span>
            <span className={s['gw-total-count']}>{gw.count} UTRs</span>
            <span className={s['gw-total-amt']}>Net ₹{fmtAmt(gw.net)}</span>
            <span className={cx(s['gw-total-diff'], Math.abs(gw.net - gw.bank) < 1 ? s['gw-ok'] : s['gw-err'])}>
              {Math.abs(gw.net - gw.bank) < 1 ? '✓ Match' : `Diff ₹${fmtAmt(Math.abs(gw.net - gw.bank))}`}
            </span>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className={s['filter-bar']}>
        {[
          { key: 'all',      label: `All (${counts.all})` },
          { key: 'match',    label: `Match (${counts.match})` },
          { key: 'mismatch', label: `Mismatch (${counts.mismatch})` },
          ...gateways.map(g => ({ key: g, label: `${g} (${counts[g] || 0})` })),
        ].map(f => (
          <button
            key={f.key}
            className={cx(s['filter-btn'], filter === f.key && s['active'])}
            onClick={() => handleFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className={s['table-scroll']}>
        <table className={s['data-table']}>
          <thead>
            <tr>
              <th>Gateway</th>
              <th>UTR / Reference</th>
              <th>Credit Type</th>
              <th>GW Net (Rs)</th>
              <th>Gross (Rs)</th>
              <th>Fees (Rs)</th>
              <th>Tax (Rs)</th>
              <th>Bank Credit (Rs)</th>
              <th>Diff (Rs)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((record, idx) => {
              const gwName  = record['Gateway'] || record['Match Method'];
              const gwColor = GW_COLORS[gwName] || '#ffffff';
              const isMatch = record['Name Match'] === 'Match';
              const diff    = record['Difference (Rs)'];
              return (
                <tr
                  key={idx}
                  className={cx(s['data-row'], isMatch ? s['row-pending'] : s['row-unrecorded'])}
                  style={{ '--gw-color': gwColor } as React.CSSProperties}
                >
                  <td>
                    <span className={s['gw-badge']} style={{ background: gwColor }}>
                      {gwName}
                    </span>
                  </td>
                  <td className={cx(s['cell-mono'], s['gw-utr'])}>{record['UTR'] || record['Bank Party']}</td>
                  <td className={s['cell-method']}>{record['Credit Type']}</td>
                  <td className={s['cell-amount']}>{fmtAmt(record['Book Amt (Rs)'])}</td>
                  <td className={s['cell-amount']}>{fmtAmt(record['Gross'] || 0)}</td>
                  <td className={cx(s['cell-amount'], s['gw-fees'])}>{fmtAmt(record['Fees'] || 0)}</td>
                  <td className={cx(s['cell-amount'], s['gw-tax'])}>{fmtAmt(record['Tax'] || 0)}</td>
                  <td className={s['cell-amount']}>{fmtAmt(record['Bank Amt (Rs)'])}</td>
                  <td className={cx(s['cell-amount'], Math.abs(diff) < 1 ? s['diff-zero'] : s['diff-nonzero'])}>
                    {Math.abs(diff) < 1 ? '—' : Number(diff).toLocaleString('en-IN', { minimumFractionDigits: 2, signDisplay: 'always' })}
                  </td>
                  <td>
                    <span className={cx(s['badge'], isMatch ? s['badge-success'] : s['badge-danger'])}>
                      {isMatch ? 'Match' : record['Flags'] || 'Mismatch'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={s['table-footer']}>
        <span className={s['table-count']}>
          Showing {page * PER_PAGE + 1}–{Math.min((page + 1) * PER_PAGE, filtered.length)} of {filtered.length} records
        </span>
        {totalPages > 1 && (
          <div className={s['pagination']}>
            <button className={s['page-btn']} disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</button>
            <span className={s['page-info']}>Page {page + 1} of {totalPages}</span>
            <button className={s['page-btn']} disabled={page === totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default GatewayMatchedTable;
