import { config } from '../../../../../../../config/default';
import { Order } from '../../types';
import { formatDateForMaraekat } from './getMaraekatPayload';
import { useToastStore } from '../../../../../../../components/toast/ToastStore';

export interface UseSubmitReceiptsOptions {
    extractedData: any;
    onOrderUpdate?: (updatedOrder: Order) => void;
}

// Account number mappings by branch code
const ACCOUNT_NUMBERS: Record<string, Record<string, string>> = {
    AHMD: { '914020023991846': 'AXIS846', '00000035782412743': 'SBI743' },
    AMTR: { '916020014634868': 'AXIS868' },
    BANH: { '919020074095783': 'AXIS5783', '12262090000050': 'HDFC' },
    BANW: { '923020070570106': 'AXIS70106' },
    BELG: { '914020012417461': 'AXIS', '02532090000040': 'HDFC0040' },
    CALCT: { '914020013039000': 'AXIS' },
    CHAD: { '200999478501': 'INDUSJNR' },
    CHN: { '914020006153764': 'AXIS', '002281400006919': 'YESBNK06919' },
    COARP: { '200999478532': 'INDUSCOARP' },
    COMB: { '919020084679889': 'AXIS889' },
    COMGR: { '913020024767106': 'AXISEXPO', '15122090000014': 'HDFC0014', '002281400006929': 'YESBNK06929' },
    DLHI: { '914020021605910': 'AXISDLHI', '50200011742914': 'HDFC2914' },
    GURG: { '200999478518': 'INDUS8518', '002281400006949': 'YESBNK06949' },
    HYD: { '916020029890684': 'AXI684', '16272560000035': 'HDFC0035' },
    JLDR: { '916020014438806': 'AXIS806', '2999002100042248': 'PNB2248', '04751100000976': 'PSIB976', '00000065255370455': 'SBP455', '002281400006939': 'YESBNK06939' },
    KOL: { '913020049024154': 'AXIS', '50200009566772': 'HDFC6772' },
    KOLM: { '911020022168048': 'AXIS' },
    KTM: { '913020055629086': 'AXIS' },
    MNGLR: { '914020023991888': 'AXIS888' },
    MUMD: { '015020110000301': 'BOI301', '50200119383552': 'HDFC83552' },
    MUMV: { '913020038917603': 'AXIS', '03582090000031': 'HDFC0031', '002281400006886': 'YESBNK06886' },
    PUNE: { '917020063654511': 'AXI511' },
    SURAT: { '01880200001335': 'BOB1335', '200999478525': 'INDUS8525' },
    THRI: { '914020012500615': 'AXISTHRI', '06702090000016': 'HDFC0016' },
    TVM: { '914020011087568': 'AXISBANKTVM' },
    VADO: { '917020042844012': 'AXIS4012' },
    HOT: {
        '081010200019813': 'AXIS9813',
        '009010200015039': 'AXISBLRMGROAD',
        '914020014608384': 'COMMAXIS',
        '918020069425192': 'ONLINEAXIS192',
        '920020053547564': 'AXISEEFC564',
        '510101005983524': 'CORPBANK3524',
        '11530200023482': 'FEDERAL482',
        '01332320001240': 'HDFC1240',
        '041505000723': 'ICICI',
        '116205000517': 'ICICIKOCHI',
        '10020841026': 'IDFC1026',
        '200000979511': 'INDUSIND',
        '204011032315': 'INGVY',
        '4762000100174701': 'KAR701',
        '20062019000134': 'SBM0134',
        '67341643312': 'SBT',
        '0087073000001784': 'SIB784',
        '019784000000068': 'YESB',
        '002281400006909': 'YESBNK06909',
        '002281400006896': 'YESFINTIBA'
    }
};

function getCashBank(receipt: any, order: Order): string {
    const receiptType = receipt.receipt_type?.value?.trim().toUpperCase() ?? '';
    const bankName = receipt.bank_name?.value?.trim().toUpperCase() ?? '';

    if (receiptType.includes('CHEQ')) return '';
    if (receiptType.includes('UPI') || receiptType.includes('SCAN')) {
        if (order.orderDetails.documentSubmitStatus === 'online') return 'GATEWAY';
        if (!bankName) throw new Error('Bank Name is missing');
        return bankName.includes('HDFC') ? 'QRHDFC' : 'QRYESBANK';
    }
    if (receiptType.includes('NET') || receiptType.includes('PAYU') || receiptType.includes('CREDIT')) {
        if (order.orderDetails.documentSubmitStatus === 'online') return 'GATEWAY';
    }

    const bankAccounts = ACCOUNT_NUMBERS[sessionStorage.getItem('branch_code') as string];

    if (order.orderDetails.branchAccountNumber && bankAccounts?.[order.orderDetails.branchAccountNumber]) {
        return bankAccounts[order.orderDetails.branchAccountNumber];
    }
    if (receipt.account_number?.value) {
        if (bankAccounts?.[`${receipt.account_number.value}`]) {
            return bankAccounts[`${receipt.account_number.value}`];
        }
        throw new Error('Account Number not found in branch bank accounts');
    }

    const defaultBranch = ACCOUNT_NUMBERS[sessionStorage.getItem('branch_code') as string];
    if (defaultBranch) return Object.values(defaultBranch)[0];
    return '';
}

export const useSubmitReceipts = ({ extractedData, onOrderUpdate }: UseSubmitReceiptsOptions) => {
    const toast = useToastStore();

    const submitReceipts = async (order: Order): Promise<boolean> => {
        const eonBookingNumber = order?.maraekatDetails?.eonBookingNumber;
        const bookingNo = order?.maraekatDetails?.bookingNumber;
        const orderType: string = order?.orderDetails?.orderType;

        if (!eonBookingNumber || !bookingNo) {
            toast.error('Failed to submit receipts: Booking Number or EON Booking Number is missing');
            return false;
        }

        const receipts = extractedData?.receipts || [];

        // Skip if no receipts — not an error
        if (receipts.length === 0) {
            console.log('No receipts to submit, skipping receipt submission step.');
            return true;
        }

        // Login
        let authToken: string | null = null;
        try {
            const loginRes = await fetch(`${config.workflowService}/workflow/orient/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            if (!loginRes.ok) {
                toast.error(`Failed to submit receipts: Login failed (${loginRes.status})`);
                return false;
            }
            const loginData = await loginRes.json();
            authToken = loginData?.Result;
            if (!authToken) {
                toast.error('Failed to submit receipts: No auth token received');
                return false;
            }
        } catch (err: any) {
            toast.error(`Failed to submit receipts: ${err.message || 'Login request failed'}`);
            return false;
        }

        let hasError = false;
        let successCount = 0;

        for (const receipt of receipts) {
            let cashBank: string;
            try {
                cashBank = getCashBank(receipt, order);
            } catch (error: any) {
                toast.error(`Failed to submit receipts: ${error.message}`);
                hasError = true;
                continue;
            }

            const payload = {
                BRANCHCODE: window.sessionStorage.getItem('branch_code') || '',
                BOOKINGTYPE: orderType === 'sell' ? 'SALE' : orderType === 'buy' ? 'PURCHASE' : orderType?.toUpperCase() || '',
                BOOKINGNO: String(bookingNo).toUpperCase(),
                EONBOOKINGNO: String(eonBookingNumber).toUpperCase(),
                CASHBANK: cashBank.toUpperCase(),
                CHQNO: String(receipt.cheque_number?.value || '').toUpperCase(),
                CHQDT: formatDateForMaraekat(String(receipt.cheque_date?.value || '')).date,
                DRAWNON: '.',
                BANKBRANCH: '.',
                AMOUNT: String(receipt.amount?.value || '').replace(/[^\d.]/g, '')
            };

            try {
                const response = await fetch(`${config.workflowService}/workflow/orient/receipt-submit`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    toast.error(`Failed to submit receipts: API returned ${response.status}`);
                    hasError = true;
                    continue;
                }

                const responseData = await response.json();
                const resultItem = responseData?.Result?.[0];

                if (resultItem?.APISTATUS === 'FAILED') {
                    toast.error(`Failed to submit receipts: ${resultItem.ERRORDESC || 'Unknown error'}`);
                    hasError = true;
                } else {
                    successCount++;
                }
            } catch (err: any) {
                toast.error(`Failed to submit receipts: ${err.message || 'Unexpected error'}`);
                hasError = true;
            }
        }

        if (!hasError && successCount > 0) {
            toast.success(`Successfully submitted ${successCount} receipt(s) to Maraekat!`);
            try {
                const updatePayload = { maraekatDetails: { ...order.maraekatDetails, receiptPayStatus: 'submitted' } };
                const res = await fetch(`${config.workflowService}/workflow/orders/${order.orderDetails.orderNumber}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updatePayload)
                });
                if (res.ok && onOrderUpdate) {
                    onOrderUpdate({ ...order, maraekatDetails: { ...order.maraekatDetails, recPaySubmitted: true } });
                }
            } catch (err) {
                console.error('Failed to update order with receipt pay status:', err);
            }
            return true;
        } else if (hasError) {
            toast.error(`Failed to submit all receipts. ${successCount}/${receipts.length} successful.`);
            return false;
        }

        return false;
    };

    return { submitReceipts };
};
