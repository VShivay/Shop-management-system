import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Printer, Calendar, Search, TrendingUp, Users, Package, 
  AlertCircle, Download, ChevronLeft, ChevronRight, ArrowRight 
} from 'lucide-react';
import './css/customer_report_analysis.css';

const API_URL = process.env.REACT_APP_API_URL;
const ITEMS_PER_PAGE = 5;

const CustomerReportAnalysis = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [reportData, setReportData] = useState(null);

  // Date Limits (Prevent future dates)
  const today = new Date();
  const maxDate = today.toISOString().split('T')[0];
  const maxMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  const [filterType, setFilterType] = useState('monthly');
  const [monthFilter, setMonthFilter] = useState(maxMonth);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Pagination
  const [custPage, setCustPage] = useState(1);
  const [prodPage, setProdPage] = useState(1);

  const fetchAnalysis = async () => {
    setLoading(true);
    setError(null);
    setCustPage(1);
    setProdPage(1);

    try {
      const token = localStorage.getItem('token');
      let queryParams = '';

      if (filterType === 'monthly') {
        const [year, month] = monthFilter.split('-');
        const dateObj = new Date(year, month - 1);
        const formattedDate = dateObj.toLocaleString('default', { month: 'short', year: 'numeric' });
        queryParams = `?dateFilter=${formattedDate}`;
      } else {
        if (!customStart || !customEnd) throw new Error("Please select start and end dates.");
        queryParams = `?startDate=${customStart}&endDate=${customEnd}`;
      }

      const response = await axios.get(`${API_URL}/CRA/analysis${queryParams}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setReportData(response.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to fetch report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAnalysis(); }, []);

  // PDF Download Handler
  const handleDownloadPDF = async () => {
    try {
        const token = localStorage.getItem('token');
        let queryParams = filterType === 'monthly' 
            ? `?dateFilter=${new Date(monthFilter.split('-')[0], monthFilter.split('-')[1] - 1).toLocaleString('default', { month: 'short', year: 'numeric' })}`
            : `?startDate=${customStart}&endDate=${customEnd}`;

        const response = await axios.get(`${API_URL}/CRA/analysis${queryParams}&format=pdf`, {
            headers: { Authorization: `Bearer ${token}` },
            responseType: 'blob'
        });

        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `sales_report.pdf`);
        document.body.appendChild(link);
        link.click();
        link.remove();
    } catch (e) { setError("Error downloading PDF"); }
  };

  // Helper to format currency safely
  const formatMoney = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0
    }).format(Number(amount) || 0);
  };

  // Pagination Helper
  const paginate = (data, page) => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return data ? data.slice(start, start + ITEMS_PER_PAGE) : [];
  };

  return (
    <div className="cra-container">
      {/* Header */}
      <div className="cra-header fade-in-down">
        <div className="cra-title-group">
          <div className="cra-icon-box"><TrendingUp size={20} className="icon-pulse" /></div>
          <div><h1>Sales Intelligence</h1><p>Dashboard & Reports</p></div>
        </div>
        <button className="cra-btn-primary" onClick={handleDownloadPDF} disabled={loading || !reportData}>
          <Printer size={14} /> <span>Print</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="cra-filter-bar fade-in">
        <div className="cra-filter-group">
          <div className="cra-toggle">
            <button className={filterType === 'monthly' ? 'active' : ''} onClick={() => setFilterType('monthly')}>Monthly</button>
            <button className={filterType === 'custom' ? 'active' : ''} onClick={() => setFilterType('custom')}>Range</button>
          </div>
          {filterType === 'monthly' ? (
            <div className="cra-input-wrapper">
              <Calendar size={14} className="cra-input-icon" />
              <input type="month" value={monthFilter} max={maxMonth} onChange={(e) => setMonthFilter(e.target.value)} className="cra-input" />
            </div>
          ) : (
            <div className="cra-range-inputs">
              <input type="date" value={customStart} max={maxDate} onChange={(e) => setCustomStart(e.target.value)} className="cra-input" />
              <ArrowRight size={12} className="text-muted" />
              <input type="date" value={customEnd} max={maxDate} onChange={(e) => setCustomEnd(e.target.value)} className="cra-input" />
            </div>
          )}
          <button className="cra-btn-action" onClick={fetchAnalysis} disabled={loading}>
            <Search size={14} /> <span>Run</span>
          </button>
        </div>
        {error && <div className="cra-error-msg slide-in"><AlertCircle size={14} />{error}</div>}
      </div>

      {/* Content */}
      {loading ? (
        <div className="cra-loading fade-in"><div className="cra-spinner"></div><p>Crunching numbers...</p></div>
      ) : reportData ? (
        <div className="cra-content fade-in-up">
            <div className="cra-grid-summary">
                <div className="cra-summary-card gradient-blue">
                    <div className="cra-card-content">
                        <h3>Total Revenue</h3>
                        <h2>{formatMoney(reportData.summary.grandTotalSales)}</h2>
                    </div>
                    <TrendingUp className="cra-bg-icon" />
                </div>
                <div className="cra-summary-card gradient-purple">
                    <div className="cra-card-content">
                        <h3>Bills Generated</h3>
                        <h2>{reportData.summary.totalBillsGenerated}</h2>
                    </div>
                    <Download className="cra-bg-icon" />
                </div>
                <div className="cra-summary-card gradient-orange">
                    <div className="cra-card-content">
                        <h3>Active Customers</h3>
                        <h2>{reportData.summary.activeCustomers}</h2>
                    </div>
                    <Users className="cra-bg-icon" />
                </div>
            </div>

            <div className="cra-grid-tables">
                {/* Customers Table */}
                <div className="cra-card">
                    <div className="cra-card-header">
                        <div className="cra-header-title"><Users size={16} className="text-blue" /><h3>Top Customers</h3></div>
                    </div>
                    <div className="cra-table-container">
                        <table className="cra-table">
                            <thead>
                                <tr><th>Customer</th><th className="text-center">Bills</th><th className="text-right">Sales</th></tr>
                            </thead>
                            <tbody>
                                {paginate(reportData.customerAnalysis, custPage).map((c, i) => (
                                    <tr key={i}>
                                        <td>
                                            <div className="cra-cell-primary">{c.customer_name}</div>
                                            <div className="cra-cell-secondary">{c.phone}</div>
                                        </td>
                                        <td className="text-center"><span className="cra-badge">{c.total_bills}</span></td>
                                        <td className="text-right font-bold">{formatMoney(c.total_sales_amount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {/* Pagination Controls */}
                    <div className="cra-pagination">
                        <button onClick={() => setCustPage(p => Math.max(1, p - 1))} disabled={custPage === 1}><ChevronLeft size={14} /></button>
                        <span>{custPage}</span>
                        <button onClick={() => setCustPage(p => p + 1)} disabled={paginate(reportData.customerAnalysis, custPage + 1).length === 0}><ChevronRight size={14} /></button>
                    </div>
                </div>

                {/* Products Table */}
                <div className="cra-card">
                    <div className="cra-card-header">
                        <div className="cra-header-title"><Package size={16} className="text-purple" /><h3>Top Products</h3></div>
                    </div>
                    <div className="cra-table-container">
                        <table className="cra-table">
                            <thead>
                                <tr><th>Product</th><th className="text-right">Qty</th><th className="text-right">Rev</th></tr>
                            </thead>
                            <tbody>
                                {paginate(reportData.productAnalysis, prodPage).map((p, i) => (
                                    <tr key={i}>
                                        <td>
                                            <div className="cra-cell-primary">{p.product_name}</div>
                                            <div className="cra-cell-secondary">{p.unit_name}</div>
                                        </td>
                                        <td className="text-right">{p.total_qty_sold}</td>
                                        <td className="text-right font-bold">{formatMoney(p.total_revenue)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {/* Pagination Controls */}
                    <div className="cra-pagination">
                        <button onClick={() => setProdPage(p => Math.max(1, p - 1))} disabled={prodPage === 1}><ChevronLeft size={14} /></button>
                        <span>{prodPage}</span>
                        <button onClick={() => setProdPage(p => p + 1)} disabled={paginate(reportData.productAnalysis, prodPage + 1).length === 0}><ChevronRight size={14} /></button>
                    </div>
                </div>
            </div>
        </div>
      ) : null}
    </div>
  );
};

export default CustomerReportAnalysis;