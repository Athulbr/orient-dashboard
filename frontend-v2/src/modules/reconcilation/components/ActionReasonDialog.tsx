import React, { useEffect, useState } from 'react';
import { DialogComponent } from '../../../components/DialogComponent';
import styles from '../styles/ActionReasonDialog.module.css';

interface ActionReasonDialogProps {
  isOpen:      boolean;
  title:       string;
  description: string;
  confirmLabel?: string;
  onCancel:    () => void;
  onConfirm:   (reason: string) => void;
}

// Every manual override (un-match / confirm-match) needs an auditable
// reason — this is reconciliation data, so a silent override isn't
// acceptable. The reason lands in the row's Narration/Flags so it's
// visible in the app and in the downloaded workbook.
const ActionReasonDialog: React.FC<ActionReasonDialogProps> = ({
  isOpen, title, description, confirmLabel = 'Confirm', onCancel, onConfirm,
}) => {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (isOpen) { setReason(''); setTouched(false); }
  }, [isOpen]);

  const isEmpty = reason.trim().length === 0;

  const handlePrimary = () => {
    if (isEmpty) { setTouched(true); return; }
    onConfirm(reason.trim());
  };

  return (
    <DialogComponent
      isOpen={isOpen}
      closeDialog={onCancel}
      name={title}
      primaryButtonText={confirmLabel}
      onPrimaryAction={handlePrimary}
      className="max-w-md w-full"
    >
      <div className={styles['reason-body']}>
        <p className={styles['reason-desc']}>{description}</p>
        <label className={styles['reason-label']} htmlFor="action-reason-input">
          Reason <span className={styles['reason-required']}>(required)</span>
        </label>
        <textarea
          id="action-reason-input"
          className={styles['reason-input']}
          rows={3}
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="e.g. Same payment, engine matched wrong counterparty"
          autoFocus
        />
        {touched && isEmpty && (
          <p className={styles['reason-error']}>A reason is required before this can be applied.</p>
        )}
      </div>
    </DialogComponent>
  );
};

export default ActionReasonDialog;
