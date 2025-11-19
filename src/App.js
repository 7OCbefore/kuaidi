import React, { useState, useEffect, useMemo } from 'react';
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
  AlertCircle
} from 'lucide-react';

// --- Supabase 配置 ---
const SUPABASE_URL = "https://pipclbhznsjiftaijztl.supabase.co";
const SUPABASE_KEY = "sb_publishable_NVrCIbylU2uBdojQ3DUGbQ_c00IKvFv";

export default function ParcelTracker() {
  const [isReady, setIsReady] = useState(false);
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState('');
  
  // 配置检查状态
  const [configError, setConfigError] = useState(false);

  // Form States
  const [trackingNum, setTrackingNum] = useState('');
  const [itemName, setItemName] = useState('');
  const [recipient, setRecipient] = useState('');
  const [sender, setSender] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);

  // UI States
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  
  // Toast State: null | { msg: string, type: 'success' | 'error' }
  const [toast, setToast] = useState(null);

  // --- 0. 自动加载样式引擎 (Tailwind CSS) ---
  // 这段代码会自动去下载样式包，解决“页面简陋”的问题
  useEffect(() => {
    if (!document.getElementById('tailwind-script')) {
      const script = document.createElement('script');
      script.id = 'tailwind-script';
      script.src = "https://cdn.tailwindcss.com";
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  // --- 1. 初始化 Supabase & 用户身份 ---
  useEffect(() => {
    // 1.1 检查配置是否已替换
    if (SUPABASE_URL.includes("你的项目ID") || SUPABASE_KEY.includes("你的AnonKey")) {
      setConfigError(true);
      setLoading(false);
      return;
    }

    // 1.2 用户指纹 (模拟账户)
    let storedUserId = localStorage.getItem('parcel_user_id');
    if (!storedUserId) {
      storedUserId = 'user_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
      localStorage.setItem('parcel_user_id', storedUserId);
    }
    setUserId(storedUserId);

    // 1.3 加载 SDK
    if (window.supabase) {
      setIsReady(true);
    } else {
      const script = document.createElement('script');
      // 使用 jsdelivr CDN 加速加载
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      script.async = true;
      script.onload = () => setIsReady(true);
      script.onerror = () => showToast("Supabase SDK 加载失败，请检查网络", 'error');
      document.body.appendChild(script);
    }
  }, []);

  // --- 2. 数据同步 ---
  const fetchPackages = async () => {
    if (!isReady || !userId || configError) return;
    setLoading(true);
    
    try {
      const { createClient } = window.supabase;
      const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

      const { data, error } = await supabase
        .from('packages')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPackages(data || []);
    } catch (err) {
      console.error("Fetch error detailed:", err);
      // 智能判断错误类型
      if (err.message === "Failed to fetch") {
        showToast("连接数据库失败 (网络阻断)", 'error');
      } else {
        showToast(`数据错误: ${err.message}`, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isReady && userId) {
      fetchPackages();
    }
  }, [isReady, userId]);

  // --- Helper: Toast (修复了图标显示逻辑) ---
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // --- Actions ---
  const handleAddPackage = async (e) => {
    e.preventDefault();
    if (!trackingNum.trim() || !itemName.trim() || !isReady) return;

    try {
      const { createClient } = window.supabase;
      const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

      const { error } = await supabase
        .from('packages')
        .insert([
          { 
            user_id: userId, 
            tracking_num: trackingNum, 
            item_name: itemName,
            recipient: recipient,
            sender: sender,
            status: 'pending'
          }
        ]);

      if (error) throw error;

      setTrackingNum('');
      setItemName('');
      setRecipient('');
      setSender('');
      setIsFormOpen(false);
      showToast("添加成功", 'success');
      fetchPackages();
    } catch (error) {
      console.error("Error adding:", error);
      showToast(`添加失败: ${error.message}`, 'error');
    }
  };

  const toggleStatus = async (pkg, e) => {
    e.stopPropagation();
    if (!isReady) return;

    const newStatus = pkg.status === 'pending' ? 'received' : 'pending';
    const oldPackages = [...packages];
    setPackages(pkgs => pkgs.map(p => p.id === pkg.id ? { ...p, status: newStatus } : p));

    try {
      const { createClient } = window.supabase;
      const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

      const { error } = await supabase
        .from('packages')
        .update({ status: newStatus })
        .eq('id', pkg.id);

      if (error) throw error;
      showToast(newStatus === 'received' ? "已确认收货" : "已标记为未收", 'success');
    } catch (error) {
      setPackages(oldPackages);
      showToast("操作失败，请检查网络", 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!isReady) return;
    try {
      const { createClient } = window.supabase;
      const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

      const { error } = await supabase
        .from('packages')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setDeleteConfirmId(null);
      setPackages(prev => prev.filter(p => p.id !== id));
      showToast("已删除", 'success');
    } catch (error) {
      showToast("删除失败", 'error');
    }
  };

  const copyToClipboard = (text, e) => {
    e.stopPropagation();
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      showToast("单号已复制", 'success');
    } catch (err) {
      console.error('Unable to copy', err);
    }
    document.body.removeChild(textArea);
  };

  // --- Stats & Filter ---
  const filteredPackages = useMemo(() => {
    return packages.filter(pkg => {
      const matchesSearch = 
        pkg.tracking_num?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        pkg.item_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (pkg.recipient && pkg.recipient.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (pkg.sender && pkg.sender.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesFilter = 
        filterStatus === 'all' ? true : pkg.status === filterStatus;

      return matchesSearch && matchesFilter;
    });
  }, [packages, searchTerm, filterStatus]);

  const stats = useMemo(() => {
    const pending = packages.filter(p => p.status === 'pending').length;
    const received = packages.filter(p => p.status === 'received').length;
    return { pending, received };
  }, [packages]);

  // --- UI Components ---

  // 0. 配置未填写错误
  if (configError) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-red-50 px-4">
        <div className="bg-white p-6 rounded-2xl shadow-lg max-w-md w-full text-center">
          <div className="bg-red-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">配置尚未完成</h2>
          <p className="text-gray-600 mb-4 text-sm text-left">
            你还没有在代码中填入 Supabase 的连接信息。请回到代码编辑器，找到 <code>const SUPABASE_URL</code> 这一行。
          </p>
          <div className="bg-gray-100 p-3 rounded text-xs font-mono text-left text-gray-500 break-all">
             // 请填入你在 Supabase 设置里获取的 Key<br/>
             const SUPABASE_URL = "https://....";<br/>
             const SUPABASE_KEY = "eyJh....";
          </div>
        </div>
      </div>
    );
  }

  // 1. 加载中
  if (loading && packages.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="flex flex-col items-center gap-3">
           <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
           <p className="text-gray-400 text-sm">正在连接云端...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24 font-sans text-gray-900 selection:bg-indigo-100">
      {/* Toast - 动态样式 - 修复了永远显示对勾的问题 */}
      {toast && (
        <div className="fixed top-24 left-1/2 transform -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-2 duration-300 w-auto whitespace-nowrap">
          <div className={`backdrop-blur-sm px-5 py-2.5 rounded-full shadow-xl text-sm font-medium flex items-center gap-2.5 border ${
            toast.type === 'error' 
              ? 'bg-red-50/95 text-red-800 border-red-200' 
              : 'bg-gray-900/90 text-white border-transparent'
          }`}>
            {toast.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-red-500" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-green-400" />
            )}
            {toast.msg}
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
            <button onClick={fetchPackages} className="p-2.5 bg-white border border-gray-200 rounded-full text-gray-500 hover:text-indigo-600">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={() => setFilterStatus(filterStatus === 'pending' ? 'all' : 'pending')}
              className={`relative overflow-hidden p-4 rounded-2xl border transition-all duration-300 text-left group ${
                filterStatus === 'pending' 
                  ? 'bg-gradient-to-br from-orange-50 to-white border-orange-200 ring-2 ring-orange-100 shadow-md' 
                  : 'bg-white border-gray-100 hover:border-orange-200 hover:shadow-md'
              }`}
            >
              <div className="absolute right-[-12px] top-[-12px] opacity-10 group-hover:opacity-20 transition-opacity transform group-hover:scale-110 duration-300">
                <Clock className="w-20 h-20 text-orange-500" />
              </div>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">待收货</span>
              <div className="flex items-baseline mt-1 gap-1.5">
                <span className={`text-3xl font-black tracking-tight ${filterStatus === 'pending' ? 'text-orange-500' : 'text-gray-800'}`}>
                  {stats.pending}
                </span>
                <span className="text-xs text-gray-400 font-medium">件</span>
              </div>
            </button>

            <button 
              onClick={() => setFilterStatus(filterStatus === 'received' ? 'all' : 'received')}
              className={`relative overflow-hidden p-4 rounded-2xl border transition-all duration-300 text-left group ${
                filterStatus === 'received' 
                  ? 'bg-gradient-to-br from-emerald-50 to-white border-emerald-200 ring-2 ring-emerald-100 shadow-md' 
                  : 'bg-white border-gray-100 hover:border-emerald-200 hover:shadow-md'
              }`}
            >
              <div className="absolute right-[-12px] top-[-12px] opacity-10 group-hover:opacity-20 transition-opacity transform group-hover:scale-110 duration-300">
                <CheckCircle2 className="w-20 h-20 text-emerald-500" />
              </div>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">已签收</span>
              <div className="flex items-baseline mt-1 gap-1.5">
                <span className={`text-3xl font-black tracking-tight ${filterStatus === 'received' ? 'text-emerald-500' : 'text-gray-800'}`}>
                  {stats.received}
                </span>
                <span className="text-xs text-gray-400 font-medium">件</span>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="max-w-2xl mx-auto px-4 mt-6 space-y-6">
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

        {/* List */}
        <div className="space-y-4">
          {filteredPackages.map(pkg => (
            <div 
              key={pkg.id} 
              className={`group bg-white rounded-2xl p-5 border transition-all duration-300 relative overflow-hidden ${
                pkg.status === 'pending' 
                  ? 'border-gray-100 shadow-sm hover:shadow-lg hover:shadow-indigo-100/50 hover:border-indigo-100' 
                  : 'border-transparent bg-gray-50/50 opacity-75 hover:opacity-100'
              }`}
            >
              <div className={`absolute left-0 top-0 bottom-0 w-1.5 transition-colors ${pkg.status === 'pending' ? 'bg-orange-400' : 'bg-gray-200'}`}></div>

              <div className="pl-3 flex flex-col gap-3">
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0 mr-3">
                    <h3 className={`text-lg font-bold leading-tight mb-2 truncate ${pkg.status === 'received' ? 'text-gray-400 line-through decoration-gray-300' : 'text-gray-800'}`}>
                      {pkg.item_name}
                    </h3>
                    <div 
                      onClick={(e) => copyToClipboard(pkg.tracking_num, e)}
                      className="inline-flex items-center gap-2 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors group/pill border border-gray-200/50"
                    >
                      <span className="text-xs font-mono text-gray-600 font-semibold tracking-wide truncate max-w-[150px] sm:max-w-none">{pkg.tracking_num}</span>
                      <Copy className="w-3.5 h-3.5 text-gray-400 group-hover/pill:text-indigo-500 transition-colors" />
                    </div>
                  </div>
                  
                  <button
                    onClick={(e) => toggleStatus(pkg, e)}
                    className={`flex-shrink-0 rounded-full p-2.5 transition-all duration-300 shadow-sm ${
                      pkg.status === 'pending'
                        ? 'bg-orange-50 text-orange-500 hover:bg-orange-500 hover:text-white hover:shadow-orange-200 ring-1 ring-orange-100'
                        : 'bg-emerald-50 text-emerald-500 hover:bg-emerald-500 hover:text-white ring-1 ring-emerald-100'
                    }`}
                  >
                    {pkg.status === 'pending' ? <Truck className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                  </button>
                </div>

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

                <div className="flex items-center justify-between pt-3 mt-1 border-t border-gray-50">
                  <div className="text-[11px] text-gray-400 font-medium flex items-center">
                    {pkg.created_at ? new Date(pkg.created_at).toLocaleDateString() : ''}
                    {pkg.status === 'received' && <span className="ml-2 text-emerald-500">已完成</span>}
                  </div>
                  
                  <div className="flex items-center">
                    {deleteConfirmId === pkg.id ? (
                       <div className="flex items-center gap-3 animate-in fade-in slide-in-from-right-4 duration-200 bg-red-50 px-3 py-1 rounded-full">
                         <span className="text-xs text-red-500 font-bold">删除?</span>
                         <button onClick={(e) => { e.stopPropagation(); handleDelete(pkg.id); }} className="text-xs font-bold text-red-600 hover:underline">是</button>
                         <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(null); }} className="p-0.5 text-red-400"><X className="w-3.5 h-3.5" /></button>
                       </div>
                     ) : (
                       <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(pkg.id); }} className="text-gray-300 hover:text-red-400 transition-colors p-2 hover:bg-red-50 rounded-full">
                        <Trash2 className="w-4 h-4" />
                      </button>
                     )}
                  </div>
                </div>
              </div>
            </div>
          ))}
          <div className="h-24"></div>
        </div>
      </div>

      {/* FAB */}
      <button onClick={() => setIsFormOpen(true)} className="fixed bottom-8 right-6 bg-indigo-600 text-white w-16 h-16 rounded-full shadow-2xl shadow-indigo-500/40 hover:bg-indigo-700 hover:scale-110 hover:-translate-y-1 transition-all z-20 flex items-center justify-center group">
        <Plus className="w-8 h-8 group-hover:rotate-90 transition-transform duration-300" />
      </button>

      {/* Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={() => setIsFormOpen(false)}></div>
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 sm:p-8 shadow-2xl relative z-10 animate-in slide-in-from-bottom duration-300 flex flex-col max-h-[90vh]">
            <div className="w-16 h-1.5 bg-gray-200 rounded-full mx-auto mb-8 sm:hidden opacity-50"></div>
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-extrabold text-gray-800">录入新快递</h2>
              <button onClick={() => setIsFormOpen(false)} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors text-gray-500"><X className="w-6 h-6" /></button>
            </div>
            <form onSubmit={handleAddPackage} className="space-y-6 overflow-y-auto pb-4">
              <div className="space-y-1.5"><label className="block text-sm font-bold text-gray-700 ml-1">快递单号 *</label><input type="text" value={trackingNum} onChange={(e) => setTrackingNum(e.target.value)} className="block w-full p-4 bg-gray-50 border border-transparent rounded-2xl focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none font-mono text-lg" placeholder="点击扫描..." autoFocus /></div>
              <div className="space-y-1.5"><label className="block text-sm font-bold text-gray-700 ml-1">物品描述 *</label><input type="text" value={itemName} onChange={(e) => setItemName(e.target.value)} className="block w-full p-4 bg-gray-50 border border-transparent rounded-2xl focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none" placeholder="例如：文件" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><label className="block text-sm font-bold text-gray-700 ml-1">收件人</label><input type="text" value={recipient} onChange={(e) => setRecipient(e.target.value)} className="block w-full p-3.5 bg-gray-50 rounded-2xl outline-none text-sm" placeholder="选填" /></div>
                <div className="space-y-1.5"><label className="block text-sm font-bold text-gray-700 ml-1">发件人</label><input type="text" value={sender} onChange={(e) => setSender(e.target.value)} className="block w-full p-3.5 bg-gray-50 rounded-2xl outline-none text-sm" placeholder="选填" /></div>
              </div>
              <button type="submit" disabled={!trackingNum || !itemName} className="w-full bg-indigo-600 text-white py-4.5 rounded-2xl font-bold text-lg mt-4 disabled:bg-gray-100">确认添加</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
