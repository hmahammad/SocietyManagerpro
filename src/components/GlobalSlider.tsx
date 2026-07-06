import React, { useState, useEffect, useRef } from "react";
import { db } from "../firebase";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from "firebase/firestore";
import { User } from "../types";
import { Settings, Plus, Trash2, Edit2, X, Upload, ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface Slide {
  id: string;
  imageUrl: string;
  title: string;
  subtitle: string;
  actionUrl?: string;
  createdAt?: any;
}

interface GlobalSliderProps {
  currentUser: User;
  language?: "bn" | "en";
}

export default function GlobalSlider({ currentUser, language = "bn" }: GlobalSliderProps) {
  const [slides, setSlides] = useState<Slide[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Form states for adding/editing a slide
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formImageUrl, setFormImageUrl] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formSubtitle, setFormSubtitle] = useState("");
  const [formActionUrl, setFormActionUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  // Autoplay Timer Ref
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Default fallback slides
  const defaultSlides: Slide[] = [
    {
      id: "default-1",
      imageUrl: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=1200&q=80",
      title: language === "bn" ? "স্বাগতম সোসাইটি ম্যানেজারে" : "Welcome to Society Manager",
      subtitle: language === "bn" ? "আমাদের সমবায় ও সঞ্চয় হিসাব ব্যবস্থাপনাই আধুনিক ডিজিটালাইজেশন।" : "Modern digital management for your cooperatives and savings society.",
    },
    {
      id: "default-2",
      imageUrl: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1200&q=80",
      title: language === "bn" ? "স্বচ্ছ হিসাব ও নিরাপদ ভবিষ্যৎ" : "Transparent Accounts & Secure Future",
      subtitle: language === "bn" ? "প্রতিটি কিস্তি ও সঞ্চয়ের তথ্য এখন হাতের মুঠোয় সম্পূর্ণ নির্ভুলভাবে।" : "Every installment and savings record, perfectly accurate at your fingertips.",
    }
  ];

  const activeSlides = slides.length > 0 ? slides : defaultSlides;

  // Listen to Firestore slides collection (ordered by createdAt ascending)
  useEffect(() => {
    const q = query(collection(db, "slides"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snapshot) => {
      const list: Slide[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as Slide);
      });
      setSlides(list);
    }, (err) => {
      console.error("Error watching slides:", err);
    });
    return () => unsub();
  }, []);

  // Autoplay functionality
  const resetTimeout = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  };

  useEffect(() => {
    resetTimeout();
    timeoutRef.current = setTimeout(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % activeSlides.length);
    }, 5000); // Change slide every 5 seconds

    return () => resetTimeout();
  }, [currentIndex, activeSlides.length]);

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev === 0 ? activeSlides.length - 1 : prev - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % activeSlides.length);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert(language === "bn" ? "দয়া করে ২ এমবির কম সাইজের ছবি নির্বাচন করুন।" : "Please select an image smaller than 2MB.");
      return;
    }

    setIsUploading(true);
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormImageUrl(reader.result as string);
      setIsUploading(false);
    };
    reader.onerror = () => {
      alert(language === "bn" ? "ফাইল আপলোড ব্যর্থ হয়েছে!" : "File reading failed!");
      setIsUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const resetForm = () => {
    setEditingId(null);
    setFormImageUrl("");
    setFormTitle("");
    setFormSubtitle("");
    setFormActionUrl("");
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formImageUrl.trim()) {
      setError(language === "bn" ? "দয়া করে একটি ছবির লিংক দিন অথবা ছবি আপলোড করুন।" : "Please provide an image link or upload a file.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      if (editingId) {
        // Edit existing slide
        await updateDoc(doc(db, "slides", editingId), {
          imageUrl: formImageUrl,
          title: formTitle,
          subtitle: formSubtitle,
          actionUrl: formActionUrl,
        });
      } else {
        // Add new slide (limit to max 10)
        if (slides.length >= 10) {
          throw new Error(language === "bn" ? "সর্বোচ্চ ১০টি স্লাইড যোগ করা যাবে।" : "Maximum 10 slides limit reached.");
        }
        await addDoc(collection(db, "slides"), {
          imageUrl: formImageUrl,
          title: formTitle,
          subtitle: formSubtitle,
          actionUrl: formActionUrl,
          createdAt: Date.now(),
        });
      }
      resetForm();
    } catch (err: any) {
      console.error("Error saving slide:", err);
      setError(err.message || "Failed to save slide.");
    } finally {
      setLoading(false);
    }
  };

  const handleEditInit = (slide: Slide) => {
    setEditingId(slide.id);
    setFormImageUrl(slide.imageUrl);
    setFormTitle(slide.title);
    setFormSubtitle(slide.subtitle);
    setFormActionUrl(slide.actionUrl || "");
    setError("");
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(language === "bn" ? "আপনি কি নিশ্চিত যে এই স্লাইডটি মুছে ফেলতে চান?" : "Are you sure you want to delete this slide?")) {
      return;
    }
    try {
      await deleteDoc(doc(db, "slides", id));
      if (currentIndex >= Math.max(1, activeSlides.length - 1)) {
        setCurrentIndex(0);
      }
    } catch (err) {
      console.error("Error deleting slide:", err);
    }
  };

  const isAdmin = currentUser?.role === "admin";

  return (
    <div className="relative w-full bg-slate-100 border-b border-slate-200/60 overflow-hidden font-sans select-none">
      {/* Slide Canvas wrapper */}
      <div className="relative w-full h-[180px] sm:h-[240px] md:h-[300px] overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            className="absolute inset-0 w-full h-full"
          >
            {/* Visual background image with smooth dark gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-900/40 to-transparent z-10" />
            <img
              src={activeSlides[currentIndex]?.imageUrl}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
              alt=""
              onError={(e) => {
                // Fallback if image fails to load
                e.currentTarget.src = "https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=1200&q=80";
              }}
            />

            {/* Slide Text Content overlay */}
            <div className="absolute bottom-0 left-0 right-0 z-20 p-4 sm:p-6 md:p-8 text-white max-w-7xl mx-auto flex flex-col justify-end h-full">
              <div className="max-w-2xl animate-fadeIn">
                <h2 className="text-sm sm:text-base md:text-xl font-extrabold tracking-tight drop-shadow-md text-white">
                  {activeSlides[currentIndex]?.title}
                </h2>
                <p className="text-[10px] sm:text-xs md:text-sm text-slate-100 mt-1 sm:mt-1.5 font-medium leading-relaxed drop-shadow-sm line-clamp-2">
                  {activeSlides[currentIndex]?.subtitle}
                </p>
                {activeSlides[currentIndex]?.actionUrl && (
                  <a
                    href={activeSlides[currentIndex]?.actionUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center mt-2.5 sm:mt-3 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] sm:text-xs font-bold shadow-md transition duration-200 active:scale-95"
                  >
                    {language === "bn" ? "বিস্তারিত দেখুন ➔" : "Learn More ➔"}
                  </a>
                )}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Carousel Arrow Controls */}
        <button
          onClick={handlePrev}
          className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-black/30 hover:bg-black/50 text-white flex items-center justify-center transition active:scale-90"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          onClick={handleNext}
          className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-black/30 hover:bg-black/50 text-white flex items-center justify-center transition active:scale-90"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        {/* Carousel Dot Indicators */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex gap-1.5">
          {activeSlides.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                currentIndex === idx ? "w-5 bg-blue-500" : "w-1.5 bg-white/50 hover:bg-white"
              }`}
            />
          ))}
        </div>

        {/* Floating Admin Settings Control Trigger Button */}
        {isAdmin && (
          <button
            onClick={() => {
              resetForm();
              setShowAdminModal(true);
            }}
            className="absolute top-3 right-3 z-30 p-2 rounded-xl bg-white/90 hover:bg-white text-slate-800 hover:text-blue-600 shadow-lg flex items-center gap-1 text-[10px] sm:text-xs font-extrabold transition duration-200 active:scale-95 border border-slate-200"
            title="স্লাইডার সেটিংস"
          >
            <Settings className="w-4 h-4 animate-spin-slow text-indigo-600" />
            <span className="hidden sm:inline">স্লাইডার নিয়ন্ত্রণ (১০ স্লাইড)</span>
          </button>
        )}
      </div>

      {/* Admin Panel Modal to Manage Slides (Max 10) */}
      {showAdminModal && isAdmin && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[3000] p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl p-5 w-full max-w-2xl shadow-2xl space-y-4 text-left font-sans border border-slate-100 max-h-[90vh] overflow-y-auto">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b pb-3 border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-blue-50 text-blue-600">
                  <Settings className="w-5 h-5 text-indigo-600" />
                </span>
                <div>
                  <h3 className="font-extrabold text-slate-800 text-sm sm:text-base">
                    {language === "bn" ? "স্লাইডার কন্ট্রোল প্যানেল" : "Slider Control Panel"}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                    {language === "bn" ? `মোট স্লাইডঃ ${slides.length} / ১০` : `Total Slides: ${slides.length} / 10`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAdminModal(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error messaging */}
            {error && (
              <div className="p-3 rounded-2xl bg-rose-50 text-rose-700 text-xs font-bold">
                ⚠️ {error}
              </div>
            )}

            {/* Two-Column Form and List Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Form to Add / Edit Slide */}
              <form onSubmit={handleSubmit} className="space-y-3.5 bg-slate-50/60 p-4 rounded-2xl border border-slate-100">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide border-b pb-1.5 border-slate-100">
                  {editingId ? (language === "bn" ? "📝 স্লাইড সম্পাদনা করুন" : "📝 Edit Slide") : (language === "bn" ? "➕ নতুন স্লাইড যুক্ত করুন" : "➕ Add New Slide")}
                </h4>

                {/* Title Input */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">{language === "bn" ? "স্লাইড শিরোনাম (Title)" : "Slide Title"}</label>
                  <input
                    type="text"
                    required
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 bg-white"
                    placeholder={language === "bn" ? "যেমনঃ স্বাগতম আমাদের সমিতিতে" : "Welcome to our society"}
                  />
                </div>

                {/* Subtitle Input */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">{language === "bn" ? "সংক্ষিপ্ত বিবরণ (Subtitle)" : "Subtitle Description"}</label>
                  <textarea
                    rows={2}
                    required
                    value={formSubtitle}
                    onChange={(e) => setFormSubtitle(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 bg-white resize-none"
                    placeholder={language === "bn" ? "যেমনঃ আমরা নিয়ে এসেছি আধুনিক সঞ্চয় ও ঋণ হিসাব সমাধান।" : "Our society simplifies savings accounts."}
                  />
                </div>

                {/* Image Selection / Direct Link */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase block">{language === "bn" ? "স্লাইড ব্যানার ছবি" : "Slide Banner Image"}</label>
                  
                  {/* File selector base64 upload option */}
                  <div className="flex gap-2 items-center">
                    <label className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-dashed border-slate-300 rounded-xl cursor-pointer hover:bg-slate-100 transition text-[11px] font-bold text-slate-600">
                      <Upload className="w-4 h-4 text-slate-400" />
                      <span>{isUploading ? "আপলোড হচ্ছে..." : (language === "bn" ? "ডিভাইস থেকে নির্বাচন" : "Upload File")}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleFileUpload}
                        disabled={isUploading}
                      />
                    </label>
                  </div>

                  <div className="text-[9px] text-slate-400 font-bold text-center uppercase">{language === "bn" ? "অথবা ছবির লিংক" : "OR Image Link"}</div>

                  <input
                    type="url"
                    value={formImageUrl}
                    onChange={(e) => setFormImageUrl(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 bg-white"
                    placeholder="https://example.com/image.jpg"
                  />

                  {/* Tiny image preview */}
                  {formImageUrl && (
                    <div className="relative w-full h-16 rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                      <img src={formImageUrl} className="w-full h-full object-cover" alt="preview" />
                      <button
                        type="button"
                        onClick={() => setFormImageUrl("")}
                        className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white hover:bg-rose-600 transition"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Action URL/Target Link Input */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">{language === "bn" ? "লিংক / ক্লিক অ্যাকশন (ঐচ্ছিক)" : "Click Action URL (Optional)"}</label>
                  <input
                    type="text"
                    value={formActionUrl}
                    onChange={(e) => setFormActionUrl(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 bg-white"
                    placeholder="https://..."
                  />
                </div>

                {/* Actions Button */}
                <div className="flex gap-2 pt-1.5">
                  <button
                    type="submit"
                    disabled={loading || isUploading}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white py-2.5 rounded-xl text-xs font-bold transition duration-200 active:scale-95"
                  >
                    {loading ? (language === "bn" ? "সংরক্ষণ হচ্ছে..." : "Saving...") : (editingId ? (language === "bn" ? "হালনাগাদ করুন" : "Update") : (language === "bn" ? "যোগ করুন" : "Add Slide"))}
                  </button>
                  {editingId && (
                    <button
                      type="button"
                      onClick={resetForm}
                      className="bg-slate-150 hover:bg-slate-200 text-slate-700 px-3.5 py-2.5 rounded-xl text-xs font-bold transition"
                    >
                      {language === "bn" ? "বাতিল" : "Cancel"}
                    </button>
                  )}
                </div>
              </form>

              {/* List of Existing Slides (Max 10 Limit) */}
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide border-b pb-1.5 border-slate-100 flex justify-between items-center">
                  <span>{language === "bn" ? "বর্তমান স্লাইড তালিকা" : "Current Slides"}</span>
                  <span className="text-[9px] font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{slides.length} / ১০</span>
                </h4>

                {slides.length === 0 ? (
                  <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <p className="text-xs font-bold text-slate-400">{language === "bn" ? "কোন স্লাইড পাওয়া যায়নি!" : "No custom slides added yet!"}</p>
                    <p className="text-[10px] text-slate-400 mt-1">{language === "bn" ? "ডিফল্ট স্লাইডগুলো প্রদর্শিত হচ্ছে।" : "System default slides are currently visible."}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {slides.map((slide) => (
                      <div
                        key={slide.id}
                        className="flex gap-2.5 p-2 rounded-2xl border border-slate-100 bg-white hover:shadow-sm transition items-center"
                      >
                        {/* Slide Banner Icon/Image thumbnail */}
                        <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-100 shrink-0 border border-slate-200/40">
                          <img src={slide.imageUrl} className="w-full h-full object-cover" alt="" />
                        </div>
                        
                        {/* Title and details */}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-extrabold text-slate-800 truncate">{slide.title}</p>
                          <p className="text-[9px] text-slate-400 truncate mt-0.5 font-medium">{slide.subtitle}</p>
                        </div>

                        {/* Edit and Delete Buttons */}
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleEditInit(slide)}
                            className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition"
                            title={language === "bn" ? "সম্পাদনা" : "Edit"}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(slide.id)}
                            className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition"
                            title={language === "bn" ? "মুছে ফেলুন" : "Delete"}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Note text */}
            <div className="text-[10px] text-slate-400 font-bold border-t pt-3 border-slate-100 flex items-center gap-1">
              <span>💡</span>
              <span>{language === "bn" ? "স্লাইডারটি সর্বোচ্চ ১০টি কাস্টম ইমেজ সমর্থন করে। এটি শুধু এডমিনরাই পরিচালনা করতে পারবেন।" : "The slider supports a maximum of 10 custom banner images, managed exclusively by admins."}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
