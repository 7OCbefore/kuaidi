import React, { useState, useEffect, useMemo } from 'react';
import { 
  Package, Plus, Search, Truck, CheckCircle2, 
  Clock, User, Trash2, X, WifiOff, Cloud, 
  DollarSign, Download, FileText, BarChart3
} from 'lucide-react';

// --- 配置区域 ---
const SUPABASE_URL = "https://pipclbhznsjiftaijztl.supabase.co";
const SUPABASE_KEY = "sb_publishable_NVrCIbylU2uBdojQ3DUGbQ_c00IKvFv";

export default function InventoryManager() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('dashboard'); // dashboard, add, list
  const [searchTerm, setSearchTerm] = useState('');
  const [isOffline, setIsOffline] = useState(false);
  const [userId, setUserId] = useState('');
  const [isSupabaseReady, setIsSupabaseReady] = useState(false);

  // 表单状态
  const [newItem, setNewItem] = useState({
    productName: '',
    costPrice: '',
    quantity: '',
    supplier: '',
    trackingNumber: '',
    notes: '',
    status: 'ordered' // ordered(待发), shipped(运输中), received(已入库)
  });

  // 0. 自动加载样式 (Tailwind)
  useEffect(() => {
    if (!document.getElementById('tailwind-script')) {
      const script = document.createElement('script');
      script.id = 'tailwind-script';
      script.src = "https://cdn.tailwindcss.com";
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  // 1. 初始化用户与 SDK
  useEffect(() => {
    let storedUserId = localStorage.getItem('inventory_user_id');
    if (!storedUserId) {
      storedUserId = 'user_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('inventory_user_id', storedUserId);
    }
    setUserId(storedUserId);

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

  // 2. 数据同步
  const fetchItems = async () => {
    if (!isSupabaseReady && !isOffline) return;

    if (isSupabaseReady && !isOffline) {
      try {
        const { createClient } = window.supabase;
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        const { data, error } = await supabase
          .from('packages') // 注意：这里表名对应 Supabase 里的设置
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        
        // 转换字段名以适配前端逻辑 (Supabase下划线 -> 前端驼峰)
        const formattedData = data.map(d => ({
          id: d.id,
          productName: d.product_name,
          costPrice: d.cost_price,
          quantity: d.quantity,
          supplier: d.supplier,
          trackingNumber: d.tracking_number,
          notes: d.notes,
          status: d.status,
          createdAt: d.created_at
        }));

        setItems(formattedData || []);
        setLoading(false);
        return; 
      } catch (err) {
        console.warn("云端连接失败，切换至本地模式", err);
        setIsOffline(true);
      }
    }

    try {
      const stored = localStorage.getItem('inventory_local_data');
      if (stored) setItems(JSON.parse(stored));
      setLoading(false);
    } catch (e) {
      console.error("Local storage error", e);
    }
  };

  useEffect(() => {
    fetchItems();
  }, [isSupabaseReady, isOffline, userId]);

  // 3. 保存数据
  const saveData = async (newItems, cloudAction = null) => {
    setItems(newItems);
    localStorage.setItem('inventory_local_data', JSON.stringify(newItems));

    if (!isOffline && isSupabaseReady) {
      const { createClient } = window.supabase;
      const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
      try {
        if (cloudAction.type === 'ADD') {
          const payload = {
            user_id: userId,
            product_name: cloudAction.data.productName,
            cost_price: cloudAction.data.costPrice,
            quantity: cloudAction.data.quantity,
            supplier: cloudAction.data.supplier,
            tracking_number: cloudAction.data.trackingNumber,
            notes: cloudAction.data.notes,
            status: cloudAction.data.status,
            created_at: cloudAction.data.createdAt
          };
          await supabase.from('packages').insert([payload]);
        } else if (cloudAction.type === 'UPDATE') {
          await supabase.from('packages').update(cloudAction.payload).eq('id', cloudAction.id);
        } else if (cloudAction.type === 'DELETE') {
          await supabase.from('packages').delete().eq('id', cloudAction.id);
        }
      } catch (err) {
        console.error("云端同步失败:", err);
      }
    }
  };

  // --- 导出功能 (新增) ---
  const handleExport = () => {
    if (items.length === 0) {
      alert("暂无数据可导出");
      return;
    }

    // CSV 表头
    const headers = "商品名称,进价,数量,总成本,供应商,快递单号,状态,备注,创建时间\n";
    
    // 数据行
    const rows = items.map(item => {
      const total = (parseFloat(item.costPrice || 0) * parseFloat(item.quantity || 0)).toFixed(2);
      const statusMap = { ordered: '待发货', shipped: '运输中', received: '已入库' };
      const time = item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '';
      // 处理逗号防止 CSV 错位
      const safeName = `"${item.productName.replace(/"/g, '""')}"`;
      const safeNote = `"${(item.notes || '').replace(/"/g, '""')}"`;
      
      return `${safeName},${item.costPrice},${item.quantity},${total},${item.supplier},${item.trackingNumber},${statusMap[item.status]},${safeNote},${time}`;
    }).join("\n");

    // 添加 BOM 头解决 Excel 中文乱码
    const blob = new Blob(["\ufeff" + headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `进货统计_${new Date().toLocaleDateString()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- 统计 ---
  const stats = useMemo(() => {
    const totalOrders = items.length;
    const pending = items.filter(i => i.status !== 'received').length;
    const totalSpend = items.reduce((acc, curr) => {
      return acc + (parseFloat(curr.costPrice || 0) * parseFloat(curr.quantity || 0));
    }, 0);
    return { totalOrders, pending, totalSpend };
  }, [items]);

  // --- 动作 ---
  const handleAddItem = async (e) => {
    e.preventDefault();
    const timestamp = new Date().toISOString();
    const itemData = { ...newItem, createdAt: timestamp };
    const tempId = Date.now(); 
    const localItem = { ...itemData, id: tempId };

    await saveData([localItem, ...items], { type: 'ADD', data: itemData });
    setNewItem({ productName: '', costPrice: '', quantity: '', supplier: '', trackingNumber: '', notes: '', status: 'ordered' });
    setView('dashboard');
  };

  const handleUpdateStatus = async (id, newStatus) => {
    const updatedItems = items.map(item => 
      item.id === id ? { ...item, status: newStatus } : item
    );
    await saveData(updatedItems, { type: 'UPDATE', id, payload: { status: newStatus } });
  };

  const handleDelete = async (id) => {
    if (!window.confirm("确定删除吗？")) return;
    const updatedItems = items.filter(item => item.id !== id);
    await saveData(updatedItems, { type: 'DELETE', id });
  };

  const filteredItems = items.filter(item => {
    const term = searchTerm.toLowerCase();
    return (
      item.productName?.toLowerCase().includes(term) ||
      item.supplier?.toLowerCase().includes(term) ||
      item.trackingNumber?.toLowerCase().includes(term)
    );
  });

  const StatusBadge = ({ status }) => {
    const map = {
      ordered: { color: "bg-yellow-50 text-yellow-700 border-yellow-200", text: "待发货" },
      shipped: { color: "bg-blue-50 text-blue-700 border-blue-200", text: "运输中" },
      received: { color: "bg-green-50 text-green-700 border-green-200", text: "已入库" }
    };
    const s = map[status] || map.ordered;
    return (
      <span className={`px-2 py-0.5 rounded-md text-xs font-medium border ${s.color}`}>
        {s.text}
      </span>
    );
  };

  if (loading) return <div className="flex h-screen items-center justify-center text-gray-400">加载中...</div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-24 font-sans text-gray-800">
      {/* 顶部栏 */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex justify-between items-center">
          <h1 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <Package className="w-6 h-6 text-indigo-600" />
            进销存助手
          </h1>
          <div className="flex items-center gap-2">
            {view === 'dashboard' && (
              <button 
                onClick={handleExport}
                className="text-xs flex items-center gap-1 bg-indigo-50 text-indigo-600 px-2 py-1.5 rounded-lg border border-indigo-100 hover:bg-indigo-100 transition-colors"
              >
                <Download className="w-3 h-3" /> 导出
              </button>
            )}
            {isOffline ? (
              <WifiOff className="w-4 h-4 text-amber-500" />
            ) : (
              <Cloud className="w-4 h-4 text-green-500" />
            )}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-6">
        
        {/* 仪表盘 */}
        {view === 'dashboard' && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center">
                <span className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-1">本月总支出</span>
                <span className="text-2xl font-extrabold text-gray-800">¥{stats.totalSpend.toLocaleString()}</span>
              </div>
              <div 
                onClick={() => setView('list')}
                className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center cursor-pointer active:scale-95 transition-transform"
              >
                <span className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-1">待处理订单</span>
                <span className="text-2xl font-extrabold text-orange-500">{stats.pending}</span>
              </div>
            </div>

            {/* 最新列表 */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-50 flex justify-between items-center">
                <h3 className="font-bold text-gray-700 flex items-center gap-2">
                  <Clock className="w-4 h-4" /> 最新记录
                </h3>
                <button onClick={() => setView('list')} className="text-sm text-indigo-600 font-medium">全部</button>
              </div>
              <div className="divide-y divide-gray-50">
                {items.slice(0, 5).map(item => (
                  <div key={item.id} className="p-4 flex justify-between items-start hover:bg-gray-50 transition-colors">
                    <div>
                      <div className="font-bold text-gray-800">{item.productName}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        进价 ¥{item.costPrice} × {item.quantity} = <span className="font-bold text-gray-700">¥{(item.costPrice * item.quantity).toFixed(0)}</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                        <User className="w-3 h-3" /> {item.supplier}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <StatusBadge status={item.status} />
                      {item.status === 'shipped' && (
                        <button onClick={() => handleUpdateStatus(item.id, 'received')} className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded border border-green-200">
                          确认收货
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {items.length === 0 && (
                  <div className="p-8 text-center text-gray-300 text-sm">暂无记录</div>
                )}
              </div>
            </div>
          </>
        )}

        {/* 新增页 */}
        {view === 'add' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-extrabold text-gray-800">新增采购</h2>
              <button onClick={() => setView('dashboard')} className="p-2 bg-gray-50 rounded-full text-gray-400"><X className="w-5 h-5" /></button>
            </div>
            
            <form onSubmit={handleAddItem} className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">商品名称 *</label>
                <input required type="text" className="w-full p-3 bg-gray-50 rounded-xl border-transparent focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="例如：软中华" 
                  value={newItem.productName} onChange={e => setNewItem({...newItem, productName: e.target.value})} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">进价 (元) *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-gray-400">¥</span>
                    <input required type="number" className="w-full p-3 pl-7 bg-gray-50 rounded-xl border-transparent focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" 
                      value={newItem.costPrice} onChange={e => setNewItem({...newItem, costPrice: e.target.value})} />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">数量 *</label>
                  <input required type="number" className="w-full p-3 bg-gray-50 rounded-xl border-transparent focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" 
                    value={newItem.quantity} onChange={e => setNewItem({...newItem, quantity: e.target.value})} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">供应商 *</label>
                <input required type="text" className="w-full p-3 bg-gray-50 rounded-xl border-transparent focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="例如：老张" 
                  value={newItem.supplier} onChange={e => setNewItem({...newItem, supplier: e.target.value})} />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">快递单号 / 备注</label>
                <input type="text" className="w-full p-3 bg-gray-50 rounded-xl border-transparent focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="选填" 
                  value={newItem.trackingNumber} onChange={e => setNewItem({...newItem, trackingNumber: e.target.value})} />
              </div>

              <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 mt-4">保存记录</button>
            </form>
          </div>
        )}

        {/* 列表页 */}
        {view === 'list' && (
          <div className="space-y-4">
             <div className="flex items-center gap-3 mb-2">
               <button onClick={() => {setView('dashboard'); setSearchTerm('');}} className="p-2.5 bg-white border border-gray-200 rounded-xl text-gray-500 shadow-sm">
                 <X className="w-5 h-5" />
               </button>
               <input type="text" autoFocus placeholder="搜索商品、供应商..." className="flex-1 p-3 border-none rounded-xl bg-white shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
             </div>

             {filteredItems.length === 0 ? (
               <div className="text-center py-16 text-gray-400">暂无匹配记录</div>
             ) : (
               filteredItems.map(item => (
                 <div key={item.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-bold text-gray-800 text-lg">{item.productName}</h3>
                        <div className="text-sm text-gray-500 mt-1">
                          进价 ¥{item.costPrice} × {item.quantity} = <span className="font-bold text-indigo-600">¥{(item.costPrice * item.quantity).toFixed(2)}</span>
                        </div>
                      </div>
                      <StatusBadge status={item.status} />
                    </div>
                    
                    <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-2 mb-4 border border-gray-100 text-gray-600">
                      <div className="flex justify-between">
                        <span>供应商: {item.supplier}</span>
                        <span>{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ''}</span>
                      </div>
                      {item.trackingNumber && <div className="font-mono text-xs text-gray-500">单号: {item.trackingNumber}</div>}
                    </div>

                    <div className="flex gap-2">
                      {item.status === 'ordered' && (
                        <button onClick={() => handleUpdateStatus(item.id, 'shipped')} className="flex-1 bg-blue-50 text-blue-600 py-2 rounded-lg text-sm font-bold hover:bg-blue-100">已发货</button>
                      )}
                      {item.status === 'shipped' && (
                        <button onClick={() => handleUpdateStatus(item.id, 'received')} className="flex-1 bg-green-50 text-green-600 py-2 rounded-lg text-sm font-bold hover:bg-green-100">确认入库</button>
                      )}
                      <button onClick={() => handleDelete(item.id)} className="px-3 py-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-5 h-5" /></button>
                    </div>
                 </div>
               ))
             )}
          </div>
        )}

      </main>

      {/* 底部导航 */}
      <nav className="fixed bottom-0 w-full bg-white/90 backdrop-blur-md border-t border-gray-200 pb-safe z-20">
        <div className="max-w-2xl mx-auto flex justify-around items-center h-16">
          <button onClick={() => { setView('dashboard'); setSearchTerm(''); }} className={`flex flex-col items-center space-y-1 w-16 transition-colors ${view === 'dashboard' ? 'text-indigo-600' : 'text-gray-400'}`}>
            <BarChart3 className="w-6 h-6" />
            <span className="text-[10px] font-medium">统计</span>
          </button>
          <button onClick={() => setView('add')} className="flex items-center justify-center bg-indigo-600 text-white rounded-full w-14 h-14 shadow-lg shadow-indigo-300 -mt-8 border-4 border-gray-50 hover:scale-105 transition-transform">
            <Plus className="w-7 h-7" />
          </button>
          <button onClick={() => setView('list')} className={`flex flex-col items-center space-y-1 w-16 transition-colors ${view === 'list' ? 'text-indigo-600' : 'text-gray-400'}`}>
            <Search className="w-6 h-6" />
            <span className="text-[10px] font-medium">查询</span>
          </button>
        </div>
      </nav>
      <style>{`.pb-safe { padding-bottom: env(safe-area-inset-bottom); }`}</style>
    </div>
  );
}