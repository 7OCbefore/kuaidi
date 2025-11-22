import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Package, Plus, Search, Truck, Clock, User, Trash2, X, WifiOff, Cloud, 
  DollarSign, Download, BarChart3, ChevronLeft, TrendingUp, ChevronDown
} from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area 
} from 'recharts';

// --- Supabase 配置 ---
const SUPABASE_URL = "https://pipclbhznsjiftaijztl.supabase.co";
const SUPABASE_KEY = "sb_publishable_NVrCIbylU2uBdojQ3DUGbQ_c00IKvFv";

export default function InventoryManager() {
  // --- 核心状态 ---
  const [householdId, setHouseholdId] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginInput, setLoginInput] = useState('');
  
  const [products, setProducts] = useState([]); // 商品库
  const [items, setItems] = useState([]);       // 进货记录
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('dashboard'); 
  const [isOffline, setIsOffline] = useState(false);
  const [isSupabaseReady, setIsSupabaseReady] = useState(false);

  // 统计选中态
  const [selectedStatId, setSelectedStatId] = useState(null);

  // 表单状态
  const [newItem, setNewItem] = useState({
    productId: null, // 如果选了已有商品，存ID
    productName: '', // 输入框显示的文字
    costPrice: '',
    quantity: '',
    supplier: '',
    trackingNumber: '',
    notes: '',
    status: 'ordered'
  });
  
  // 商品联想建议
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // --- 0. 自动加载样式 ---
  useEffect(() => {
    if (!document.getElementById('tailwind-script')) {
      const script = document.createElement('script');
      script.id = 'tailwind-script';
      script.src = "https://cdn.tailwindcss.com";
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  // --- 1. 初始化 ---
  useEffect(() => {
    const storedId = localStorage.getItem('inventory_household_id');
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

  // --- 2. 数据获取 (同时获取商品库和记录) ---
  const fetchData = async () => {
    if (!householdId) return;
    setLoading(true);

    if (isSupabaseReady && !isOffline) {
      try {
        const { createClient } = window.supabase;
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        
        // 1. 获取商品库
        const { data: prodData } = await supabase
          .from('products')
          .select('*')
          .eq('user_id', householdId)
          .order('name');
        
        setProducts(prodData || []);

        // 2. 获取进货记录
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
          status: d.status,
          createdAt: d.created_at
        }));

        setItems(formattedItems);
        // 本地备份
        localStorage.setItem(`inventory_data_${householdId}`, JSON.stringify(formattedItems));
        localStorage.setItem(`inventory_products_${householdId}`, JSON.stringify(prodData || []));

      } catch (err) {
        console.warn("云端失败", err);
        setIsOffline(true);
      }
    } else {
      // 本地模式回退
      const localItems = localStorage.getItem(`inventory_data_${householdId}`);
      const localProds = localStorage.getItem(`inventory_products_${householdId}`);
      if (localItems) setItems(JSON.parse(localItems));
      if (localProds) setProducts(JSON.parse(localProds));
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isLoggedIn && householdId && (isSupabaseReady || isOffline)) fetchData();
  }, [isLoggedIn, householdId, isSupabaseReady, isOffline]);

  // --- 3. 核心逻辑：智能新增 ---
  // 当用户在商品名输入框打字时
  const handleNameChange = (val) => {
    setNewItem(prev => ({ ...prev, productName: val, productId: null })); // 重置ID，视为新输入
    if (val.trim()) {
      const matches = products.filter(p => p.name.toLowerCase().includes(val.toLowerCase()));
      setSuggestions(matches);
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  };

  // 当用户点击联想建议时
  const selectSuggestion = (prod) => {
    setNewItem(prev => ({
      ...prev,
      productName: prod.name,
      productId: prod.id,
      costPrice: prod.last_price || '' // 自动填入上次价格
    }));
    setShowSuggestions(false);
  };

  // 提交保存 (最关键的一步：处理“新建商品”还是“关联旧商品”)
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newItem.productName || !newItem.costPrice || !newItem.quantity) return;

    let finalProductId = newItem.productId;

    // 如果没有ID，说明是新商品，先去创建商品
    if (!finalProductId && !isOffline && isSupabaseReady) {
      const { createClient } = window.supabase;
      const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
      
      // 检查是否完全重名（防止重复创建）
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
            total_quantity: newItem.quantity
          }])
          .select()
          .single();
        
        if (!error && newProd) {
          finalProductId = newProd.id;
          // 更新本地商品库状态
          setProducts(prev => [...prev, newProd]); 
        }
      }
    }

    // 创建进货记录
    if (!isOffline && isSupabaseReady) {
      const { createClient } = window.supabase;
      const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
      
      await supabase.from('packages').insert([{
        user_id: householdId,
        product_id: finalProductId,
        product_name: newItem.productName,
        cost_price: newItem.costPrice,
        quantity: newItem.quantity,
        supplier: newItem.supplier,
        tracking_number: newItem.trackingNumber,
        status: 'ordered'
      }]);
      
      // 如果是旧商品，顺便更新一下它的最新价格
      if (finalProductId) {
        await supabase.from('products')
          .update({ last_price: newItem.costPrice })
          .eq('id', finalProductId);
      }
    }

    // 简单前端更新，触发重刷
    fetchData();
    setNewItem({ productName: '', costPrice: '', quantity: '', supplier: '', trackingNumber: '', status: 'ordered', productId: null });
    setView('dashboard');
  };

  // --- 导出功能 ---
  const handleExport = () => {
    if (items.length === 0) {
      alert("暂无数据可导出");
      return;
    }
    const headers = "商品名称,进价,数量,总成本,供应商,快递单号,状态,创建时间\n";
    const rows = items.map(item => {
      const total = (parseFloat(item.costPrice || 0) * parseFloat(item.quantity || 0)).toFixed(2);
      const statusMap = { ordered: '待发货', shipped: '运输中', received: '已入库' };
      const time = item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '';
      const safeName = `"${item.productName.replace(/"/g, '""')}"`;
      return `${safeName},${item.costPrice},${item.quantity},${total},${item.supplier},${item.trackingNumber},${statusMap[item.status]},${time}`;
    }).join("\n");

    const blob = new Blob(["\ufeff" + headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `进货统计_${new Date().toLocaleDateString()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- 统计数据处理 ---
  const chartData = useMemo(() => {
    if (!selectedStatId) return [];
    // 筛选出该商品的所有记录，按时间正序排列
    const history = items
      .filter(i => i.productId === selectedStatId || i.productName === selectedStatId) // 兼容ID或名字
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .map(i => ({
        date: new Date(i.createdAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }),
        price: i.costPrice,
        quantity: i.quantity
      }));
    return history;
  }, [items, selectedStatId]);

  const productStats = useMemo(() => {
    // 基于商品库聚合
    return products.map(prod => {
      const relatedItems = items.filter(i => i.productId === prod.id);
      const totalQty = relatedItems.reduce((sum, i) => sum + i.quantity, 0);
      const avgPrice = totalQty > 0 
        ? relatedItems.reduce((sum, i) => sum + (i.costPrice * i.quantity), 0) / totalQty 
        : 0;
      
      // 计算价格波动趋势 (涨/跌)
      let trend = 0;
      if (relatedItems.length >= 2) {
        const sorted = relatedItems.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        trend = sorted[0].costPrice - sorted[1].costPrice;
      }

      return {
        ...prod,
        realTotalQty: totalQty,
        avgPrice: avgPrice.toFixed(2),
        recordCount: relatedItems.length,
        trend
      };
    }).filter(p => p.recordCount > 0).sort((a, b) => b.realTotalQty - a.realTotalQty);
  }, [products, items]);

  // --- 杂项 ---
  const handleLogin = (e) => {
    e.preventDefault();
    if (!loginInput.trim()) return;
    localStorage.setItem('inventory_household_id', loginInput.trim());
    setHouseholdId(loginInput.trim());
    setIsLoggedIn(true);
  };

  const handleStatusUpdate = async (id, status) => {
    // 简化版：仅更新前端，实际建议加上 Supabase update
    const newItems = items.map(i => i.id === id ? {...i, status} : i);
    setItems(newItems);
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

  const filteredItems = items.filter(item => {
    const term = searchTerm.toLowerCase();
    return item.productName?.toLowerCase().includes(term) || item.supplier?.toLowerCase().includes(term);
  });

  const StatusBadge = ({ status }) => {
    const map = { ordered: { color: "bg-yellow-50 text-yellow-700 border-yellow-200", text: "待发货" }, shipped: { color: "bg-blue-50 text-blue-700 border-blue-200", text: "运输中" }, received: { color: "bg-green-50 text-green-700 border-green-200", text: "已入库" } };
    const s = map[status] || map.ordered;
    return <span className={`px-2 py-0.5 rounded-md text-xs font-medium border ${s.color}`}>{s.text}</span>;
  };

  // ------------------
  // 视图渲染
  // ------------------

  if (!isLoggedIn) return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white flex items-center justify-center px-4 font-sans text-gray-800">
      <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-sm">
        <h1 className="text-2xl font-extrabold text-center mb-6 text-indigo-900">进销存助手</h1>
        <form onSubmit={handleLogin}>
          <input autoFocus type="text" value={loginInput} onChange={(e) => setLoginInput(e.target.value)} placeholder="输入家庭/店铺暗号" className="w-full p-3 border-2 border-gray-100 rounded-xl mb-4 focus:border-indigo-500 outline-none font-bold text-center" />
          <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700">进入系统</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-24 font-sans text-gray-800">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex justify-between items-center">
          <h1 className="text-lg font-bold text-gray-800 flex items-center gap-2"><Package className="w-6 h-6 text-indigo-600" /> 进销存</h1>
          <div className="text-xs text-gray-400 font-mono">{householdId}</div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-6">
        
        {/* 统计分析视图 */}
        {view === 'stats' && (
          <div className="space-y-4">
            {selectedStatId ? (
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 animate-in slide-in-from-right duration-200">
                <button onClick={() => setSelectedStatId(null)} className="flex items-center text-indigo-600 font-bold mb-4">
                  <ChevronLeft className="w-5 h-5" /> 返回列表
                </button>
                
                {/* 价格走势图 */}
                <h3 className="text-lg font-bold text-gray-700 mb-2 pl-2 border-l-4 border-indigo-500">进价走势</h3>
                <div className="h-64 w-full mb-6 bg-gray-50 rounded-xl p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tick={{fontSize: 10}} tickMargin={10} />
                      <YAxis domain={['auto', 'auto']} hide />
                      <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'}} />
                      <Area type="monotone" dataKey="price" stroke="#6366f1" fillOpacity={1} fill="url(#colorPrice)" strokeWidth={3} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* 数量柱状图 (修复了这里的嵌套错误) */}
                <h3 className="text-lg font-bold text-gray-700 mb-2 pl-2 border-l-4 border-emerald-500">进货量记录</h3>
                <div className="h-40 w-full bg-gray-50 rounded-xl p-2">
                  <ResponsiveContainer width="100%" height="100%">
                     <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="date" tick={{fontSize: 10}} hide />
                        <Tooltip cursor={{fill: 'transparent'}} />
                        <Line type="step" dataKey="quantity" stroke="#10b981" strokeWidth={2} dot={false} name="数量" />
                     </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="grid gap-3">
                <h2 className="text-lg font-bold ml-1">商品分析 ({productStats.length})</h2>
                {productStats.map(prod => (
                  <div key={prod.id} onClick={() => setSelectedStatId(prod.id)} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex justify-between items-center cursor-pointer hover:border-indigo-300 transition-all">
                    <div>
                      <div className="font-bold text-gray-800 text-lg">{prod.name}</div>
                      <div className="text-xs text-gray-500 mt-1">共进货 {prod.recordCount} 次 / 累计 {prod.realTotalQty} 件</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-indigo-600">¥{prod.last_price}</div>
                      <div className={`text-xs font-medium flex items-center justify-end gap-1 ${prod.trend > 0 ? 'text-red-500' : prod.trend < 0 ? 'text-green-500' : 'text-gray-400'}`}>
                        {prod.trend > 0 ? '↑ 涨价' : prod.trend < 0 ? '↓ 降价' : '- 平稳'}
                      </div>
                    </div>
                  </div>
                ))}
                {productStats.length === 0 && <div className="text-center text-gray-400 py-10">暂无数据，请先在首页录入</div>}
              </div>
            )}
          </div>
        )}

        {/* 录入视图 (带联想功能) */}
        {view === 'add' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 relative">
            <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-extrabold text-gray-800">录入进货</h2><button onClick={() => setView('dashboard')} className="p-2 bg-gray-50 rounded-full text-gray-400"><X className="w-5 h-5" /></button></div>
            
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="relative">
                <label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">商品名称 *</label>
                <input 
                  required 
                  type="text" 
                  className="w-full p-4 bg-gray-50 rounded-xl border-transparent focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" 
                  placeholder="输入名称，自动联想..." 
                  value={newItem.productName} 
                  onChange={e => handleNameChange(e.target.value)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} // 延迟关闭以便点击
                />
                {/* 联想下拉框 */}
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                    {suggestions.map(s => (
                      <div key={s.id} onClick={() => selectSuggestion(s)} className="p-3 hover:bg-indigo-50 cursor-pointer border-b border-gray-50 last:border-0 flex justify-between">
                        <span className="font-bold text-gray-700">{s.name}</span>
                        <span className="text-xs text-gray-400">上次: ¥{s.last_price}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">进价 (元) *</label><input required type="number" className="w-full p-3 bg-gray-50 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={newItem.costPrice} onChange={e => setNewItem({...newItem, costPrice: e.target.value})} /></div>
                <div><label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">数量 *</label><input required type="number" className="w-full p-3 bg-gray-50 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={newItem.quantity} onChange={e => setNewItem({...newItem, quantity: e.target.value})} /></div>
              </div>
              
              <div><label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">供应商</label><input type="text" className="w-full p-3 bg-gray-50 rounded-xl outline-none" value={newItem.supplier} onChange={e => setNewItem({...newItem, supplier: e.target.value})} /></div>
              
              <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 mt-4">保存并更新库存</button>
            </form>
          </div>
        )}

        {/* 首页和列表 (复用之前的简单逻辑，略微调整样式) */}
        {(view === 'dashboard' || view === 'list') && (
          <>
             {view === 'dashboard' && (
                <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-6 text-white shadow-lg mb-6 cursor-pointer" onClick={() => setView('stats')}>
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-indigo-100 text-sm font-medium mb-1">本月总支出</div>
                      <div className="text-3xl font-extrabold">¥{items.reduce((a,b)=>a+(b.costPrice*b.quantity),0).toLocaleString()}</div>
                    </div>
                    <BarChart3 className="w-8 h-8 opacity-80" />
                  </div>
                  <div className="mt-4 text-xs bg-white/20 inline-block px-2 py-1 rounded-lg">点击查看价格趋势分析 &rarr;</div>
                </div>
             )}

             <div className="space-y-4">
                {view === 'dashboard' && (
                  <div className="flex justify-end">
                    <button onClick={handleExport} className="text-xs flex items-center gap-1 bg-indigo-50 text-indigo-600 px-3 py-2 rounded-lg border border-indigo-100 font-bold hover:bg-indigo-100 transition-colors">
                      <Download className="w-3 h-3" /> 导出Excel表格
                    </button>
                  </div>
                )}
                
                {view === 'list' && (
                   <div className="flex items-center gap-3 mb-2">
                     <button onClick={() => {setView('dashboard'); setSearchTerm('');}} className="p-2.5 bg-white border border-gray-200 rounded-xl text-gray-500 shadow-sm"><X className="w-5 h-5" /></button>
                     <input type="text" autoFocus placeholder="搜索商品、供应商..." className="flex-1 p-3 border-none rounded-xl bg-white shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                   </div>
                )}

               {items.slice(0, view === 'dashboard' ? 5 : 100).map(item => (
                 <div key={item.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex justify-between items-start">
                    <div>
                      <div className="font-bold text-gray-800 text-lg">{item.productName}</div>
                      <div className="text-sm text-gray-500 mt-1">进价 ¥{item.costPrice} × {item.quantity} = <span className="text-indigo-600 font-bold">¥{(item.costPrice * item.quantity).toFixed(0)}</span></div>
                      <div className="text-xs text-gray-400 mt-2">{new Date(item.createdAt).toLocaleDateString()} · {item.supplier || '未知供应商'}</div>
                    </div>
                    <div className="flex flex-col gap-2 items-end">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${item.status==='received'?'bg-green-50 text-green-600':'bg-orange-50 text-orange-600'}`}>{item.status==='received'?'已入库':'待收货'}</span>
                      {item.status !== 'received' && <button onClick={()=>handleStatusUpdate(item.id, 'received')} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded">收货</button>}
                      <button onClick={()=>handleDelete(item.id)} className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4"/></button>
                    </div>
                 </div>
               ))}
               {items.length === 0 && <div className="p-8 text-center text-gray-300 text-sm">暂无记录</div>}
             </div>
          </>
        )}

      </main>

      {/* 底部导航 */}
      <nav className="fixed bottom-0 w-full bg-white/90 backdrop-blur-md border-t border-gray-200 pb-safe z-20">
        <div className="max-w-2xl mx-auto flex justify-around items-center h-16">
          <button onClick={() => setView('stats')} className={`flex flex-col items-center space-y-1 w-16 transition-colors ${view === 'stats' ? 'text-indigo-600' : 'text-gray-400'}`}><TrendingUp className="w-6 h-6" /><span className="text-[10px] font-medium">趋势</span></button>
          <button onClick={() => setView('add')} className="flex items-center justify-center bg-indigo-600 text-white rounded-full w-14 h-14 shadow-lg shadow-indigo-300 -mt-8 border-4 border-gray-50 hover:scale-105 transition-transform"><Plus className="w-7 h-7" /></button>
          <button onClick={() => setView('dashboard')} className={`flex flex-col items-center space-y-1 w-16 transition-colors ${view === 'dashboard' ? 'text-indigo-600' : 'text-gray-400'}`}><Package className="w-6 h-6" /><span className="text-[10px] font-medium">明细</span></button>
        </div>
      </nav>
      <style>{`.pb-safe { padding-bottom: env(safe-area-inset-bottom); }`}</style>
    </div>
  );
}