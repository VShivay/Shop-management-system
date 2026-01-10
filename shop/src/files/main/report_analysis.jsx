// src/files/main/report_analysis.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Download, 
  Calendar, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Activity, 
  Filter, 
  ChevronLeft, 
  ChevronRight,
  AlertCircle
} from 'lucide-react';
import './css/report_analysis.css';

const API_URL = process.env.REACT_APP_API_URL;

const ReportAnalysis = () => {
  // State Management
  const [reportType, setReportType] = useState('retail'); // 'retail' or 'wholesale'
  const [filter, setFilter] = useState('this_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [data, setData] = useState([]);
  const [summary, setSummary] = useState({
    totalSales: 0,
    totalCost: 0,
    totalProfit: 0,
    totalRecords: 0
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 10;

  // Filter Options
  const filters = [
    { id: 'today', label: 'Today' },
    { id: 'this_week', label: 'This Week' },
    { id: 'this_month', label: 'This Month' },
    { id: 'this_year', label: 'This Year' },
    { id: 'custom', label: 'Custom' }
  ];

  // Fetch Data
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      let url = `${API_URL}/report-analysis/${reportType}?filter=${filter}&page=${page}&limit=${limit}`;
      
      if (filter === 'custom') {
        if (!customStart || !customEnd) {
          // Don't fetch if custom dates aren't selected yet
          setLoading(false);
          return;
        }
        url += `&startDate=${customStart}&endDate=${customEnd}`;
      }

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setData(response.data.data);
      setSummary({
        totalSales: response.data.meta.totalSales,
        totalCost: response.data.meta.totalCost,
        totalProfit: response.data.meta.totalProfit,
        totalRecords: response.data.meta.totalRecords
      });
      setTotalPages(response.data.meta.totalPages);
    } catch (err) {
      console.error("Fetch Error:", err);
      setError(err.response?.data?.error || "Failed to load report data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportType, filter, page, customStart, customEnd]);

  // Handlers
  const handleDownloadPDF = async () => {
    try {
      const token = localStorage.getItem('token');
      let url = `${API_URL}/report-analysis/${reportType}?filter=${filter}&downloadPdf=true`;
      
      if (filter === 'custom') {
        if (!customStart || !customEnd) return alert("Please select dates first");
        url += `&startDate=${customStart}&endDate=${customEnd}`;
      }

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob', // Important for file download
      });

      // Create blob link to download
      const urlBlob = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = urlBlob;
      link.setAttribute('download', `${reportType}_report_${Date.now()}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert("Failed to download PDF");
    }
  };

  // Helper to format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount);
  };

  return (
    <div className="ra-wrapper fade-in">
      {/* Header Section */}
      <div className="ra-header">
        <div className="ra-title-group">
          <Activity size={24} className="ra-icon-main" />
          <h1>Profit & Loss Analysis</h1>
        </div>
        
        <div className="ra-controls">
           {/* Type Switcher */}
          <div className="ra-toggle">
            <button 
              className={reportType === 'retail' ? 'active' : ''} 
              onClick={() => { setReportType('retail'); setPage(1); }}
            >
              Retail
            </button>
            <button 
              className={reportType === 'wholesale' ? 'active' : ''} 
              onClick={() => { setReportType('wholesale'); setPage(1); }}
            >
              Wholesale
            </button>
          </div>

          <button className="ra-btn-pdf" onClick={handleDownloadPDF}>
            <Download size={16} /> Export PDF
          </button>
        </div>
      </div>

      {/* Filters Section */}
      <div className="ra-filter-bar">
        <div className="ra-filter-chips">
          <Filter size={16} className="text-gray-500 mr-2" />
          {filters.map(f => (
            <button
              key={f.id}
              className={`ra-chip ${filter === f.id ? 'active' : ''}`}
              onClick={() => { setFilter(f.id); setPage(1); }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {filter === 'custom' && (
          <div className="ra-date-picker">
            <div className="input-group">
              <label>From</label>
              <input 
                type="date" 
                value={customStart} 
                onChange={(e) => setCustomStart(e.target.value)} 
              />
            </div>
            <div className="input-group">
              <label>To</label>
              <input 
                type="date" 
                value={customEnd} 
                onChange={(e) => setCustomEnd(e.target.value)} 
              />
            </div>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="ra-summary-grid">
        <div className="ra-card ra-card-sales">
          <div className="ra-card-icon"><DollarSign size={20} /></div>
          <div className="ra-card-info">
            <span>Total Sales</span>
            <h3>{formatCurrency(summary.totalSales)}</h3>
          </div>
        </div>
        
        <div className="ra-card ra-card-cost">
          <div className="ra-card-icon"><TrendingDown size={20} /></div>
          <div className="ra-card-info">
            <span>Total Cost</span>
            <h3>{formatCurrency(summary.totalCost)}</h3>
          </div>
        </div>

        <div className={`ra-card ${summary.totalProfit >= 0 ? 'ra-card-profit' : 'ra-card-loss'}`}>
          <div className="ra-card-icon"><TrendingUp size={20} /></div>
          <div className="ra-card-info">
            <span>Net Profit</span>
            <h3>{formatCurrency(summary.totalProfit)}</h3>
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="ra-table-container">
        {loading ? (
          <div className="ra-loading">Loading report data...</div>
        ) : error ? (
          <div className="ra-error"><AlertCircle size={18} /> {error}</div>
        ) : (
          <>
            <table className="ra-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Bill No</th>
                  <th>Product</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Sell Price</th>
                  <th className="text-right">Hist. Cost</th>
                  <th className="text-right">Total Rev</th>
                  <th className="text-right">P/L</th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="text-center">No records found for this period.</td>
                  </tr>
                ) : (
                  data.map((item, index) => (
                    <tr key={index}>
                      <td>
                         <span className="ra-date-badge">
                           <Calendar size={10} style={{marginRight:4}}/>
                           {new Date(item.bill_date).toLocaleDateString()}
                         </span>
                      </td>
                      <td>{item.bill_number}</td>
                      <td className="font-medium">{item.product_name}</td>
                      <td className="text-right">{item.quantity}</td>
                      <td className="text-right">{parseFloat(item.selling_price).toFixed(2)}</td>
                      <td className="text-right text-muted">{parseFloat(item.cost_price).toFixed(2)}</td>
                      <td className="text-right font-bold">{parseFloat(item.total_revenue).toFixed(2)}</td>
                      <td className={`text-right font-bold ${parseFloat(item.profit) >= 0 ? 'text-green' : 'text-red'}`}>
                        {parseFloat(item.profit).toFixed(2)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Pagination */}
            <div className="ra-pagination">
              <span>Page {page} of {totalPages || 1}</span>
              <div className="ra-pg-controls">
                <button 
                  disabled={page === 1} 
                  onClick={() => setPage(p => p - 1)}
                >
                  <ChevronLeft size={16} />
                </button>
                <button 
                  disabled={page >= totalPages} 
                  onClick={() => setPage(p => p + 1)}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ReportAnalysis;