// Shared types for the reconciliation results/editing session.
//
// Field names (the quoted string keys) match the backend's JSON exactly —
// they come straight from reconcilation.py / qr_reconcilation.py /
// gateway_reconcilation.py's to_dict("records") output. Keep them in sync
// with app.py if the backend response shape changes.
//
// `_id` is NOT sent by the backend — it's stamped onto every record client-
// side the moment a response arrives (see stampIds in useReconciliationSession.ts)
// so TanStack Table row selection and the un-match/confirm-match actions have
// a stable key to work with, even as records move between tables.

export interface MatchedRecord {
  'Match Method': string;
  'Name Match': string;
  'Fuzzy Score %': number;
  'Amount Match': string;
  'Book Date': string;
  'Book Txn': string;
  'Book Bill No': string;
  'Book Chq': string;
  'Book Party': string;
  'Book Party Raw'?: string;
  'Book Direction': string;
  'Book Sender': string;
  'Book Recipient': string;
  'Book Amt (Rs)': number;
  'Bank Date': string;
  'Bank Chq': string;
  'Bank RRN'?: string;
  'Bank Description': string;
  'Bank Payer'?: string;
  'Bank Party': string;
  'Bank Direction': string;
  'Bank Sender': string;
  'Bank Recipient': string;
  'Debit (Rs)': string | number;
  'Credit (Rs)': string | number;
  'Bank Amt (Rs)': number;
  'Difference (Rs)': number;
  'Flags': string;
  'Partial Payment'?: boolean;
  'Bank Full Amt'?: number;
  // Set on rows created by the in-app Confirm Match action (as opposed to
  // rows the automated engine matched).
  'Is Manual'?: boolean;
  // Set on split-leg matched rows (Confirm Match with N books:1 bank or
  // 1 book:N banks) — blanks the non-split side's repeated amount on legs
  // after the first, so the downloaded workbook's Matched sheet and
  // Summary totals don't count it once per leg. Absent on non-split rows.
  '_display_book_amt'?: number | '';
  '_display_bank_amt'?: number | '';
  '_display_debit'?: number | string;
  '_display_credit'?: number | string;
  // Set on N:M Confirm Match legs where one side has already run out of
  // rows — that side of the leg is an empty placeholder, not a real entry.
  '_no_book_leg'?: boolean;
  '_no_bank_leg'?: boolean;
  // Set once a flagged (Human Verification) row has been confirmed by the
  // user, so it drops out of review and its released BRS legs are consumed.
  'Is Reviewed'?: boolean;
  _id: string;
}

export interface BookOnlyRecord {
  'Date'?: string;
  'Txn Type'?: string;
  'Bill No': string;
  'Chq No': string;
  'Party': string;
  'Party Raw'?: string;
  'Direction': string;
  'Sender'?: string;
  'Recipient'?: string;
  'Book Amt (Rs)': number;
  'Narration'?: string;
  'Issue'?: string;
  'Is CF'?: boolean;
  'Is Manual'?: boolean;
  _id: string;
}

export interface BankOnlyRecord {
  'Date': string;
  'Chq No': string;
  'Description'?: string;
  'Bank Statement'?: string;
  'Party': string;
  'Direction': string;
  'Sender'?: string;
  'Recipient'?: string;
  'Debit (Rs)'?: string | number;
  'Credit (Rs)'?: string | number;
  'Bank Amt (Rs)': number;
  'Balance (Rs)'?: string | number;
  'Narration'?: string;
  'Issue'?: string;
  'Is CF'?: boolean;
  'Is Manual'?: boolean;
  _id: string;
}

export interface BRSData {
  book_closing_bal: number;
  bank_closing_bal: number;
  add_issued: number;
  less_deposited: number;
  less_debited_nb: number;
  add_credited_nb: number;
  reconciled_balance: number;
  brs_difference: number;
}

export interface SummaryData {
  book_entries: number;
  bank_entries: number;
  matched: number;
  matched_perfect: number;
  matched_with_diff: number;
  book_only: number;
  bank_only: number;
  difference: number;
}

export type ReconType = 'bank' | 'qr' | 'gateway';
