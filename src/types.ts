export interface User {
  docId: string;
  uid: string;
  userId: string;
  name: string;
  companyName?: string;
  companyAddress?: string;
  mobile: string;
  email: string;
  role: "admin" | "company" | "member";
  status: "active" | "pending" | "request" | "deactive";
  joinedDate?: number;
  createdAt?: number;
  dob?: string;
  nidType?: string;
  nidNumber?: string;
  accountType?: "business" | "saving" | "";
  InvestType?: "monthly" | "yearly" | "one_time" | "";
  investAmount?: number;
  investDate?: string;
  profilePic?: string;
  idFrontUrl?: string;
  idBackUrl?: string;
  amount?: number;
  savingsBalance?: number;
  investBalance?: number;
  incomeBalance?: number;
  customShare?: number;
  companyId?: string;
  birthDate?: string;
  address?: string;
  canSeeAllData?: boolean;
  whatsapp?: string;
  plan?: "free" | "monthly" | "yearly";
  planActiveUntil?: number;
  planRequested?: "monthly" | "yearly" | null;
  planRequestTxId?: string;
  planRequestMobile?: string;
  planRequestAmount?: number;
  planRequestAt?: number;
}

export interface HistoryEntry {
  docId: string;
  amount: number;
  date: string;
  memo?: string;
  InvestType?: string;
  type?: "savings_arrears" | string;
  arrears?: number;
  arrearsKey?: string;
  createdAt?: string;
  projectId?: string;
  projectName?: string;
  document?: {
    name: string;
    fileData?: string;
    fileType?: string;
  };
}

export interface ProjectDoc {
  id: string;
  name: string;
  fileData?: string; // base64 / dataUrl
  fileType?: string; // e.g. pdf, doc, image, text
  uploadedAt: string;
  notes?: string;
}

export interface Project {
  id: string;
  name: string;
  desc?: string;
  type?: string;
  status?: "active" | "completed" | "closed";
  location?: string;
  startDate?: string;
  endDate?: string;
  duration?: string;
  budget?: number;
  createdAt?: string;
  documents?: ProjectDoc[];
}

export interface Transaction {
  id: string;
  projectId: string;
  projectName: string;
  type: "expense" | "sale";
  amount: number;
  date: string;
  desc?: string;
  createdAt?: string;
  document?: {
    name: string;
    fileData?: string;
    fileType?: string;
  };
}

export interface InstallmentStep {
  month: number;
  dueDate: string;
  amount: number;
  status: "unpaid" | "paid" | "partial";
  paidAmount: number;
  paidDate?: string;
}

export interface Installment {
  id: string;
  customerName: string;
  productName: string;
  totalAmount: number;
  downPayment: number;
  monthlyPay: number;
  months: number;
  startDate: string;
  dueAmount: number;
  status: "open" | "closed";
  schedule: InstallmentStep[];
  createdAt?: string;
  document?: {
    name: string;
    fileData?: string;
    fileType?: string;
  };
}

export interface Notification {
  docId: string;
  title: string;
  body: string;
  senderId: string;
  senderName: string;
  senderRole: "admin" | "company";
  targetType: "all_companies" | "all_members" | "company_members" | "admin";
  targetCompanyId?: string;
  createdAt: string;
  readBy?: string[];
}

export interface TransactionRequest {
  id: string;
  companyId: string; // The company ID of the member
  userId: string; // Doc ID of the user/member
  userName: string;
  userEmail?: string;
  flow: "IN" | "OUT";
  type: "saving" | "installment";
  amount: number;
  date: string;
  memo: string;
  paymentMethod: "mobile_banking" | "bank" | "cash"; // Modified to support 'cash'

  // Mobile Details
  mobileProvider?: "bkash" | "nagad" | "rocket" | "upay" | "";
  mobileAccountNo?: string;
  mobileTrxId?: string;

  // Bank Details
  bankName?: string;
  bankBranch?: string;
  bankAccountNo?: string;
  bankTrxId?: string;

  // Installment reference if any
  installmentId?: string;
  installmentName?: string;

  status: "pending" | "approved" | "rejected";
  rejectedReason?: string;
  createdAt: string;
  processedAt?: string;
  processedBy?: string; // Name or ID of company/admin who processed
}

export interface CompanyPaymentAccount {
  id: string;
  companyId: string;
  type: "mobile_banking" | "bank";
  providerName: string; // e.g. "bKash", "Nagad", or Bank Name
  accountNumber: string;
  accountType?: string; // e.g. "Personal", "Agent", "Merchant" or Bank Branch/Name
  accountName?: string; // Account holder's name
  isActive: boolean;
  createdAt: string;
}



