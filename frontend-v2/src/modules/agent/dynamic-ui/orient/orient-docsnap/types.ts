export interface FileItem {
    name: string;
    url: string;
    type: 'pdf' | 'image' | 'doc' | 'other';
    source: 'order' | 'email' | 'upload';
    pages?: string[];
    ignored?: boolean;
    ignoredPages?: number[];
}

export interface Email {
    emailId: string;
    subject: string;
    from: string;
    date: string;
    bodyInnerText?: string;
    body?: string;
    attachments: FileItem[];
    orderNumber?: number;
    linked?: boolean;
}

export interface OrderDetails {
    orderId: number;
    orderNumber: number;
    orderType: 'buy' | 'sell';
    productType: ('currency' | 'card' | 'tt')[];
    location?: string;
    locationId?: number;
    branch: string;
    branchId: number;
    branchCode?: string;
    totalAmount: number;
    actualAmount: number;
    orderStatus: 'pending' | 'extracted' | 'submitted' | 'failed';
    documentSubmitStatus: string;
    paymentType?: string;
    deliveryMode?: string;
    deliveryCharge?: number;
    handlingCharges?: number;
    purpose?: string;
    residentialStatus?: string;
    documentUploadTime?: string;
    orderCreatedDate?: string;
    gst?: string;
    tcs?: string;
    branchAccountNumber?: string;
    isLoanOrder?: boolean;
    sourceOfFund?: 'parent' | 'self';
}

export interface UserDetails {
    userId: number;
    name: string;
    email: string;
    phone: string;
    panNumber?: string;
}

export interface CurrencyDetail {
    serialNumber?: number;
    currency: string;
    product: string;
    quantity: number;
    rate: number;
    amount: number;
}

export interface DocumentDetail {
    documentName: string;
    documentPages: string[]; // -- new
    ignored?: boolean;
    ignoredPages?: number[];
}

export interface Order {
    _id?: string | undefined;
    orderDetails: OrderDetails;
    userDetails: UserDetails;
    currencyDetails: CurrencyDetail[];
    webDocuments: DocumentDetail[];
    manualDocuments?: DocumentDetail[];
    emailDocuments?: DocumentDetail[];
    receipts?: DocumentDetail[];
    extractionDetails: {
        recordId?: string;
        templateName?: string;
        extractionDuration?: number;
        extractedData?: Record<string, unknown>;
        executions?: {
            executionId: string;
            recordId?: string;
        }[];
    };
    receiptExtractionDetails?: {
        recordId?: string;
        extractedData?: Record<string, unknown>;
    };
    maraekatDetails?: {
        eonBookingNumber?: string;
        bookingNumber?: string;
        recPaySubmitted?: boolean;
        currencySubmitted?: boolean;
        isExtractedDataUpdated?: boolean;
    };
    createdAt?: string;
}
