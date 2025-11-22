import React, { useState, useEffect, useMemo } from 'react';
import { 
  Package, Plus, Search, Truck, CheckCircle2, 
  Clock, User, Trash2, X, WifiOff, Cloud, 
  Download, BarChart3, ChevronLeft, TrendingUp, Send, Copy, AlertCircle
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';

// --- Supabase 配置 ---
const SUPABASE_URL = "https://pipclbhznsjiftaijztl.supabase.co";
const SUPABASE_KEY = "sb_publishable_NVrCIbylU2uBdojQ3DUGbQ_c00IKvFv";

export default function ParcelTracker() {
  // --- 核心状态 ---
  const [householdId, setHouseholdId] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginInput, setLoginInput] = useState('');
  
  const [products, setProducts] = useState([]); 
  const [items, setItems] = useState([]);       
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('dashboard'); 
  const [isOffline, setIsOffline] = useState(false);
  const [isSupabaseReady, setIsSupabaseReady] = useState(false);

  const [selectedStatId, setSelectedStatId] = useState(null);
  const [toast, setToast] = useState(null);

  // 表单状态
  const [newItem, setNewItem] = useState({
    productName: '', costPrice: '', quantity: 1, supplier: '', recipient: '', trackingNumber: '', status: 'ordered', productId: null
  });
  
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // 0. 自动加载样式
  useEffect(() => {
    if (!document.getElementById('tailwind-script')) {
      const script = document.createElement('script');
      script.id = 'tailwind-script';
      script.src = "https://cdn.tailwindcss.com";
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  // 1. 初始化
  useEffect(() => {
    const storedId = localStorage.getItem('parcel_household_id');
    if (storedId) {
      setHouseholdId(storedId);
      setIsLoggedIn(true);
    }

    if (window.supabase) {
      setIsSupabaseReady(true);
    } else {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      script.async = true;
      script.onload = () => setIsSupabaseReady(true);
      script.onerror = () => setIsOffline(true);
      document.body.appendChild(script);
    }
  }, []);

  // 2. 数据获取 (带防抖和错误处理)
  const fetchData = async () => {
    if (!householdId) return;
    
    // 优先加载本地缓存，确保页面不白屏
    const localItems = localStorage.getItem(`parcel_data_${householdId}`);
    if (localItems) setItems(JSON.parse(localItems));

    if (isSupabaseReady && !isOffline) {
      try {
        const { createClient } = window.supabase;
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        
        const { data: prodData } = await supabase.from('products').select('*').eq('user_id', householdId);
        if (prodData) setProducts(prodData);

        const { data: pkgData, error } = await supabase
          .from('packages')
          .select('*')
          .eq('user_id', householdId)
          .order('created_at', { ascending: false });

        if (error) throw error;

        const formattedItems = pkgData.map(d => ({
          id: d.id,
          productId: d.product_id,
          productName: d.product_name || '未知物品', // 防止空名导致的渲染错误
          costPrice: Number(d.cost_price) || 0,
          quantity: Number(d.quantity) || 1,
          supplier: d.supplier || '',
          recipient: d.recipient || '',
          trackingNumber: d.tracking_number || '',
          status: d.status || 'ordered',
          createdAt: d.created_at || new Date().toISOString()
        }));

        setItems(formattedItems);
        localStorage.setItem(`parcel_data_${householdId}`, JSON.stringify(formattedItems));
      } catch (err) {
        console.warn("云端同步失败，切换本地模式", err);
        setIsOffline(true);
      }
    }
  };

  useEffect(() => {
    if (isLoggedIn && householdId && (isSupabaseReady || isOffline)) {
      fetchData();
    }
  }, [isLoggedIn, householdId, isSupabaseReady, isOffline]);

  // --- 3. 智能录入 ---
  const handleNameChange = (val) => {
    setNewItem(prev => ({ ...prev, productName: val, productId: null }));
    if (val.trim()) {
      const matches = products.filter(p => p.name && p.name.toLowerCase().includes(val.toLowerCase()));
      setSuggestions(matches);
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  };

  const selectSuggestion = (prod) => {
    setNewItem(prev => ({
      ...prev,
      productName: prod.name,
      productId: prod.id,
      costPrice: prod.last_price || ''
    }));
    setShowSuggestions(false);
  };

  // --- 4. 提交保存 (修复了这里可能导致的崩溃) ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newItem.productName) return;

    const tempId = Date.now(); // 生成本地临时ID
    const timestamp = new Date().toISOString();
    
    // 构造新数据对象
    const newItemData = {
      id: tempId, // 先用临时ID，确保列表能渲染
      ...newItem,
      costPrice: Number(newItem.costPrice) || 0,
      quantity: Number(newItem.quantity) || 1,
      createdAt: timestamp
    };

    // 1. 乐观更新：立刻更新界面，不用等服务器
    const updatedItems = [newItemData, ...items];
    setItems(updatedItems);
    localStorage.setItem(`parcel_data_${householdId}`, JSON.stringify(updatedItems));
    
    setView('dashboard'); // 立即切回首页
    showToast("已保存", "success");

    // 2. 异步后台上传
    if (!isOffline && isSupabaseReady) {
      try {
        const { createClient } = window.supabase;
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        
        let finalProductId = newItem.productId;

        // 处理商品库
        if (!finalProductId && newItem.costPrice) {
          const existing = products.find(p => p.name === newItem.productName);
          if (existing) {
            finalProductId = existing.id;
          } else {
            const { data: newProd } = await supabase.from('products').insert([{
              user_id: householdId,
              name: newItem.productName,
              last_price: newItem.costPrice,
              total_quantity: newItem.quantity
            }]).select().single();
            if (newProd) finalProductId = newProd.id;
          }
        }

        // 上传包裹
        await supabase.from('packages').insert([{
          user_id: householdId,
          product_id: finalProductId,
          product_name: newItem.productName,
          cost_price: newItem.costPrice || 0,
          quantity: newItem.quantity,
          supplier: newItem.supplier,
          recipient: newItem.recipient,
          tracking_number: newItem.trackingNumber,
          status: 'ordered',
          created_at: timestamp
        }]);

        // 静默刷新以获取真实ID
        fetchData();
        
      } catch (err) {
        console.error("上传失败:", err);
        showToast("已存入本地 (云端同步失败)", "error");
      }
    }

    // 重置表单
    setNewItem({ productName: '', costPrice: '', quantity: 1, supplier: '', recipient: '', trackingNumber: '', status: 'ordered', productId: null });
  };

  // --- 杂项 ---
  const showToast = (msg, type = 'success') => {
    setToast({msg, type});
    setTimeout(() => setToast(null), 2000);
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (!loginInput.trim()) return;
    localStorage.setItem('parcel_household_id', loginInput.trim());
    setHouseholdId(loginInput.trim());
    setIsLoggedIn(true);
  };

  const handleStatusUpdate = async (id, status) => {
    setItems(prev => prev.map(i => i.id === id ? {...i, status} : i));
    if (isSupabaseReady) {
      const { createClient } = window.supabase;
      const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
      await supabase.from('packages').update({ status }).eq('id', id);
    }
  };

  const handleDelete = async (id) => {
    if(!window.confirm('确定删除?')) return;
    setItems(prev => prev.filter(i => i.id !== id));
    if (isSupabaseReady) {
      const { createClient } = window.supabase;
      const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
      await supabase.from('packages').delete().eq('id', id);
    }
  }

  const copyToClipboard = (text) => {
    if (!text) return;
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try { document.execCommand('copy'); showToast("已复制"); } catch (err) { console.error(err); }
    document.body.removeChild(textArea);
  };

  const handleExport = () => {
    if (items.length === 0) return alert("暂无数据");
    const headers = "物品名称,收件人,发件人,单号,价值(元),数量,总价,状态,日期\n";
    const rows = items.map(item => {
      const total = (parseFloat(item.costPrice || 0) * parseFloat(item.quantity || 0)).toFixed(2);
      const statusMap = { ordered: '待发货', shipped: '运输中', received: '已签收' };
      const time = item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '';
      const safeName = `"${(item.productName || '').replace(/"/g, '""')}"`;
      const safeTrack = item.trackingNumber ? `"\t${item.trackingNumber}"` : '';
      return `${safeName},${item.recipient || ''},${item.supplier || ''},${safeTrack},${item.costPrice},${item.quantity},${total},${statusMap[item.status]},${time}`;
    }).join("\n");
    const blob = new Blob(["\ufeff" + headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `快递记录.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- 统计 ---
  const chartData = useMemo(() => {
    if (!selectedStatId) return [];
    return items
      .filter(i => i.productId === selectedStatId || i.productName === selectedStatId)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .map(i => ({
        date: new Date(i.createdAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }),
        price: i.costPrice,
      }));
  }, [items, selectedStatId]);

  const filteredItems = items.filter(item => {
    const term = searchTerm.toLowerCase();
    return (item.productName || '').toLowerCase().includes(term) || 
           (item.trackingNumber || '').toLowerCase().includes(term) || 
           (item.recipient || '').toLowerCase().includes(term);
  });

  const StatusBadge = ({ status }) => {
    const map = { ordered: { color: "bg-orange-100 text-orange-700 border-orange-200", text: "待收货" }, shipped: { color: "bg-blue-100 text-blue-700 border-blue-200", text: "运输中" }, received: { color: "bg-green-100 text-green-700 border-green-200", text: "已签收" } };
    const s = map[status] || map.ordered;
    return <span className={`px-2 py-0.5 rounded-md text-xs font-medium border ${s.color}`}>{s.text}</span>;
  };

  if (!isLoggedIn) return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center px-4 font-sans text-gray-800">
      <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-sm">
        <h1 className="text-2xl font-extrabold text-center mb-6 text-blue-900">快递收发助手</h1>
        <form onSubmit={handleLogin}>
          <input autoFocus type="text" value={loginInput} onChange={(e) => setLoginInput(e.target.value)} placeholder="输入家庭/店铺专属暗号" className="w-full p-3 border-2 border-gray-100 rounded-xl mb-4 focus:border-blue-500 outline-none font-bold text-center" />
          <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700">进入系统</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-24 font-sans text-gray-800">
      {toast && (
        <div className={`fixed top-24 left-1/2 transform -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-2 duration-300 px-4 py-2 rounded-full text-sm font-medium shadow-lg ${toast.type === 'error' ? 'bg-red-500 text-white' : 'bg-gray-800 text-white'}`}>
          {toast.msg}
        </div>
      )}

      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex justify-between items-center">
          <h1 className="text-lg font-bold text-gray-800 flex items-center gap-2"><Truck className="w-6 h-6 text-blue-600" /> 快递助手</h1>
          <div className="text-xs text-gray-400 font-mono bg-gray-100 px-2 py-1 rounded">{householdId}</div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-6">
        {view === 'stats' && (
          <div className="space-y-4">
            {selectedStatId ? (
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 animate-in slide-in-from-right duration-200">
                <button onClick={() => setSelectedStatId(null)} className="flex items-center text-blue-600 font-bold mb-4"><ChevronLeft className="w-5 h-5" /> 返回</button>
                <div className="h-64 w-full mb-6 bg-gray-50 rounded-xl p-2">
                  <ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tick={{fontSize: 10}} /><Tooltip /><Area type="monotone" dataKey="price" stroke="#2563eb" fill="#2563eb" fillOpacity={0.1} strokeWidth={3} /></AreaChart></ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="grid gap-3">
                <h2 className="text-lg font-bold ml-1">收件统计</h2>
                {products.map(prod => (
                  <div key={prod.id} onClick={() => setSelectedStatId(prod.id)} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex justify-between items-center cursor-pointer hover:border-blue-300">
                    <div><div className="font-bold text-gray-800">{prod.name}</div></div>
                    <div className="text-sm font-bold text-blue-600">¥{prod.last_price}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {view === 'add' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-extrabold text-gray-800">录入包裹</h2><button onClick={() => setView('dashboard')} className="p-2 bg-gray-50 rounded-full text-gray-400"><X className="w-5 h-5" /></button></div>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div><label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">快递单号</label><input type="text" className="w-full p-4 bg-gray-50 rounded-xl border-transparent focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none font-mono text-lg" placeholder="点击扫描或粘贴" value={newItem.trackingNumber} onChange={e => setNewItem({...newItem, trackingNumber: e.target.value})} /></div>
              <div className="relative"><label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">物品名称 *</label><input required type="text" className="w-full p-4 bg-gray-50 rounded-xl border-transparent focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="例如：衣服、文件..." value={newItem.productName} onChange={e => handleNameChange(e.target.value)} onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} />{showSuggestions && suggestions.length > 0 && <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">{suggestions.map(s => <div key={s.id} onClick={() => selectSuggestion(s)} className="p-3 hover:bg-blue-50 cursor-pointer border-b border-gray-50 flex justify-between"><span className="font-bold text-gray-700">{s.name}</span><span className="text-xs text-gray-400">价值: ¥{s.last_price}</span></div>)}</div>}</div>
              <div className="grid grid-cols-2 gap-4"><div><label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">收件人</label><input type="text" className="w-full p-3 bg-gray-50 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" value={newItem.recipient} onChange={e => setNewItem({...newItem, recipient: e.target.value})} /></div><div><label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">发件人</label><input type="text" className="w-full p-3 bg-gray-50 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" value={newItem.supplier} onChange={e => setNewItem({...newItem, supplier: e.target.value})} /></div></div>
              <div className="grid grid-cols-2 gap-4"><div><label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">价值 (元)</label><input type="number" className="w-full p-3 bg-gray-50 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" value={newItem.costPrice} onChange={e => setNewItem({...newItem, costPrice: e.target.value})} /></div><div><label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">数量</label><input type="number" className="w-full p-3 bg-gray-50 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" value={newItem.quantity} onChange={e => setNewItem({...newItem, quantity: e.target.value})} /></div></div>
              <button type="submit" className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 mt-4">确认录入</button>
            </form>
          </div>
        )}

        {(view === 'dashboard' || view === 'list') && (
          <>
             {view === 'dashboard' && (
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-orange-50 p-5 rounded-2xl border border-orange-100 flex flex-col items-center justify-center cursor-pointer active:scale-95 transition-transform" onClick={() => setView('list')}><span className="text-orange-400 text-xs font-bold uppercase tracking-wider mb-1">待收包裹</span><span className="text-3xl font-extrabold text-orange-600">{items.filter(i => i.status !== 'received').length}</span></div>
                  <div className="bg-blue-50 p-5 rounded-2xl border border-blue-100 flex flex-col items-center justify-center" onClick={() => setView('stats')}><span className="text-blue-400 text-xs font-bold uppercase tracking-wider mb-1">累计货值</span><span className="text-3xl font-extrabold text-blue-600">¥{items.reduce((a,b)=>a+(b.costPrice*b.quantity),0).toLocaleString()}</span></div>
                </div>
             )}
             {view === 'list' && <div className="relative mb-4"><Search className="absolute left-3 top-3.5 w-5 h-5 text-gray-400"/><input type="text" autoFocus placeholder="搜索..." className="w-full pl-10 p-3 rounded-xl border-none shadow-sm focus:ring-2 focus:ring-blue-500 outline-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>}
             {view === 'dashboard' && <div className="flex justify-end mb-2"><button onClick={handleExport} className="text-xs flex items-center gap-1 bg-white text-gray-600 px-3 py-1.5 rounded-lg border border-gray-200 font-medium hover:bg-gray-50"><Download className="w-3 h-3" /> 导出Excel</button></div>}
             <div className="space-y-4">
               {filteredItems.slice(0, view === 'dashboard' ? 5 : 100).map(item => (
                 <div key={item.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${item.status === 'received' ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'}`}><Package className="w-5 h-5" /></div>
                        <div><div className="font-bold text-gray-800 text-lg leading-tight">{item.productName} <span className="text-xs font-normal text-gray-400">x{item.quantity}</span></div><div className="text-xs text-gray-400 mt-0.5">{new Date(item.createdAt).toLocaleDateString()}</div></div>
                      </div>
                      <StatusBadge status={item.status} />
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1.5 border border-gray-100 text-gray-600 mb-3">
                      <div className="flex justify-between items-center">{item.recipient ? <span className="flex items-center gap-1 font-bold"><User className="w-3 h-3"/> {item.recipient}</span> : <span></span>}{item.costPrice > 0 && <span className="text-xs bg-white border px-1 rounded">¥{item.costPrice}</span>}</div>
                      {item.supplier && <div className="flex items-center gap-1 text-xs text-gray-500"><Send className="w-3 h-3"/> 发: {item.supplier}</div>}
                      {item.trackingNumber && <div onClick={() => copyToClipboard(item.trackingNumber)} className="font-mono text-xs text-gray-500 bg-white p-2 rounded border border-gray-200 truncate mt-1 flex justify-between items-center cursor-pointer hover:bg-gray-50 active:bg-gray-100"><span className="truncate">{item.trackingNumber}</span><Copy className="w-3 h-3 text-gray-400" /></div>}
                    </div>
                    <div className="flex gap-2">
                      {item.status !== 'received' ? <button onClick={() => handleStatusUpdate(item.id, 'received')} className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-blue-700 shadow-md shadow-blue-200">确认签收</button> : <button className="flex-1 bg-gray-100 text-gray-400 py-2 rounded-lg text-sm font-bold cursor-default">已入库</button>}
                      <button onClick={() => handleDelete(item.id)} className="px-3 text-gray-300 hover:text-red-500"><Trash2 className="w-5 h-5"/></button>
                    </div>
                 </div>
               ))}
               {items.length === 0 && <div className="p-8 text-center text-gray-300 text-sm">暂无包裹记录</div>}
             </div>
          </>
        )}
      </main>

      <nav className="fixed bottom-0 w-full bg-white/90 backdrop-blur-md border-t border-gray-200 pb-safe z-20">
        <div className="max-w-2xl mx-auto flex justify-around items-center h-16">
          <button onClick={() => setView('stats')} className={`flex flex-col items-center space-y-1 w-16 transition-colors ${view === 'stats' ? 'text-blue-600' : 'text-gray-400'}`}><TrendingUp className="w-6 h-6" /><span className="text-[10px] font-medium">趋势</span></button>
          <button onClick={() => setView('add')} className="flex items-center justify-center bg-blue-600 text-white rounded-full w-14 h-14 shadow-lg shadow-blue-300 -mt-8 border-4 border-gray-50 hover:scale-105 transition-transform"><Plus className="w-7 h-7" /></button>
          <button onClick={() => setView('dashboard')} className={`flex flex-col items-center space-y-1 w-16 transition-colors ${view === 'dashboard' ? 'text-blue-600' : 'text-gray-400'}`}><Package className="w-6 h-6" /><span className="text-[10px] font-medium">包裹</span></button>
        </div>
      </nav>
      <style>{`.pb-safe { padding-bottom: env(safe-area-inset-bottom); }`}</style>
    </div>
  );
}