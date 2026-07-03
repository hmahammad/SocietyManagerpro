import { auth } from "../firebase";

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Translate labels
export const ACCT_LABELS: Record<string, string> = {
  business: "বিজনেস অ্যাকাউন্ট",
  saving: "সেভিংস অ্যাকাউন্ট",
};

export const INVEST_LABELS: Record<string, string> = {
  monthly: "মাসিক কিস্তি",
  yearly: "বাৎসরিক কিস্তি",
  one_time: "এককালীন জমা",
};

export const STATUS_LABELS: Record<string, string> = {
  active: "সক্রিয়",
  pending: "পেন্ডিং",
  request: "রিকোয়েস্ট",
  deactive: "নিষ্ক্রিয়",
};

export const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500 text-white",
  pending: "bg-amber-500 text-white",
  request: "bg-blue-500 text-white",
  deactive: "bg-red-500 text-white",
};

export const ROLE_LABELS: Record<string, string> = {
  member: "মেম্বার",
  company: "কোম্পানি",
  admin: "অ্যাডমিন",
};

// Formatting helpers
export function formatNum(n: number | string): string {
  const num = typeof n === "number" ? n : parseFloat(n) || 0;
  return Math.round(num).toLocaleString("en-IN");
}

export function formatBDT(n: number | string): string {
  const num = typeof n === "number" ? n : parseFloat(n) || 0;
  return Math.round(num).toLocaleString("bn-BD");
}

export function formatDate(s?: string | number): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("bn-BD", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return String(s);
  }
}
