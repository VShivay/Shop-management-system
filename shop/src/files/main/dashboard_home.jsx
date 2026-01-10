import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  TrendingUp, TrendingDown, DollarSign, ShoppingBag, Truck, 
  Calendar, AlertCircle, Loader2, Package, MoreHorizontal
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend 
} from 'recharts';
import './css/dashboard_home.css';

const API_URL = process.env.REACT_APP_API_URL;

const DashboardHome = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [graphFilter, setGraphFilter] = useState('week');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('token');
        // Simulated API call if no real endpoint for testing, remove in prod
        // const res = await axios.get(`${API_URL}/today-status`, { ... });
        
        // Mock data structure matching your backend response requirement
        // Replace this block with actual axios call in production
        const res = await axios.get(`${API_URL}/today-status`, {
            headers: { Authorization: `Bearer ${token}` },
            params: { graph_filter: graphFilter }
        });
        
        setData(res.data);
      } catch (err) {
        console.error(err);
        setError("Unable to sync dashboard data.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [graphFilter]);

  const formatINR = (val) => 
    new Intl.NumberFormat('en-IN', { 
      style: 'currency', 
      currency: 'INR', 
      maximumFractionDigits: 0 
    }).format(val || 0);

  if (loading) return (
    <div className="dh-v2-loading">
      <Loader2 className="dh-animate-spin" size={32} />
      <span>Syncing Dashboard...</span>
    </div>
  );

  if (error) return (
    <div className="dh-v2-error">
      <AlertCircle size={32} className="dh-text-danger" />
      <span>{error}</span>
    </div>
  );

  const summary = data?.summary || {};

  return (
    <div className="dh-v2-container">
      
      {/* Header */}
      <div className="dh-v2-header">
        <div>
          <h1 className="dh-v2-title">Dashboard Overview</h1>
          <p className="dh-v2-subtitle">
            <Calendar size={12}/> {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="dh-v2-stats-grid">
        <StatCard 
          title="Retail Sales" 
          revenue={summary.retail?.revenue} 
          profit={summary.retail?.profit} 
          icon={<ShoppingBag size={18}/>} 
          theme="retail"
        />
        <StatCard 
          title="Wholesale" 
          revenue={summary.wholesale?.revenue} 
          profit={summary.wholesale?.profit} 
          icon={<Truck size={18}/>} 
          theme="wholesale"
        />
        <StatCard 
          title="Total Earnings" 
          revenue={summary.total?.revenue} 
          profit={summary.total?.profit} 
          icon={<DollarSign size={18}/>} 
          theme="total"
        />
      </div>

      {/* Graph Section */}
      <div className="dh-v2-chart-card">
        <div className="dh-v2-section-header">
          <h2 className="dh-v2-section-title">Revenue Analytics</h2>
          <div className="dh-v2-filter-group">
            <button 
              className={`dh-v2-filter-btn ${graphFilter==='week'?'active':''}`} 
              onClick={()=>setGraphFilter('week')}
            >
              This Week
            </button>
            <button 
              className={`dh-v2-filter-btn ${graphFilter==='month'?'active':''}`} 
              onClick={()=>setGraphFilter('month')}
            >
              This Month
            </button>
          </div>
        </div>
        
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer>
            <AreaChart data={data?.graph_data || []} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="gradProf" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6"/>
              <XAxis 
                dataKey="date_label" 
                fontSize={11} 
                tickLine={false} 
                axisLine={false} 
                tick={{fill: '#6b7280'}} 
                dy={10}
              />
              <YAxis 
                fontSize={11} 
                tickLine={false} 
                axisLine={false} 
                tick={{fill: '#6b7280'}}
                tickFormatter={val => `₹${val/1000}k`}
              />
              <Tooltip 
                formatter={(value) => formatINR(value)} 
                contentStyle={{
                  borderRadius: '8px', 
                  border: 'none', 
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                  fontSize: '12px'
                }}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}/>
              <Area 
                type="monotone" 
                dataKey="total_revenue" 
                name="Revenue" 
                stroke="#4f46e5" 
                fill="url(#gradRev)" 
                strokeWidth={2}
                animationDuration={1000}
              />
              <Area 
                type="monotone" 
                dataKey="total_profit" 
                name="Profit" 
                stroke="#10b981" 
                fill="url(#gradProf)" 
                strokeWidth={2}
                animationDuration={1000}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Products */}
      <div className="dh-v2-tables-grid">
        <ProductTable 
          title="Top Retail Products" 
          data={data?.top_products?.retail} 
          icon={<ShoppingBag size={14} color="#10b981"/>}
        />
        <ProductTable 
          title="Top Wholesale Products" 
          data={data?.top_products?.wholesale} 
          icon={<Truck size={14} color="#f59e0b"/>}
        />
      </div>

    </div>
  );
};

// --- Sub-components ---

const StatCard = ({ title, revenue, profit, icon, theme }) => (
  <div className={`dh-v2-stat-card dh-card-${theme}`}>
    <div className="dh-v2-card-header">
      <div className={`dh-v2-icon-box dh-bg-${theme}`}>
        {icon}
      </div>
      <span className="dh-v2-card-label">{title}</span>
    </div>
    
    <div className="dh-v2-stat-main">
      {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(revenue || 0)}
    </div>
    
    <div className="dh-v2-stat-sub">
      <span style={{ color: '#6b7280', fontWeight: 400 }}>Profit:</span>
      <span className={profit >= 0 ? 'dh-text-profit' : 'dh-text-loss'} style={{ display: 'flex', alignItems: 'center' }}>
        {profit >= 0 ? <TrendingUp size={12} style={{marginRight:2}}/> : <TrendingDown size={12} style={{marginRight:2}}/>} 
        {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(profit || 0)}
      </span>
    </div>
  </div>
);

const ProductTable = ({ title, data, icon }) => (
  <div className="dh-v2-table-card">
    <div className="dh-v2-table-header">
      <div className="dh-v2-table-title">
        {icon} {title}
      </div>
      <MoreHorizontal size={14} color="#9ca3af" />
    </div>
    <div className="dh-v2-table-wrapper">
      {!data || data.length === 0 ? (
        <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '12px' }}>No Data Available</div> 
      ) : (
        <table className="dh-v2-table">
          <thead>
            <tr>
              <th>Product</th>
              <th className="dh-align-right">Qty</th>
              <th className="dh-align-right">Sales</th>
            </tr>
          </thead>
          <tbody>
            {data.map((i, idx) => (
              <tr key={idx}>
                <td>{i.product_name}</td>
                <td className="dh-align-right">{i.total_qty}</td>
                <td className="dh-align-right dh-font-medium">
                  {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(i.total_sales)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  </div>
);

export default DashboardHome;