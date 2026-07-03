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
  customShare?: number;
  companyId?: string;
  birthDate?: string;
  address?: string;
  canSeeAllData?: boolean;
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
}
