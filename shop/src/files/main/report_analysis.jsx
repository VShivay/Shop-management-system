// src/files/main/report_analysis.jsx
import React, { useState, useEffect, useMemo } from 'react';
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
  AlertCircle,
  Briefcase,
  ShoppingBag
} from 'lucide-react';
import './css/report_analysis.css';

const API_URL = process.env.REACT_APP_API_URL;

const Profit_Loss_ReportAnalysis = () => {
  // --- State Management ---
  const [reportType, setReportType] = useState('retail');
  const [filter, setFilter] = useState('this_month');
  
  // Date Logic
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;
  const todayStr = currentDate.toISOString().split('T')[0];

  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedYear, setSelectedYear] = useState(currentYear);

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

  // --- Configuration ---
  const filters = [
    { id: 'today', label: 'Today' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: 'this_week', label: 'This Week' },
    { id: 'month', label: 'Specific Month' },
    { id: 'year', label: 'Specific Year' },
    { id: 'custom', label: 'Custom Range' }
  ];

  const months = [
    { id: 1, name: 'January' }, { id: 2, name: 'February' }, { id: 3, name: 'March' },
    { id: 4, name: 'April' }, { id: 5, name: 'May' }, { id: 6, name: 'June' },
    { id: 7, name: 'July' }, { id: 8, name: 'August' }, { id: 9, name: 'September' },
    { id: 10, name: 'October' }, { id: 11, name: 'November' }, { id: 12, name: 'December' }
  ];

  // --- API Handlers ---
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      // Build Query
      let queryParams = new URLSearchParams({
        filter,
        page,
        limit
      });

      // Validation & Params
      if (filter === 'custom') {
        if (!customStart || !customEnd) {
          setLoading(false);
          return;
        }
        if (customStart > todayStr || customEnd > todayStr) {
            setError("Future dates are not allowed.");
            setLoading(false);
            return;
        }
        queryParams.append('startDate', customStart);
        queryParams.append('endDate', customEnd);
      } else if (filter === 'month') {
        // Prevent future month selection logic (Double check)
        if (selectedYear > currentYear || (selectedYear === currentYear && selectedMonth > currentMonth)) {
             setError("Cannot select a future month.");
             setLoading(false);
             return;
        }
        queryParams.append('selectedMonth', selectedMonth);
        queryParams.append('selectedYear', selectedYear);
      } else if (filter === 'year') {
        if (selectedYear > currentYear) {
            setError("Cannot select a future year.");
            setLoading(false);
            return;
        }
        queryParams.append('selectedYear', selectedYear);
      }

      const url = `${API_URL}/report-analysis/${reportType}?${queryParams.toString()}`;

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setData(response.data.data || []);
      setSummary(response.data.meta || { totalSales: 0, totalCost: 0, totalProfit: 0, totalRecords: 0 });
      setTotalPages(response.data.meta?.totalPages || 1);
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
  }, [reportType, filter, page, customStart, customEnd, selectedMonth, selectedYear]);

  const handleDownloadPDF = async () => {
    try {
      const token = localStorage.getItem('token');
      let url = `${API_URL}/report-analysis/${reportType}?filter=${filter}&downloadPdf=true`;
      
      // Append params manually similar to fetchData...
      if (filter === 'custom') url += `&startDate=${customStart}&endDate=${customEnd}`;
      else if (filter === 'month') url += `&selectedMonth=${selectedMonth}&selectedYear=${selectedYear}`;
      else if (filter === 'year') url += `&selectedYear=${selectedYear}`;

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });

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

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  return (
    <div className="pl-report-wrapper">
      {/* Header Section */}
      <div className="pl-report-header">
        <div className="pl-report-title-group">
          <div className="pl-icon-box">
            <Activity size={20} className="text-white" />
          </div>
          <div>
            <h1>Profit & Loss Analysis</h1>
            <p className="pl-subtitle">Track your business financial health</p>
          </div>
        </div>
        
        <div className="pl-report-controls">
          <div className="pl-toggle-container">
            <button 
              className={`pl-toggle-btn ${reportType === 'retail' ? 'active' : ''}`} 
              onClick={() => { setReportType('retail'); setPage(1); }}
            >
              <ShoppingBag size={14} /> Retail
            </button>
            <button 
              className={`pl-toggle-btn ${reportType === 'wholesale' ? 'active' : ''}`} 
              onClick={() => { setReportType('wholesale'); setPage(1); }}
            >
              <Briefcase size={14} /> Wholesale
            </button>
          </div>

          <button className="pl-btn-export" onClick={handleDownloadPDF}>
            <Download size={14} /> <span>PDF</span>
          </button>
        </div>
      </div>

      {/* Filter Section */}
      <div className="pl-report-filter-bar">
        <div className="pl-filter-scroll">
          <Filter size={14} className="pl-filter-icon" />
          {filters.map(f => (
            <button
              key={f.id}
              className={`pl-chip ${filter === f.id ? 'active' : ''}`}
              onClick={() => { setFilter(f.id); setPage(1); }}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="pl-dynamic-inputs">
          {filter === 'custom' && (
            <div className="pl-date-group slide-in">
              <input 
                type="date" 
                max={todayStr}
                value={customStart} 
                onChange={(e) => setCustomStart(e.target.value)} 
                className="pl-input-date"
              />
              <span className="pl-separator">to</span>
              <input 
                type="date" 
                max={todayStr}
                value={customEnd} 
                onChange={(e) => setCustomEnd(e.target.value)} 
                className="pl-input-date"
              />
            </div>
          )}

          {filter === 'month' && (
            <div className="pl-select-group slide-in">
              <select 
                value={selectedMonth} 
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="pl-select"
              >
                {months.map(m => (
                  <option 
                    key={m.id} 
                    value={m.id}
                    disabled={selectedYear === currentYear && m.id > currentMonth}
                  >
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {(filter === 'month' || filter === 'year') && (
            <div className="pl-select-group slide-in">
              <input 
                type="number" 
                min="2020" 
                max={currentYear}
                value={selectedYear} 
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if(val <= currentYear) setSelectedYear(val);
                }}
                className="pl-input-year"
                placeholder="Year"
              />
            </div>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="pl-summary-grid">
        <div className="pl-card pl-card-sales">
          <div className="pl-card-content">
            <span className="pl-card-label">Total Sales</span>
            <h3 className="pl-card-value">{formatCurrency(summary.totalSales)}</h3>
          </div>
          <div className="pl-card-icon-bg"><DollarSign size={32} /></div>
        </div>
        
        <div className="pl-card pl-card-cost">
          <div className="pl-card-content">
            <span className="pl-card-label">Total Cost</span>
            <h3 className="pl-card-value">{formatCurrency(summary.totalCost)}</h3>
          </div>
          <div className="pl-card-icon-bg"><TrendingDown size={32} /></div>
        </div>

        <div className={`pl-card ${summary.totalProfit >= 0 ? 'pl-card-profit' : 'pl-card-loss'}`}>
          <div className="pl-card-content">
            <span className="pl-card-label">Net Profit</span>
            <h3 className="pl-card-value">{formatCurrency(summary.totalProfit)}</h3>
          </div>
          <div className="pl-card-icon-bg"><TrendingUp size={32} /></div>
        </div>
      </div>

      {/* Data Table */}
      <div className="pl-table-container">
        {loading ? (
          <div className="pl-loading-state">
            <div className="pl-spinner"></div>
            <p>Analyzing financial records...</p>
          </div>
        ) : error ? (
          <div className="pl-error-state">
            <AlertCircle size={24} />
            <p>{error}</p>
          </div>
        ) : (
          <>
            <div className="pl-table-wrapper">
              <table className="pl-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Bill No</th>
                    <th>Product</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Sell Price</th>
                    <th className="text-right">Hist. Cost</th>
                    <th className="text-right">Revenue</th>
                    <th className="text-right">P/L Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="pl-empty-state">No transaction records found for this period.</td>
                    </tr>
                  ) : (
                    data.map((item, index) => (
                      <tr key={index} className="pl-row-anim" style={{animationDelay: `${index * 0.05}s`}}>
                        <td>
                          <div className="pl-date-cell">
                             <Calendar size={12} className="text-gray-400"/>
                             {new Date(item.bill_date).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="pl-font-mono">{item.bill_number}</td>
                        <td className="pl-font-medium">{item.product_name}</td>
                        <td className="text-right">{item.quantity}</td>
                        <td className="text-right">{parseFloat(item.selling_price).toFixed(2)}</td>
                        <td className="text-right pl-text-muted">{parseFloat(item.cost_price).toFixed(2)}</td>
                        <td className="text-right pl-font-bold">{parseFloat(item.total_revenue).toFixed(2)}</td>
                        <td className="text-right">
                          <span className={`pl-status-pill ${parseFloat(item.profit) >= 0 ? 'success' : 'danger'}`}>
                            {parseFloat(item.profit) >= 0 ? '+' : ''}{parseFloat(item.profit).toFixed(2)}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="pl-pagination">
              <span className="pl-pg-info">Page {page} of {totalPages}</span>
              <div className="pl-pg-actions">
                <button 
                  className="pl-pg-btn"
                  disabled={page === 1} 
                  onClick={() => setPage(p => p - 1)}
                >
                  <ChevronLeft size={16} />
                </button>
                <button 
                  className="pl-pg-btn"
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

export default Profit_Loss_ReportAnalysis;