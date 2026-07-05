import React, { useState, useEffect } from "react";
import { db, auth } from "../firebase";
import { collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, updateDoc, arrayUnion } from "firebase/firestore";
import { User, Notification } from "../types";
import { Bell, Plus, Send, Trash2, CheckCircle2, Building2, UserCircle, Megaphone, Calendar, ChevronRight } from "lucide-react";

interface NotificationsViewProps {
  currentUser: User;
  onNavigate: (view: string, params?: any) => void;
}

export default function NotificationsView({ currentUser, onNavigate }: NotificationsViewProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [showAddForm, setShowAddForm] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [targetType, setTargetType] = useState<"all_companies" | "all_members" | "company_members">(
    currentUser.role === "admin" ? "all_companies" : "company_members"
  );
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Listen to notifications
  useEffect(() => {
    const q = query(collection(db, "notifications"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Notification[] = [];
        snapshot.forEach((doc) => {
          list.push({ docId: doc.id, ...doc.data() } as Notification);
        });

        // Filter based on user's role and company membership
        const filtered = list.filter((n) => {
          // Admins can see everything
          if (currentUser.role === "admin") return true;

          // Users can always see notifications they sent
          if (n.senderId === currentUser.docId) return true;

          // Companies can see notifications targeting "all_companies"
          if (currentUser.role === "company") {
            return n.targetType === "all_companies";
          }

          // Members can see notifications targeting "all_members"
          // Or company-specific notifications targeting their parent company
          if (currentUser.role === "member") {
            if (n.targetType === "all_members") return true;
            if (n.targetType === "company_members" && n.targetCompanyId === currentUser.companyId) {
              return true;
            }
          }

          return false;
        });

        setNotifications(filtered);
        setLoading(false);
      },
      (err) => {
        console.error("Error listening to notifications:", err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentUser.role === "company" && currentUser.status !== "active") {
      setError("আপনার অ্যাকাউন্টটি সক্রিয় নয়। বিজ্ঞপ্তি পাঠাতে পারবেন না।");
      return;
    }
    if (!title.trim() || !body.trim()) {
      setError("শিরোনাম এবং বিস্তারিত বিবরণ আবশ্যক!");
      return;
    }

    setSending(true);
    setError("");
    setSuccess("");

    try {
      const payload: any = {
        title: title.trim(),
        body: body.trim(),
        senderId: currentUser.docId,
        senderName: currentUser.role === "admin" ? "অ্যাডমিন" : (currentUser.companyName || currentUser.name),
        senderRole: currentUser.role as "admin" | "company",
        targetType,
        createdAt: new Date().toISOString(),
        readBy: [currentUser.docId], // Sender has implicitly read it
      };

      // If company is sending, targetCompanyId is their own company ID (docId)
      if (currentUser.role === "company") {
        payload.targetCompanyId = currentUser.docId;
        payload.targetType = "company_members";
      }

      await addDoc(collection(db, "notifications"), payload);

      setTitle("");
      setBody("");
      setSuccess("বিজ্ঞপ্তিটি সফলভাবে পাঠানো হয়েছে!");
      setTimeout(() => {
        setShowAddForm(false);
        setSuccess("");
      }, 1500);
    } catch (err: any) {
      console.error("Error creating notification:", err);
      setError("বিজ্ঞপ্তি পাঠাতে ব্যর্থ হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।");
    } finally {
      setSending(false);
    }
  };

  const handleMarkAsRead = async (notifId: string) => {
    try {
      const notifRef = doc(db, "notifications", notifId);
      await updateDoc(notifRef, {
        readBy: arrayUnion(currentUser.docId),
      });
    } catch (err) {
      console.error("Error marking notification as read:", err);
    }
  };

  const handleDeleteNotification = async (notifId: string) => {
    if (!window.confirm("আপনি কি নিশ্চিতভাবে এই বিজ্ঞপ্তিটি মুছে ফেলতে চান?")) return;

    try {
      await deleteDoc(doc(db, "notifications", notifId));
    } catch (err) {
      console.error("Error deleting notification:", err);
    }
  };

  const formatBanglaDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString("bn-BD", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 lg:px-8 font-sans">
      {/* Header card */}
      <div className="bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-800 rounded-3xl p-6 sm:p-8 text-white shadow-xl mb-6 relative overflow-hidden">
        <div className="absolute right-0 bottom-0 opacity-10 transform translate-x-6 translate-y-6">
          <Bell className="w-56 h-56" />
        </div>
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="bg-white/25 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider">
              বিজ্ঞপ্তি কেন্দ্র
            </span>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">বিজ্ঞপ্তি ও ঘোষণা</h1>
            <p className="text-xs sm:text-sm text-indigo-100 font-medium">
              গুরুত্বপূর্ণ আপডেট, নোটিশ এবং কোম্পানির বার্তা সমূহ এখানে দেখতে পাবেন।
            </p>
          </div>

          {(currentUser.role === "admin" || (currentUser.role === "company" && currentUser.status === "active")) && (
            <button
              onClick={() => {
                setShowAddForm(!showAddForm);
                setError("");
                setSuccess("");
              }}
              className="px-5 py-3 bg-white text-indigo-700 hover:bg-indigo-50 font-extrabold text-xs rounded-2xl transition shadow-lg flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              {showAddForm ? "বন্ধ করুন" : "নতুন বিজ্ঞপ্তি"}
            </button>
          )}
        </div>
      </div>

      {/* Add notification form */}
      {showAddForm && (
        <div className="bg-white border border-slate-100 rounded-3xl shadow-xl p-5 sm:p-6 mb-6 animate-fadeIn text-left">
          <div className="flex items-center gap-2 pb-4 border-b border-slate-100 mb-4 text-slate-800">
            <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <Megaphone className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base">নতুন বিজ্ঞপ্তি পাঠান</h3>
              <p className="text-[10px] text-slate-400 font-medium">সিস্টেমের গুরুত্বপূর্ণ আপডেট বা বার্তা সবার সাথে শেয়ার করুন</p>
            </div>
          </div>

          <form onSubmit={handleSendNotification} className="space-y-4">
            {error && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-bold">
                ⚠️ {error}
              </div>
            )}
            {success && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 text-xs font-bold">
                ✓ {success}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">বিজ্ঞপ্তির শিরোনাম</label>
              <input
                type="text"
                placeholder="যেমন: মাসিক ফি পরিশোধের নোটিশ..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 rounded-2xl px-4 py-3.5 text-xs font-bold outline-none transition"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">বিস্তারিত বিবরণ</label>
              <textarea
                placeholder="বিজ্ঞপ্তির বিস্তারিত বিবরণ এখানে লিখুন..."
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 rounded-2xl px-4 py-3 text-xs font-medium outline-none transition resize-none"
              />
            </div>

            {/* Target Select option for Admin only */}
            {currentUser.role === "admin" && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">কাদের কাছে পাঠাতে চান?</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setTargetType("all_companies")}
                    className={`p-3.5 rounded-2xl text-xs font-bold border transition text-center cursor-pointer ${
                      targetType === "all_companies"
                        ? "bg-indigo-50 border-indigo-500 text-indigo-700"
                        : "bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-600"
                    }`}
                  >
                    🏢 সকল কোম্পানি
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetType("all_members")}
                    className={`p-3.5 rounded-2xl text-xs font-bold border transition text-center cursor-pointer ${
                      targetType === "all_members"
                        ? "bg-indigo-50 border-indigo-500 text-indigo-700"
                        : "bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-600"
                    }`}
                  >
                    👥 সকল মেম্বার
                  </button>
                </div>
              </div>
            )}

            {currentUser.role === "company" && (
              <div className="bg-indigo-50/50 border border-indigo-100/70 rounded-2xl p-3 text-[11px] text-indigo-900 font-semibold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                <span>কোম্পানি হিসেবে এই বিজ্ঞপ্তিটি শুধুমাত্র আপনার অধীনের মেম্বারদের কাছে পাঠানো হবে।</span>
              </div>
            )}

            <button
              type="submit"
              disabled={sending}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white py-3.5 rounded-2xl font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-lg shadow-indigo-600/10 cursor-pointer"
            >
              <Send className="w-4 h-4" />
              {sending ? "পাঠানো হচ্ছে..." : "বিজ্ঞপ্তিটি প্রকাশ করুন"}
            </button>
          </form>
        </div>
      )}

      {/* Notifications list */}
      <div className="space-y-3.5 text-left">
        {loading ? (
          <div className="bg-white border border-slate-100 rounded-3xl p-12 text-center shadow-sm">
            <div className="w-10 h-10 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mx-auto"></div>
            <p className="mt-3.5 text-xs text-slate-400 font-bold">বিজ্ঞপ্তিগুলো লোড হচ্ছে...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="bg-white border border-slate-100 rounded-3xl p-12 text-center shadow-sm flex flex-col items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center">
              <Bell className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-extrabold text-slate-700 text-sm">কোন বিজ্ঞপ্তি পাওয়া যায়নি</h4>
              <p className="text-[11px] text-slate-400 font-semibold mt-1">আপনার জন্য এই মুহূর্তে কোনো বিজ্ঞপ্তি বা ঘোষণা নেই।</p>
            </div>
          </div>
        ) : (
          notifications.map((n) => {
            const isRead = n.readBy?.includes(currentUser.docId);
            const canDelete = currentUser.role === "admin" || n.senderId === currentUser.docId;

            return (
              <div
                key={n.docId}
                onClick={() => !isRead && handleMarkAsRead(n.docId)}
                className={`bg-white border rounded-3xl p-4 sm:p-5 transition-all shadow-xs hover:shadow-md flex flex-col sm:flex-row gap-4 items-start ${
                  isRead ? "border-slate-100" : "border-indigo-100 bg-gradient-to-tr from-white to-indigo-50/10"
                }`}
              >
                {/* Sender badge/avatar */}
                <div className="flex-shrink-0">
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
                    n.senderRole === "admin"
                      ? "bg-amber-50 text-amber-600"
                      : "bg-blue-50 text-blue-600"
                  }`}>
                    {n.senderRole === "admin" ? <UserCircle className="w-6 h-6" /> : <Building2 className="w-5 h-5" />}
                  </div>
                </div>

                {/* Content body */}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-black text-slate-800">{n.senderName}</span>
                    <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full ${
                      n.senderRole === "admin"
                        ? "bg-amber-500/10 text-amber-700"
                        : "bg-blue-500/10 text-blue-700"
                    }`}>
                      {n.senderRole === "admin" ? "অ্যাডমিন" : "কোম্পানি"}
                    </span>

                    {/* Target tag */}
                    <span className="text-[9px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">
                      {n.targetType === "all_companies"
                        ? "🎯 সকল কোম্পানি"
                        : n.targetType === "all_members"
                        ? "🎯 সকল মেম্বার"
                        : "🎯 কোম্পানি মেম্বারগণ"}
                    </span>

                    {!isRead && (
                      <span className="bg-indigo-600 text-white text-[8px] font-black tracking-widest px-1.5 py-0.5 rounded-md uppercase animate-pulse">
                        নতুন
                      </span>
                    )}
                  </div>

                  <div className="space-y-1">
                    <h4 className="font-extrabold text-sm text-slate-800 tracking-tight leading-snug">
                      {n.title}
                    </h4>
                    <p className="text-xs text-slate-500 font-medium leading-relaxed whitespace-pre-wrap">
                      {n.body}
                    </p>
                  </div>

                  {/* Metadata and action buttons */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-50 text-[10px] text-slate-400 font-bold">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {formatBanglaDate(n.createdAt)}
                    </span>

                    <div className="flex items-center gap-1.5">
                      {!isRead && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMarkAsRead(n.docId);
                          }}
                          className="flex items-center gap-0.5 px-2.5 py-1 text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-lg hover:bg-emerald-100 transition cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> পঠিত চিহ্নিত করুন
                        </button>
                      )}

                      {canDelete && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteNotification(n.docId);
                          }}
                          className="p-1 text-rose-500 hover:bg-rose-50 border border-transparent hover:border-rose-100 rounded-lg transition cursor-pointer"
                          title="মুছে ফেলুন"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
