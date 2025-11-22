import React, { useState, useEffect, useMemo } from 'react';
import { 
  Package, Plus, Search, Truck, CheckCircle2, 
  Clock, User, Trash2, X, WifiOff, Cloud, 
  BarChart3, ChevronLeft, TrendingUp, Send
} from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area 
} from 'recharts';

// --- Supabase 配置 ---
const SUPABASE_URL = "https://pipclbhznsjiftaijztl.supabase.co";
const SUPABASE_KEY = "sb_publishable_NVrCIbylU2uBdojQ3DUGbQ_c00IKvFv";

export default function ParcelTracker() {
  // --- 核心状态 ---
  const [householdId, setHouseholdId] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginInput, setLoginInput] = useState('');
  
  const [products, setProducts] = useState([]); // 物品库
  const [items, setItems] = useState([]);       // 快递记录
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('dashboard'); 
  const [isOffline, setIsOffline] = useState(false);
  const [isSupabaseReady, setIsSupabaseReady] = useState(false);

  // 统计选中态
  const [selectedStatId, setSelectedStatId] = useState(null);

  // 表单状态
  const [newItem, setNewItem] = useState({
    productId: null,
    productName: '', 
    costPrice: '', 
    quantity: 1,
    supplier: '',
    trackingNumber: '',
    recipient: '',
    status: 'ordered'
  });
  
  // 联想建议
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // --- 0. 自动加载样式 (国内加速版) ---
  useEffect(() => {
    if (!document.getElementById('tailwind-script')) {
      const script = document.createElement('script');
      script.id = 'tailwind-script';
      // 🚀 关键修改：使用国内 Staticfile CDN 加速 Tailwind
      script.src = "https://cdn.staticfile.net/tailwindcss/3.3.3/tailwind.min.js";
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

  // 2. 数据获取
  const fetchData = async () => {
    if (!householdId) return;
    setLoading(true);

    if (isSupabaseReady && !isOffline) {
      try {
        const { createClient } = window.supabase;
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        
        const { data: prodData } = await supabase
          .from('products')
          .select('*')
          .eq('user_id', householdId);
        setProducts(prodData || []);

        const { data: pkgData, error } = await supabase
          .from('packages')
          .select('*')
          .eq('user_id', householdId)
          .order('created_at', { ascending: false });

        if (error) throw error;

        const formattedItems = pkgData.map(d => ({
          id: d.id,
          productId: d.product_id,
          productName: d.product_name,
          costPrice: Number(d.cost_price),
          quantity: Number(d.quantity),
          supplier: d.supplier,
          trackingNumber: d.tracking_number,
          recipient: d.recipient,
          status: d.status,
          createdAt: d.created_at
        }));

        setItems(formattedItems);
        localStorage.setItem(`parcel_data_${householdId}`, JSON.stringify(formattedItems));

      } catch (err) {
        console.warn("云端失败", err);
        setIsOffline(true);
      }
    } else {
      const localItems = localStorage.getItem(`parcel_data_${householdId}`);
      if (localItems) setItems(JSON.parse(localItems));
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isLoggedIn && householdId && (isSupabaseReady || isOffline)) fetchData();
  }, [isLoggedIn, householdId, isSupabaseReady, isOffline]);

  // --- 逻辑方法 ---
  const handleNameChange = (val) => {
    setNewItem(prev => ({ ...prev, productName: val, productId: null }));
    if (val.trim()) {
      const matches = products.filter(p => p.name.toLowerCase().includes(val.toLowerCase()));
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newItem.productName) return;

    let finalProductId = newItem.productId;
    if (!finalProductId && !isOffline && isSupabaseReady && newItem.costPrice) {
      const { createClient } = window.supabase;
      const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
      const existing = products.find(p => p.name === newItem.productName);
      if (existing) {
        finalProductId = existing.id;
      } else {
        const { data: newProd, error } = await supabase
          .from('products')
          .insert([{
            user_id: householdId,
            name: newItem.productName,
            last_price: newItem.costPrice,
            total_quantity: 1
          }])
          .select().single();
        if (!error && newProd) finalProductId = newProd.id;
      }
    }

    if (!isOffline && isSupabaseReady) {
      const { createClient } = window.supabase;
      const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
      await supabase.from('packages').insert([{
        user_id: householdId,
        product_id: finalProductId,
        product_name: newItem.productName,
        cost_price: newItem.costPrice || 0,
        quantity: newItem.quantity,
        supplier: newItem.supplier,
        recipient: newItem.recipient,
        tracking_number: newItem.trackingNumber,
        status: 'ordered'
      }]);
      if (finalProductId && newItem.costPrice) {
        await supabase.from('products').update({ last_price: newItem.costPrice }).eq('id', finalProductId);
      }
    }

    fetchData();
    setNewItem({ productName: '', costPrice: '', quantity: 1, supplier: '', trackingNumber: '', recipient: '', status: 'ordered', productId: null });
    setView('dashboard');
  };

  const chartData = useMemo(() => {
    if (!selectedStatId) return [];
    const history = items
      .filter(i => i.productId === selectedStatId || i.productName === selectedStatId)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .map(i => ({
        date: new Date(i.createdAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }),
        price: i.costPrice,
      }));
    return history;
  }, [items, selectedStatId]);

  const itemStats = useMemo(() => {
    return products.map(prod => {
      const relatedItems = items.filter(i => i.productId === prod.id);
      const totalQty = relatedItems.length;
      return { ...prod, totalQty };
    }).sort((a, b) => b.totalQty - a.totalQty);
  }, [products, items]);

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
    if(!window.confirm('确定删除这条记录吗?')) return;
    setItems(prev => prev.filter(i => i.id !== id));
    if (isSupabaseReady) {
      const { createClient } = window.supabase;
      const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
      await supabase.from('packages').delete().eq('id', id);
    }
  }

  const filteredItems = items.filter(item => {
    const term = searchTerm.toLowerCase();
    return item.productName?.toLowerCase().includes(term) || 
           item.trackingNumber?.toLowerCase().includes(term) || 
           item.recipient?.toLowerCase().includes(term);
  });

  if (!isLoggedIn) return (
    <div className="min-h-screen bg-blue-50 flex items-center justify-center px-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex justify-center mb-4"><div className="bg-blue-100 p-3 rounded-full"><Truck className="w-8 h-8 text-blue-600"/></div></div>
        <h1 className="text-2xl font-extrabold text-center mb-2 text-gray-800">快递收发助手</h1>
        <p className="text-center text-gray-400 text-sm mb-6">请输入家庭暗号同步数据</p>
        <form onSubmit={handleLogin}>
          <input autoFocus type="text" value={loginInput} onChange={(e) => setLoginInput(e.target.value)} placeholder="例如：快乐一家人" className="w-full p-3 border-2 border-gray-100 rounded-xl mb-4 focus:border-blue-500 outline-none font-bold text-center" />
          <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700">进入系统</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-24 font-sans text-gray-800">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex justify-between items-center">
          <h1 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <Truck className="w-6 h-6 text-blue-600" /> 快递助手
          </h1>
          <div className="flex items-center gap-2 text-xs">
            <span className="bg-gray-100 px-2 py-1 rounded text-gray-500 font-mono">{householdId}</span>
            {isOffline ? <WifiOff className="w-4 h-4 text-amber-500" /> : <Cloud className="w-4 h-4 text-green-500" />}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-6">
        {view === 'stats' && (
          <div className="space-y-4">
            {selectedStatId ? (
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 animate-in slide-in-from-right duration-200">
                <button onClick={() => setSelectedStatId(null)} className="flex items-center text-blue-600 font-bold mb-4"><ChevronLeft className="w-5 h-5" /> 返回</button>
                <h3 className="text-lg font-bold text-gray-700 mb-2 pl-2 border-l-4 border-blue-500">价值波动</h3>
                <div className="h-64 w-full bg-gray-50 rounded-xl p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tick={{fontSize: 10}} />
                      <Tooltip />
                      <Area type="monotone" dataKey="price" stroke="#2563eb" fillOpacity={1} fill="url(#colorPrice)" strokeWidth={3} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="grid gap-3">
                <h2 className="text-lg font-bold ml-1">物品统计</h2>
                {itemStats.map(prod => (
                  <div key={prod.id} onClick={() => setSelectedStatId(prod.id)} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex justify-between items-center">
                    <div className="font-bold text-gray-800">{prod.name}</div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-blue-600">最新估值 ¥{prod.last_price}</div>
                      <div className="text-xs text-gray-400">累计收到 {prod.totalQty} 次</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {view === 'add' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-extrabold text-gray-800">录入新包裹</h2><button onClick={() => setView('dashboard')} className="p-2 bg-gray-50 rounded-full text-gray-400"><X className="w-5 h-5" /></button></div>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">快递单号</label>
                <input type="text" className="w-full p-4 bg-gray-50 rounded-xl border-transparent focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none font-mono text-lg" placeholder="扫描或粘贴单号" value={newItem.trackingNumber} onChange={e => setNewItem({...newItem, trackingNumber: e.target.value})} />
              </div>
              <div className="relative">
                <label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">物品名称 *</label>
                <input required type="text" className="w-full p-4 bg-gray-50 rounded-xl border-transparent focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="例如：衣服、文件..." value={newItem.productName} onChange={e => handleNameChange(e.target.value)} onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} />
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                    {suggestions.map(s => (
                      <div key={s.id} onClick={() => selectSuggestion(s)} className="p-3 hover:bg-blue-50 cursor-pointer border-b border-gray-50 flex justify-between">
                        <span className="font-bold text-gray-700">{s.name}</span>
                        <span className="text-xs text-gray-400">参考价: ¥{s.last_price}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">收件人</label><input type="text" className="w-full p-3 bg-gray-50 rounded-xl border-transparent focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none" value={newItem.recipient} onChange={e => setNewItem({...newItem, recipient: e.target.value})} /></div>
                <div><label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">发件人</label><input type="text" className="w-full p-3 bg-gray-50 rounded-xl border-transparent focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none" value={newItem.supplier} onChange={e => setNewItem({...newItem, supplier: e.target.value})} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">物品价值 (元)</label><input type="number" className="w-full p-3 bg-gray-50 rounded-xl border-transparent focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="用于统计" value={newItem.costPrice} onChange={e => setNewItem({...newItem, costPrice: e.target.value})} /></div>
                <div><label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">数量</label><input type="number" className="w-full p-3 bg-gray-50 rounded-xl border-transparent focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none" value={newItem.quantity} onChange={e => setNewItem({...newItem, quantity: e.target.value})} /></div>
              </div>
              <button type="submit" className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 mt-4">确认录入</button>
            </form>
          </div>
        )}

        {(view === 'dashboard' || view === 'list') && (
          <>
             {view === 'dashboard' && (
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div onClick={() => setView('list')} className="bg-orange-50 p-5 rounded-2xl border border-orange-100 flex flex-col items-center justify-center cursor-pointer active:scale-95 transition-transform">
                    <span className="text-orange-400 text-xs font-bold uppercase tracking-wider mb-1">待收包裹</span>
                    <span className="text-3xl font-extrabold text-orange-600">{items.filter(i => i.status === 'ordered').length}</span>
                  </div>
                  <div className="bg-blue-50 p-5 rounded-2xl border border-blue-100 flex flex-col items-center justify-center">
                    <span className="text-blue-400 text-xs font-bold uppercase tracking-wider mb-1">今日收件</span>
                    <span className="text-3xl font-extrabold text-blue-600">{items.filter(i => i.status === 'received' && new Date(i.createdAt).toDateString() === new Date().toDateString()).length}</span>
                  </div>
                </div>
             )}

             {view === 'list' && (
               <div className="relative mb-4">
                 <Search className="absolute left-3 top-3.5 w-5 h-5 text-gray-400"/>
                 <input type="text" autoFocus placeholder="搜索单号、物品、收件人..." className="w-full pl-10 p-3 rounded-xl border-none shadow-sm focus:ring-2 focus:ring-blue-500 outline-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
               </div>
             )}

             <div className="space-y-4">
               {filteredItems.slice(0, view === 'dashboard' ? 5 : 100).map(item => (
                 <div key={item.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${item.status === 'received' ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'}`}>
                          <Package className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="font-bold text-gray-800 text-lg leading-tight">{item.productName} <span className="text-xs font-normal text-gray-400">x{item.quantity}</span></div>
                          <div className="text-xs text-gray-400 mt-0.5">{new Date(item.createdAt).toLocaleDateString()}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        {item.costPrice > 0 && <div className="text-xs font-bold text-gray-600 bg-gray-100 px-2 py-1 rounded mb-1">¥{item.costPrice}</div>}
                      </div>
                    </div>
                    
                    <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1.5 border border-gray-100 text-gray-600 mb-3">
                      <div className="flex justify-between">
                        {item.recipient && <span className="flex items-center gap-1"><User className="w-3 h-3"/> 收: {item.recipient}</span>}
                        {item.supplier && <span className="flex items-center gap-1"><Send className="w-3 h-3"/> 发: {item.supplier}</span>}
                      </div>
                      {item.trackingNumber && <div className="font-mono text-xs text-gray-500 bg-white p-1 rounded border border-gray-200 truncate">{item.trackingNumber}</div>}
                    </div>

                    <div className="flex gap-2">
                      {item.status === 'ordered' ? (
                        <button onClick={() => handleStatusUpdate(item.id, 'received')} className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700 shadow-md shadow-blue-200">确认收货</button>
                      ) : (
                        <button className="flex-1 bg-gray-100 text-gray-400 py-2.5 rounded-xl text-sm font-bold cursor-default">已入库</button>
                      )}
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
          <button onClick={() => setView('dashboard')} className={`flex flex-col items-center space-y-1 w-16 transition-colors ${view === 'dashboard' ? 'text-blue-600' : 'text-gray-400'}`}><Package className="w-6 h-6" /><span className="text-[10px] font-medium">包裹</span></button>
          <button onClick={() => setView('add')} className="flex items-center justify-center bg-blue-600 text-white rounded-full w-14 h-14 shadow-lg shadow-blue-300 -mt-8 border-4 border-gray-50 hover:scale-105 transition-transform"><Plus className="w-7 h-7" /></button>
          <button onClick={() => setView('stats')} className={`flex flex-col items-center space-y-1 w-16 transition-colors ${view === 'stats' ? 'text-blue-600' : 'text-gray-400'}`}><TrendingUp className="w-6 h-6" /><span className="text-[10px] font-medium">统计</span></button>
        </div>
      </nav>
      <style>{`.pb-safe { padding-bottom: env(safe-area-inset-bottom); }`}</style>
    </div>
  );
}