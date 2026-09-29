import React from 'react';
import styles from '../styles/BRSStatement.module.css';
import { cx } from '../utils/cx';

interface BRSData {
  book_closing_bal:   number;
  bank_closing_bal:   number;
  add_issued:         number;
  less_deposited:     number;
  less_debited_nb:    number;
  add_credited_nb:    number;
  reconciled_balance: number;
  brs_difference:     number;
}

interface BRSItem {
  date?:          string;
  txn_type?:      string;
  bill_no?:       string;
  chq_no?:        string;
  book_report?:   string;   // raw name from Book Report column
  bank_statement?: string;  // raw description from Bank Statement column
  party?:         string;   // Makez Extracted
  amount:         number;
  narration?:     string;
  is_cf?:         boolean;
}

interface BRSStatementProps {
  brs:           BRSData;
  book_only:     any[];
  bank_only:     any[];
  matched?:      any[];
  company_name?: string;
  account_info?: string;
  brs_date?:     string;
  recon_type?:   string;
}

const fmtAmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const BRSStatement: React.FC<BRSStatementProps> = ({
  brs, book_only, bank_only, matched = [],
  company_name = '',
  account_info = '',
  brs_date     = '',
  recon_type   = '',
}) => {
  const isReconciled = Math.abs(brs.brs_difference) < 0.01;

  // ── Four BRS sections ────────────────────────────────────────────────────────
  const issued     = book_only.filter(r => r['Direction'] === 'OUTFLOW');
  const deposited  = book_only.filter(r => r['Direction'] === 'INFLOW');
  const debitedNB  = bank_only.filter(r => r['Direction'] === 'OUTFLOW');
  const creditedNB = bank_only.filter(r => r['Direction'] === 'INFLOW');

  // ── Map raw rows to BRSItem ──────────────────────────────────────────────────
  const mapBook = (r: any): BRSItem => {
    // Narration comes clean from backend for QR/gateway; for bank strip [CF from prev BRS] marker
    const rawNarr = r['Narration'] || '';
    const cleanNarr = rawNarr.replace('[CF from prev BRS]', '').trim().replace(/\s*\|\s*$/, '');
    const isPartyName = cleanNarr.startsWith('INDIVI - ')
      || cleanNarr === (r['Party Raw'] || '').trim()
      || cleanNarr === (r['Party'] || '').trim();
    const narration = (cleanNarr && !isPartyName) ? cleanNarr : (r['Issue'] || '');
    return {
      date:           r['Date']           || '',
      txn_type:       r['Txn Type']       || '',
      bill_no:        r['Bill No']        || '',
      chq_no:         r['Chq No'] != null ? String(r['Chq No']) : '',
      book_report:    r['Book Report']    || r['Party Raw'] || r['Party'] || '',
      bank_statement: r['Bank Statement'] || '',   // blank for book-only entries
      party:          r['Party']          || '',   // Makez Extracted
      amount:         Number(r['Book Amt (Rs)']) || 0,
      narration,
      is_cf: rawNarr.includes('[CF from prev BRS]') || String(r['Issue'] || '').includes('Carried Forward') || !!r['Is CF'],
    };
  };

  const isQR = recon_type === 'qr';

  const mapBank = (r: any): BRSItem => ({
    date:           r['Date']           || '',
    txn_type:       r['Txn Type']       || '',
    bill_no:        r['Bill No']        || '',
    chq_no:         r['RRN'] || r['Chq No'] || '',  // RRN for QR, Chq No for bank, blank for gateway
    book_report:    r['Book Report']    || '',        // always blank for bank-side entries
    bank_statement: r['Bank Statement'] || r['Description'] || r['Party'] || '',
    party:          r['Party']          || '',        // Makez Extracted
    amount:         Number(r['Bank Amt (Rs)']) || 0,
    narration:      r['Narration']      || r['Issue'] || '',
    is_cf:          String(r['Issue'] || '').includes('Carried Forward') || !!r['Is CF'],
  });

  // ── Running balance steps ────────────────────────────────────────────────────
  const step1 = brs.book_closing_bal + brs.add_issued;
  const step2 = step1 - brs.less_deposited;
  const step3 = step2 - brs.less_debited_nb;

  // ── Section component ────────────────────────────────────────────────────────
  const Section: React.FC<{
    title:     string;
    sign:      'add' | 'less';
    items:     BRSItem[];
    subtotal:  number;
    running:   number;
    sourceCol: 'book' | 'bank';   // which raw-name column to show
  }> = ({ title, sign, items, subtotal, running, sourceCol }) => (
    <div className={styles['brs-section']}>
      <div className={cx(styles['brs-section-title'], styles[`brs-section-title--${sign}`])}>
        <span className={styles['brs-sign-badge']}>{sign === 'add' ? 'Add' : 'Less'}</span>
        {title}
      </div>

      <div className={styles['brs-scroll-wrap']}>
        <div className={sourceCol === 'book' ? styles['brs-col-header--book'] : styles['brs-col-header--bank']}>
          <span>Date</span>
          <span>Type</span>
          <span>Bill No</span>
          <span>{sourceCol === 'book' ? 'Chq No' : isQR ? 'RRN' : 'Chq No'}</span>
          {sourceCol === 'book'
            ? <span>Book Report</span>
            : <span>Bank Statement</span>
          }
          <span>Makez Extracted</span>
          <span className={styles['col-right']}>Amount (Rs)</span>
          <span>Narration</span>
        </div>

        {items.length === 0 ? (
          <div className={styles['brs-nil-row']}>— Nil —</div>
        ) : (
          items.map((item, i) => (
            <div key={i} className={cx(
              sourceCol === 'book' ? styles['brs-item-row--book'] : styles['brs-item-row--bank'],
              item.is_cf && styles['brs-item-row--cf']
            )}>
              <span className={cx(styles['brs-cell'], styles['brs-cell--mono'])}>{item.date || ''}</span>
              <span className={styles['brs-cell']}>{item.txn_type || ''}</span>
              <span className={cx(styles['brs-cell'], styles['brs-cell--mono'])}>{item.bill_no || ''}</span>
              <span className={cx(styles['brs-cell'], styles['brs-cell--mono'])}>{item.chq_no || ''}</span>
              {sourceCol === 'book'
                ? <span className={cx(styles['brs-cell'], styles['brs-cell--book'])}>{item.book_report || ''}</span>
                : <span className={cx(styles['brs-cell'], styles['brs-cell--bank'])}>{item.bank_statement || ''}</span>
              }
              <span className={cx(styles['brs-cell'], styles['brs-cell--party'])}>
                <span className={styles['brs-cell--party-text']}>{item.party}</span>
                {item.is_cf && <span className={styles['brs-cf-badge']}>CF</span>}
              </span>
              <span className={cx(styles['brs-cell'], styles['brs-cell--amt'])}>{fmtAmt(item.amount)}</span>
              <span className={cx(styles['brs-cell'], styles['brs-cell--narr'])}>{item.narration || ''}</span>
            </div>
          ))
        )}
      </div>

      <div className={styles['brs-subtotal-row']}>
        <span className={cx(styles['brs-subtotal-amt'], styles[`brs-subtotal-amt--${sign}`])}>
          {fmtAmt(subtotal)}
        </span>
      </div>
      <div className={styles['brs-running-row']}>
        <span>Running Balance</span>
        <span className={styles['brs-running-amt']}>{fmtAmt(running)}</span>
      </div>
    </div>
  );

  return (
    <div className={styles['brs-statement']}>

      {/* Header */}
      <div className={styles['brs-header']}>
        {company_name && <div className={styles['brs-header-company']}>{company_name}</div>}
        {account_info && <div className={styles['brs-header-account']}>{account_info}</div>}
        <div className={styles['brs-header-title']}>
          Bank Reconciliation Statement
          {brs_date && <span className={styles['brs-header-date']}> As On {brs_date}</span>}
        </div>
      </div>

      {/* Opening balance */}
      <div className={styles['brs-opening-row']}>
        <span className={styles['brs-opening-label']}>Closing Balance as per Company Books</span>
        <span className={styles['brs-opening-amt']}>{fmtAmt(brs.book_closing_bal)}</span>
      </div>

      {/* Four BRS sections */}
      <Section
        title="Cheques issued but not debited in Bank"
        sign="add"
        items={issued.map(mapBook)}
        subtotal={brs.add_issued}
        running={step1}
        sourceCol="book"
      />
      <Section
        title="Cheques deposited but not credited in Bank"
        sign="less"
        items={deposited.map(mapBook)}
        subtotal={brs.less_deposited}
        running={step2}
        sourceCol="book"
      />
      <Section
        title="Debited in Bank but not credited in Our Book"
        sign="less"
        items={debitedNB.map(mapBank)}
        subtotal={brs.less_debited_nb}
        running={step3}
        sourceCol="bank"
      />
      <Section
        title="Credited in Bank but not debited in Our Book"
        sign="add"
        items={creditedNB.map(mapBank)}
        subtotal={brs.add_credited_nb}
        running={brs.reconciled_balance}
        sourceCol="bank"
      />

      {/* Bank closing balance */}
      <div className={styles['brs-bank-row']}>
        <span>Closing Balance as per Bank</span>
        <span>{fmtAmt(brs.bank_closing_bal)}</span>
      </div>

      {/* Difference */}
      <div className={cx(styles['brs-diff-row'], isReconciled ? styles['brs-diff-row--ok'] : styles['brs-diff-row--err'])}>
        <span>
          {isReconciled ? 'Difference  —  Fully Reconciled' : 'Difference  —  Investigate'}
        </span>
        <span>{isReconciled ? '—' : fmtAmt(brs.brs_difference)}</span>
      </div>

      {/* CF footnote */}
      <div className={styles['brs-footnote']}>
        <span className={styles['brs-cf-badge']}>CF</span>
        Carried Forward from Previous BRS — outstanding items not yet cleared in bank
      </div>

    </div>
  );
};

export default BRSStatement;