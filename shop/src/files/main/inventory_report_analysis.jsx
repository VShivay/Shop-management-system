import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  FileText, 
  Search, 
  ArrowDownCircle, 
  TrendingUp, 
  PackagePlus, 
  AlertCircle,
  Loader2,
  IndianRupee,
  Wallet,
  Layers,
  Coins
} from 'lucide-react';
import './css/inventory_report_analysis.css';

const API_URL = process.env.REACT_APP_API_URL;

const Inventory_Report_Analysis = () => {
  // Filters State
  const [filterType, setFilterType] = useState('today');
  const [specificDate, setSpecificDate] = useState('');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Data State (UPDATED: Added Grand Total Stock metrics)
  const [data, setData] = useState({
    summary: { 
        totalSalesQuantity: '0', 
        totalRestockQuantity: '0',
        totalEstimatedRevenue: '0',
        totalEstimatedCost: '0',
        totalCurrentStock: '0',
        totalCurrentStockValue: '0'
    },
    salesReport: [],
    restockReport: []
  });
  
  // UI State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // Initial Load
  useEffect(() => {
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validateInputs = () => {
    if (filterType === 'date' && !specificDate) return "Please select a date.";
    if (filterType === 'range') {
      if (!startDate || !endDate) return "Please select both start and end dates.";
      if (new Date(startDate) > new Date(endDate)) return "Start date cannot be after end date.";
    }
    return null;
  };

  const fetchReport = async () => {
    const validationError = validateInputs();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      
      const config = {
        headers: { 
          'Authorization': `Bearer ${token}` 
        },
        params: {
          filterType,
          specificDate: filterType === 'date' ? specificDate : undefined,
          month: filterType === 'month' ? month : undefined,
          year: (filterType === 'month' || filterType === 'year') ? year : undefined,
          startDate: filterType === 'range' ? startDate : undefined,
          endDate: filterType === 'range' ? endDate : undefined,
        }
      };

      const response = await axios.get(`${API_URL}/IRA/reports`, config);

      setData(response.data);
    } catch (err) {
      console.error("Error fetching report:", err);
      setError(err.response?.data?.error || "Failed to load inventory data.");
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = async () => {
    setDownloadingPdf(true);
    try {
      const token = localStorage.getItem('token');

      const config = {
        headers: { 
          'Authorization': `Bearer ${token}` 
        },
        params: {
          filterType,
          specificDate: filterType === 'date' ? specificDate : undefined,
          month: filterType === 'month' ? month : undefined,
          year: (filterType === 'month' || filterType === 'year') ? year : undefined,
          startDate: filterType === 'range' ? startDate : undefined,
          endDate: filterType === 'range' ? endDate : undefined,
        },
        responseType: 'blob'
      };

      const response = await axios.get(`${API_URL}/IRA/pdf`, config);

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Inventory_Report_${Date.now()}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error("PDF Download Error:", err);
      setError("Failed to download PDF.");
    } finally {
      setDownloadingPdf(false);
    }
  };

  const renderFilters = () => {
    return (
      <div className="ira-filters fade-in">
        <div className="ira-filter-group">
          <label>Filter Type</label>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="today">Today</option>
            <option value="date">Specific Date</option>
            <option value="month">Specific Month</option>
            <option value="year">Specific Year</option>
            <option value="range">Date Range</option>
          </select>
        </div>

        {filterType === 'date' && (
          <div className="ira-filter-group">
            <label>Date</label>
            <input type="date" value={specificDate} onChange={(e) => setSpecificDate(e.target.value)} />
          </div>
        )}

        {filterType === 'month' && (
          <>
            <div className="ira-filter-group">
              <label>Month</label>
              <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>{new Date(0, i).toLocaleString('default', { month: 'long' })}</option>
                ))}
              </select>
            </div>
            <div className="ira-filter-group">
              <label>Year</label>
              <input type="number" min="2000" max="2100" value={year} onChange={(e) => setYear(e.target.value)} />
            </div>
          </>
        )}

        {filterType === 'year' && (
          <div className="ira-filter-group">
            <label>Year</label>
            <input type="number" min="2000" max="2100" value={year} onChange={(e) => setYear(e.target.value)} />
          </div>
        )}

        {filterType === 'range' && (
          <>
            <div className="ira-filter-group">
              <label>From</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="ira-filter-group">
              <label>To</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </>
        )}

        <button className="ira-btn-primary" onClick={fetchReport} disabled={loading}>
          {loading ? <Loader2 className="spin" size={16} /> : <Search size={16} />}
          Apply
        </button>
      </div>
    );
  };

  return (
    <div className="ira-container">
      <div className="ira-header">
        <div className="ira-title">
          <FileText className="ira-icon-lg" />
          <div>
            <h2>Inventory Analysis</h2>
            <p>Track sales, restocking, and current stock valuation</p>
          </div>
        </div>
        <button className="ira-btn-secondary" onClick={downloadPDF} disabled={downloadingPdf}>
          {downloadingPdf ? <Loader2 className="spin" size={18} /> : <ArrowDownCircle size={18} />}
          <span>Export PDF</span>
        </button>
      </div>

      {error && (
        <div className="ira-error shake">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {renderFilters()}

      {/* UPDATED: 6 Financial Summary Cards */}
      <div className="ira-summary-grid fade-in-up" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        
        {/* Sales Group */}
        <div className="ira-card card-gradient-1">
          <div className="ira-card-icon">
            <TrendingUp size={24} color="#fff" />
          </div>
          <div className="ira-card-content">
            <h3>Items Sold</h3>
            <p>{loading ? '...' : data.summary.totalSalesQuantity}</p>
          </div>
        </div>
        
        <div className="ira-card card-gradient-3" style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}>
          <div className="ira-card-icon">
            <IndianRupee size={24} color="#fff" />
          </div>
          <div className="ira-card-content">
            <h3>Est. Revenue</h3>
            <p style={{ color: '#fff' }}>₹{loading ? '...' : data.summary.totalEstimatedRevenue}</p>
          </div>
        </div>

        {/* Restock Group */}
        <div className="ira-card card-gradient-2">
          <div className="ira-card-icon">
            <PackagePlus size={24} color="#fff" />
          </div>
          <div className="ira-card-content">
            <h3>Items Restocked</h3>
            <p>{loading ? '...' : data.summary.totalRestockQuantity}</p>
          </div>
        </div>

        <div className="ira-card card-gradient-4" style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' }}>
          <div className="ira-card-icon">
            <Wallet size={24} color="#fff" />
          </div>
          <div className="ira-card-content">
            <h3>Est. Restock Cost</h3>
            <p style={{ color: '#fff' }}>₹{loading ? '...' : data.summary.totalEstimatedCost}</p>
          </div>
        </div>

        {/* NEW: Total Store Stock Group */}
        <div className="ira-card" style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)', color: 'white' }}>
          <div className="ira-card-icon" style={{ background: 'rgba(255,255,255,0.2)' }}>
            <Layers size={24} color="#fff" />
          </div>
          <div className="ira-card-content">
            <h3 style={{ color: 'rgba(255,255,255,0.8)' }}>Total Store Stock</h3>
            <p style={{ color: '#fff' }}>{loading ? '...' : data.summary.totalCurrentStock}</p>
          </div>
        </div>

        <div className="ira-card" style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)', color: 'white' }}>
          <div className="ira-card-icon" style={{ background: 'rgba(255,255,255,0.2)' }}>
            <Coins size={24} color="#fff" />
          </div>
          <div className="ira-card-content">
            <h3 style={{ color: 'rgba(255,255,255,0.8)' }}>Total Stock Value</h3>
            <p style={{ color: '#fff' }}>₹{loading ? '...' : data.summary.totalCurrentStockValue}</p>
          </div>
        </div>

      </div>

      {/* UPDATED LAYOUT: 
        Forced 'flex-direction: column' here so they stack top-to-bottom! 
      */}
      <div 
        className="ira-tables-container fade-in-up delay-1" 
        style={{ display: 'flex', flexDirection: 'column', gap: '2rem', marginTop: '2rem' }}
      >
        
        {/* SALES TABLE */}
        <div className="ira-table-wrapper" style={{ width: '100%' }}>
          <div className="ira-section-header">
            <h3>Sales Breakdown</h3>
            <span className="ira-badge sales">{data.salesReport.length} Items</span>
          </div>
          <div className="ira-table-scroll">
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Date/Time</th>
                  <th>Product</th>
                  <th>Category</th>
                  <th className="text-right">Current Stock</th>
                  <th className="text-right">Stock Val</th> {/* NEW */}
                  <th className="text-right">Est. Revenue</th>
                  <th className="text-right">Sold Qty</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="6" className="text-center">Loading...</td></tr>
                ) : data.salesReport.length === 0 ? (
                  <tr><td colSpan="6" className="text-center">No sales records found.</td></tr>
                ) : (
                  data.salesReport.map((item, idx) => (
                    <tr key={`sale-${idx}`}>
                      <td>{item.transaction_date}</td>
                      <td>{item.product_name}</td>
                      <td>{item.category_name || '-'}</td>
                      <td className="text-right">{item.current_stock} {item.unit_name}</td>
                      <td className="text-right">₹{item.current_stock_value}</td> {/* NEW */}
                      <td className="text-right text-success">₹{item.estimated_revenue}</td>
                      <td className="text-right font-bold">{item.total_quantity}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* RESTOCK TABLE */}
        <div className="ira-table-wrapper" style={{ width: '100%' }}>
          <div className="ira-section-header">
            <h3>Restock History</h3>
            <span className="ira-badge restock">{data.restockReport.length} Records</span>
          </div>
          <div className="ira-table-scroll">
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Date/Time</th>
                  <th>Product</th>
                  <th>Supplier</th>
                  <th className="text-right">Current Stock</th>
                  <th className="text-right">Stock Val</th> {/* NEW */}
                  <th className="text-right">Est. Cost</th>
                  <th className="text-right">Added Qty</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="6" className="text-center">Loading...</td></tr>
                ) : data.restockReport.length === 0 ? (
                  <tr><td colSpan="6" className="text-center">No restock records found.</td></tr>
                ) : (
                  data.restockReport.map((item, idx) => (
                    <tr key={`restock-${idx}`}>
                      <td>{item.transaction_date}</td>
                      <td>{item.product_name}</td>
                      <td>{item.supplier_name || 'N/A'}</td>
                      <td className="text-right">{item.current_stock} {item.unit_name}</td>
                      <td className="text-right">₹{item.current_stock_value}</td> {/* NEW */}
                      <td className="text-right text-warning">₹{item.estimated_cost}</td>
                      <td className="text-right font-bold text-success">+{item.total_quantity}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Inventory_Report_Analysis;