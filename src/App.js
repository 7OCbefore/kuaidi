import React, { useState, useEffect, useMemo } from "react";
import {
  Package,
  CheckCircle2,
  Clock,
  Plus,
  Search,
  Trash2,
  Box,
  User,
  Truck,
  Copy,
  X,
  RefreshCw,
  AlertCircle,
} from "lucide-react";

// --- LeanCloud Configuration ---
const LEANCLOUD_APP_ID = "SlkrSn4s7FKA0eNVXIoBcIet-MdYXbMMI";
const LEANCLOUD_APP_KEY = "bhOzh71Xc5CJSMFhhw4W6cPe";
const LEANCLOUD_SERVER_URL = "https://avoscloud.com"; // 国际版通用API域名

export default function ParcelTracker() {
  const [isSDKLoaded, setIsSDKLoaded] = useState(false);
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form States
  const [trackingNum, setTrackingNum] = useState("");
  const [itemName, setItemName] = useState("");
  const [recipient, setRecipient] = useState("");
  const [sender, setSender] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);

  // UI States
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [toast, setToast] = useState(null);

  // --- 1. Load LeanCloud SDK via CDN ---
  useEffect(() => {
    // 检查是否已经加载
    if (window.AV) {
      setIsSDKLoaded(true);
      return;
    }

    const script = document.createElement("script");
    script.src =
      "https://cdn.jsdelivr.net/npm/leancloud-storage@4.15.0/dist/av-min.js";
    script.async = true;
    script.onload = () => {
      // 初始化
      if (!window.AV.applicationId) {
        window.AV.init({
          appId: LEANCLOUD_APP_ID,
          appKey: LEANCLOUD_APP_KEY,
          serverURL: LEANCLOUD_SERVER_URL,
        });
      }
      setIsSDKLoaded(true);
    };
    script.onerror = () => setError("无法加载云端服务，请检查网络连接");
    document.body.appendChild(script);

    return () => {
      // Cleanup if needed
    };
  }, []);

  // --- Data Fetching ---
  const fetchPackages = async () => {
    if (!isSDKLoaded || !window.AV) return;

    setLoading(true);
    setError(null);
    try {
      const query = new window.AV.Query("Package");
      query.descending("createdAt");
      query.limit(100);
      const results = await query.find();

      const pkgs = results.map((obj) => ({
        id: obj.id,
        ...obj.toJSON(),
        createdAt: obj.createdAt,
        _avObject: obj,
      }));

      // Local sort
      pkgs.sort((a, b) => {
        if (a.status === "pending" && b.status !== "pending") return -1;
        if (a.status !== "pending" && b.status === "pending") return 1;
        return new Date(b.createdAt) - new Date(a.createdAt);
      });

      setPackages(pkgs);
    } catch (err) {
      console.error("Fetch error:", err);
      // 如果是 401 错误，通常是 AppID 没填对
      if (err.code === 401) {
        setError("认证失败：请检查代码中的 AppID 和 AppKey 是否填写正确");
      } else {
        setError("数据获取失败，请检查网络");
      }
    } finally {
      setLoading(false);
    }
  };

  // Load data once SDK is ready
  useEffect(() => {
    if (isSDKLoaded) {
      fetchPackages();
    }
  }, [isSDKLoaded]);

  // --- Helper: Toast ---
  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(null), 2000);
  };

  // --- Actions ---
  const handleAddPackage = async (e) => {
    e.preventDefault();
    if (!trackingNum.trim() || !itemName.trim() || !window.AV) return;

    try {
      const Package = window.AV.Object.extend("Package");
      const pkg = new Package();
      pkg.set("trackingNum", trackingNum);
      pkg.set("itemName", itemName);
      pkg.set("recipient", recipient);
      pkg.set("sender", sender);
      pkg.set("status", "pending");

      await pkg.save();

      setTrackingNum("");
      setItemName("");
      setRecipient("");
      setSender("");
      setIsFormOpen(false);
      showToast("添加成功");
      fetchPackages();
    } catch (error) {
      console.error("Error adding:", error);
      alert("添加失败: " + error.message);
    }
  };

  const toggleStatus = async (pkg, e) => {
    e.stopPropagation();
    if (!window.AV) return;

    const newStatus = pkg.status === "pending" ? "received" : "pending";
    const oldPackages = [...packages];

    // Optimistic update
    setPackages((pkgs) =>
      pkgs.map((p) => {
        if (p.id === pkg.id) return { ...p, status: newStatus };
        return p;
      })
    );

    try {
      const todo = window.AV.Object.createWithoutData("Package", pkg.id);
      todo.set("status", newStatus);
      await todo.save();
      showToast(newStatus === "received" ? "已确认收货" : "已标记为未收");
    } catch (error) {
      console.error("Update error:", error);
      setPackages(oldPackages);
      showToast("操作失败，请重试");
    }
  };

  const handleDelete = async (id) => {
    if (!window.AV) return;
    try {
      const todo = window.AV.Object.createWithoutData("Package", id);
      await todo.destroy();
      setDeleteConfirmId(null);
      showToast("已删除记录");
      setPackages((prev) => prev.filter((p) => p.id !== id));
    } catch (error) {
      console.error("Delete error:", error);
      alert("删除失败");
    }
  };

  const copyToClipboard = (text, e) => {
    e.stopPropagation();
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand("copy");
      showToast("单号已复制");
    } catch (err) {
      console.error("Unable to copy", err);
    }
    document.body.removeChild(textArea);
  };

  // --- Stats & Filter ---
  const filteredPackages = useMemo(() => {
    return packages.filter((pkg) => {
      const matchesSearch =
        pkg.trackingNum.toLowerCase().includes(searchTerm.toLowerCase()) ||
        pkg.itemName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (pkg.recipient &&
          pkg.recipient.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (pkg.sender &&
          pkg.sender.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesFilter =
        filterStatus === "all" ? true : pkg.status === filterStatus;

      return matchesSearch && matchesFilter;
    });
  }, [packages, searchTerm, filterStatus]);

  const stats = useMemo(() => {
    const pending = packages.filter((p) => p.status === "pending").length;
    const received = packages.filter((p) => p.status === "received").length;
    return { pending, received };
  }, [packages]);

  // --- UI Components ---

  // Initial Loading State
  if (!isSDKLoaded || (loading && packages.length === 0)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="flex flex-col items-center gap-4 p-6 bg-white rounded-2xl shadow-sm">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
          <div className="text-center">
            <p className="text-gray-600 font-medium">
              {isSDKLoaded
                ? "正在同步云端数据..."
                : "正在连接 LeanCloud 服务..."}
            </p>
            <p className="text-gray-400 text-xs mt-1">这通常需要几秒钟</p>
          </div>
        </div>
      </div>
    );
  }

  // Error State
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 px-4">
        <div className="text-center p-8 bg-white rounded-3xl shadow-lg max-w-sm w-full">
          <div className="bg-red-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h3 className="text-xl font-bold text-gray-800 mb-2">连接遇到问题</h3>
          <p className="text-gray-500 mb-8 text-sm leading-relaxed">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full px-4 py-3.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
          >
            刷新页面重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24 font-sans text-gray-900 selection:bg-indigo-100">
      {/* Toast */}
      {toast && (
        <div className="fixed top-24 left-1/2 transform -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-2 duration-300 w-auto whitespace-nowrap">
          <div className="bg-gray-900/90 backdrop-blur-sm text-white px-5 py-2.5 rounded-full shadow-xl text-sm font-medium flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            {toast}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white/80 backdrop-blur-xl sticky top-0 z-10 border-b border-gray-200/50 transition-all">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center mb-5">
            <h1 className="text-xl font-extrabold flex items-center text-gray-800 tracking-tight">
              <div className="bg-indigo-600 p-2 rounded-xl mr-3 shadow-sm">
                <Package className="w-5 h-5 text-white" />
              </div>
              收发小助手
            </h1>
            <button
              onClick={fetchPackages}
              className="p-2.5 bg-white border border-gray-200 rounded-full hover:bg-gray-50 active:scale-95 transition-all shadow-sm text-gray-500 hover:text-indigo-600"
              title="刷新列表"
            >
              <RefreshCw
                className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
              />
            </button>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() =>
                setFilterStatus(filterStatus === "pending" ? "all" : "pending")
              }
              className={`relative overflow-hidden p-4 rounded-2xl border transition-all duration-300 text-left group ${
                filterStatus === "pending"
                  ? "bg-gradient-to-br from-orange-50 to-white border-orange-200 ring-2 ring-orange-100 shadow-md"
                  : "bg-white border-gray-100 hover:border-orange-200 hover:shadow-md"
              }`}
            >
              <div className="absolute right-[-12px] top-[-12px] opacity-10 group-hover:opacity-20 transition-opacity transform group-hover:scale-110 duration-300">
                <Clock className="w-20 h-20 text-orange-500" />
              </div>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                待收货
              </span>
              <div className="flex items-baseline mt-1 gap-1.5">
                <span
                  className={`text-3xl font-black tracking-tight ${
                    filterStatus === "pending"
                      ? "text-orange-500"
                      : "text-gray-800"
                  }`}
                >
                  {stats.pending}
                </span>
                <span className="text-xs text-gray-400 font-medium">件</span>
              </div>
            </button>

            <button
              onClick={() =>
                setFilterStatus(
                  filterStatus === "received" ? "all" : "received"
                )
              }
              className={`relative overflow-hidden p-4 rounded-2xl border transition-all duration-300 text-left group ${
                filterStatus === "received"
                  ? "bg-gradient-to-br from-emerald-50 to-white border-emerald-200 ring-2 ring-emerald-100 shadow-md"
                  : "bg-white border-gray-100 hover:border-emerald-200 hover:shadow-md"
              }`}
            >
              <div className="absolute right-[-12px] top-[-12px] opacity-10 group-hover:opacity-20 transition-opacity transform group-hover:scale-110 duration-300">
                <CheckCircle2 className="w-20 h-20 text-emerald-500" />
              </div>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                已签收
              </span>
              <div className="flex items-baseline mt-1 gap-1.5">
                <span
                  className={`text-3xl font-black tracking-tight ${
                    filterStatus === "received"
                      ? "text-emerald-500"
                      : "text-gray-800"
                  }`}
                >
                  {stats.received}
                </span>
                <span className="text-xs text-gray-400 font-medium">件</span>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-2xl mx-auto px-4 mt-6 space-y-6">
        {/* Search Bar */}
        <div className="relative group">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400 group-focus-within:text-indigo-500 transition-colors duration-300" />
          </div>
          <input
            type="text"
            placeholder="搜索单号、物品或姓名..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="block w-full pl-11 pr-4 py-4 border-none rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:shadow-lg focus:shadow-indigo-500/5 transition-all duration-300 text-base"
          />
        </div>

        {/* Package List */}
        <div className="space-y-4">
          {filteredPackages.map((pkg) => (
            <div
              key={pkg.id}
              className={`group bg-white rounded-2xl p-5 border transition-all duration-300 relative overflow-hidden ${
                pkg.status === "pending"
                  ? "border-gray-100 shadow-sm hover:shadow-lg hover:shadow-indigo-100/50 hover:border-indigo-100"
                  : "border-transparent bg-gray-50/50 opacity-75 hover:opacity-100"
              }`}
            >
              {/* Status Indicator Stripe */}
              <div
                className={`absolute left-0 top-0 bottom-0 w-1.5 transition-colors ${
                  pkg.status === "pending" ? "bg-orange-400" : "bg-gray-200"
                }`}
              ></div>

              <div className="pl-3 flex flex-col gap-3">
                {/* Header Row */}
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0 mr-3">
                    <h3
                      className={`text-lg font-bold leading-tight mb-2 truncate ${
                        pkg.status === "received"
                          ? "text-gray-400 line-through decoration-gray-300"
                          : "text-gray-800"
                      }`}
                    >
                      {pkg.itemName}
                    </h3>
                    <div
                      onClick={(e) => copyToClipboard(pkg.trackingNum, e)}
                      className="inline-flex items-center gap-2 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors group/pill border border-gray-200/50"
                    >
                      <span className="text-xs font-mono text-gray-600 font-semibold tracking-wide truncate max-w-[150px] sm:max-w-none">
                        {pkg.trackingNum}
                      </span>
                      <Copy className="w-3.5 h-3.5 text-gray-400 group-hover/pill:text-indigo-500 transition-colors" />
                    </div>
                  </div>

                  <button
                    onClick={(e) => toggleStatus(pkg, e)}
                    className={`flex-shrink-0 rounded-full p-2.5 transition-all duration-300 shadow-sm ${
                      pkg.status === "pending"
                        ? "bg-orange-50 text-orange-500 hover:bg-orange-500 hover:text-white hover:shadow-orange-200 ring-1 ring-orange-100"
                        : "bg-emerald-50 text-emerald-500 hover:bg-emerald-500 hover:text-white ring-1 ring-emerald-100"
                    }`}
                    title={
                      pkg.status === "pending" ? "点击确认收货" : "点击标记未收"
                    }
                  >
                    {pkg.status === "pending" ? (
                      <Truck className="w-5 h-5" />
                    ) : (
                      <CheckCircle2 className="w-5 h-5" />
                    )}
                  </button>
                </div>

                {/* Metadata Row */}
                {(pkg.recipient || pkg.sender) && (
                  <div className="flex flex-wrap gap-2">
                    {pkg.recipient && (
                      <span className="inline-flex items-center text-xs font-semibold text-gray-600 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-100/50">
                        <User className="w-3 h-3 mr-1.5 text-indigo-500" />
                        {pkg.recipient}
                      </span>
                    )}
                    {pkg.sender && (
                      <span className="inline-flex items-center text-xs font-semibold text-gray-600 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-100/50">
                        <Box className="w-3 h-3 mr-1.5 text-blue-500" />
                        {pkg.sender}
                      </span>
                    )}
                  </div>
                )}

                {/* Footer Row */}
                <div className="flex items-center justify-between pt-3 mt-1 border-t border-gray-50">
                  <div className="text-[11px] text-gray-400 font-medium flex items-center">
                    {pkg.createdAt
                      ? new Date(pkg.createdAt).toLocaleDateString()
                      : ""}
                    {pkg.status === "received" && (
                      <span className="ml-2 text-emerald-500">已完成</span>
                    )}
                  </div>

                  <div className="flex items-center">
                    {deleteConfirmId === pkg.id ? (
                      <div className="flex items-center gap-3 animate-in fade-in slide-in-from-right-4 duration-200 bg-red-50 px-3 py-1 rounded-full">
                        <span className="text-xs text-red-500 font-bold">
                          确定删除?
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(pkg.id);
                          }}
                          className="text-xs font-bold text-red-600 hover:underline"
                        >
                          是
                        </button>
                        <div className="w-px h-3 bg-red-200"></div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmId(null);
                          }}
                          className="p-0.5 text-red-400 hover:text-red-600"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmId(pkg.id);
                        }}
                        className="text-gray-300 hover:text-red-400 transition-colors p-2 hover:bg-red-50 rounded-full"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
          <div className="h-24"></div> {/* Bottom Spacer */}
        </div>
      </div>

      {/* FAB (Floating Action Button) */}
      <button
        onClick={() => setIsFormOpen(true)}
        className="fixed bottom-8 right-6 bg-indigo-600 text-white w-16 h-16 rounded-full shadow-2xl shadow-indigo-500/40 hover:bg-indigo-700 hover:scale-110 hover:-translate-y-1 transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-indigo-500/30 z-20 flex items-center justify-center group"
      >
        <Plus className="w-8 h-8 group-hover:rotate-90 transition-transform duration-300" />
      </button>

      {/* Add Modal - Bottom Sheet */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div
            className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-300"
            onClick={() => setIsFormOpen(false)}
          ></div>

          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 sm:p-8 shadow-2xl relative z-10 animate-in slide-in-from-bottom duration-300 flex flex-col max-h-[90vh]">
            {/* Drag Handle */}
            <div className="w-16 h-1.5 bg-gray-200 rounded-full mx-auto mb-8 sm:hidden opacity-50"></div>

            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-extrabold text-gray-800">
                录入新快递
              </h2>
              <button
                onClick={() => setIsFormOpen(false)}
                className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors text-gray-500"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form
              onSubmit={handleAddPackage}
              className="space-y-6 overflow-y-auto pb-4"
            >
              <div className="space-y-1.5">
                <label className="block text-sm font-bold text-gray-700 ml-1">
                  快递单号 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={trackingNum}
                  onChange={(e) => setTrackingNum(e.target.value)}
                  placeholder="点击此处，支持键盘扫描..."
                  className="block w-full p-4 bg-gray-50 border border-transparent rounded-2xl focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all font-mono text-lg tracking-wide placeholder-gray-400 shadow-sm"
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-bold text-gray-700 ml-1">
                  物品描述 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  placeholder="例如：红色衣服"
                  className="block w-full p-4 bg-gray-50 border border-transparent rounded-2xl focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all placeholder-gray-400 shadow-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-bold text-gray-700 ml-1">
                    收件人
                  </label>
                  <input
                    type="text"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    placeholder="选填"
                    className="block w-full p-3.5 bg-gray-50 border border-transparent rounded-2xl focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all text-sm shadow-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-bold text-gray-700 ml-1">
                    发件人/备注
                  </label>
                  <input
                    type="text"
                    value={sender}
                    onChange={(e) => setSender(e.target.value)}
                    placeholder="选填"
                    className="block w-full p-3.5 bg-gray-50 border border-transparent rounded-2xl focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all text-sm shadow-sm"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={!trackingNum || !itemName}
                className="w-full bg-indigo-600 text-white py-4.5 rounded-2xl font-bold text-lg shadow-xl shadow-indigo-500/30 hover:bg-indigo-700 hover:shadow-indigo-600/40 hover:-translate-y-0.5 active:scale-[0.98] disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none disabled:cursor-not-allowed disabled:translate-y-0 mt-4 transition-all"
              >
                确认添加
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
