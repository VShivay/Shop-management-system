import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { 
  Search, 
  Filter, 
  Download, 
  CreditCard, 
  ChevronLeft, 
  ChevronRight, 
  AlertCircle,
  X,
  CheckCircle,
  FileText
} from 'lucide-react';
import './css/view_retail_bill.css';

const API_URL = process.env.REACT_APP_API_URL;

const ViewRetailBill = () => {
  // --- State ---
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('week'); // today, week, month, year, custom
  const [customDates, setCustomDates] = useState({ start: '', end: '' });

  // Pagination
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    totalPages: 1,
    total: 0
  });

  // Payment Modal
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedBill, setSelectedBill] = useState(null);
  const [paymentForm, setPaymentForm] = useState({
    amount_paid: '',
    payment_method_id: 1, // Default to Cash (assuming ID 1)
    remarks: ''
  });
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentMsg, setPaymentMsg] = useState({ type: '', text: '' });

  // --- Helpers ---
  const getAuthHeader = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  });

  // --- Fetch Data ---
  const fetchBills = useCallback(async (searchQuery = searchTerm, page = pagination.page) => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page: page,
        limit: pagination.limit,
        filterType,
        search: searchQuery
      };

      if (filterType === 'custom') {
        params.startDate = customDates.start;
        params.endDate = customDates.end;
      }

      const response = await axios.get(`${API_URL}/view-retail-bill`, {
        params,
        ...getAuthHeader()
      });

      setBills(response.data.data);
      setPagination(prev => ({
        ...prev,
        page: response.data.pagination.page,
        totalPages: response.data.pagination.totalPages,
        total: response.data.pagination.total
      }));
    } catch (err) {
      console.error(err);
      setError('Failed to load bills. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [filterType, pagination.limit, customDates]); // Exclude pagination.page and searchTerm to avoid loops

  // --- Effects ---
  
  // Initial Load & Filter Change
  useEffect(() => {
    fetchBills(searchTerm, 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, customDates]); 

  // Page Change
  useEffect(() => {
    fetchBills(searchTerm, pagination.page);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page]);

  // Debounce Search
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchBills(searchTerm, 1);
    }, 500); // 500ms debounce

    return () => clearTimeout(delayDebounceFn);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  // --- Handlers ---

  const handleDownloadPdf = async (billId, billNo) => {
    try {
      const response = await axios.get(`${API_URL}/view-retail-bill/${billId}/pdf`, {
        ...getAuthHeader(),
        responseType: 'blob' // Important for PDF
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Bill_${billNo}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert('Failed to download PDF');
    }
  };

  const openPaymentModal = (bill) => {
    setSelectedBill(bill);
    setPaymentForm({
      amount_paid: '',
      payment_method_id: 1, // 1=Cash, 2=Card, 3=UPI usually
      remarks: ''
    });
    setPaymentMsg({ type: '', text: '' });
    setShowPaymentModal(true);
  };

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    if (!paymentForm.amount_paid || paymentForm.amount_paid <= 0) {
      setPaymentMsg({ type: 'error', text: 'Please enter a valid amount.' });
      return;
    }

    setPaymentLoading(true);
    try {
      await axios.post(`${API_URL}/view-retail-bill/pay`, {
        retail_bill_id: selectedBill.retail_bill_id,
        amount_paid: paymentForm.amount_paid,
        payment_method_id: paymentForm.payment_method_id,
        remarks: paymentForm.remarks
      }, getAuthHeader());

      setPaymentMsg({ type: 'success', text: 'Payment recorded successfully!' });
      
      // Refresh list after short delay
      setTimeout(() => {
        setShowPaymentModal(false);
        fetchBills(searchTerm, pagination.page);
      }, 1500);

    } catch (err) {
      const serverMsg = err.response?.data?.error || 'Payment failed.';
      setPaymentMsg({ type: 'error', text: serverMsg });
    } finally {
      setPaymentLoading(false);
    }
  };

  // --- Render ---

  return (
    <div className="vb-container">
      {/* Header Section */}
      <div className="vb-header">
        <div className="vb-title">
          <FileText size={24} className="vb-title-icon" />
          <h1>Retail Bills</h1>
        </div>
        
        <div className="vb-actions-bar">
          <div className="vb-search-wrapper">
            <Search size={16} className="vb-search-icon" />
            <input 
              type="text" 
              placeholder="Search customer..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="vb-search-input"
            />
          </div>

          <div className="vb-filter-wrapper">
            <Filter size={16} className="vb-filter-icon" />
            <select 
              value={filterType} 
              onChange={(e) => setFilterType(e.target.value)}
              className="vb-select"
            >
              <option value="today">Today</option>
              <option value="week">Last 7 Days</option>
              <option value="month">This Month</option>
              <option value="year">This Year</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          {filterType === 'custom' && (
            <div className="vb-date-inputs">
              <input 
                type="date" 
                className="vb-date-input"
                onChange={(e) => setCustomDates({...customDates, start: e.target.value})} 
              />
              <span className="vb-to">to</span>
              <input 
                type="date" 
                className="vb-date-input"
                onChange={(e) => setCustomDates({...customDates, end: e.target.value})} 
              />
            </div>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="vb-error-banner">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Table Section */}
      <div className="vb-table-card">
        <div className="vb-table-responsive">
          <table className="vb-table">
            <thead>
              <tr>
                <th>Bill #</th>
                <th>Date</th>
                <th>Customer</th>
                <th className="vb-align-right">Total</th>
                <th className="vb-align-right">Paid</th>
                <th className="vb-align-right">Balance</th>
                <th>Status</th>
                <th className="vb-align-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" className="vb-loading-cell">Loading bills...</td></tr>
              ) : bills.length === 0 ? (
                <tr><td colSpan="8" className="vb-empty-cell">No bills found.</td></tr>
              ) : (
                bills.map((bill) => (
                  <tr key={bill.retail_bill_id} className="vb-row">
                    <td className="vb-font-medium">{bill.bill_number}</td>
                    <td>{new Date(bill.bill_date).toLocaleDateString()}</td>
                    <td>
                      <div className="vb-customer-cell">
                        <span className="vb-customer-name">{bill.customer_name || 'Walk-in'}</span>
                        {bill.customer_phone && <span className="vb-customer-sub">{bill.customer_phone}</span>}
                      </div>
                    </td>
                    <td className="vb-align-right vb-amount">₹{bill.total_amount}</td>
                    <td className="vb-align-right vb-paid">₹{bill.amount_paid}</td>
                    <td className="vb-align-right vb-due">
                      {Number(bill.balance_due) > 0 ? `₹${bill.balance_due}` : '-'}
                    </td>
                    <td>
                      <span className={`vb-badge vb-status-${bill.payment_status}`}>
                        {bill.payment_status}
                      </span>
                    </td>
                    <td className="vb-actions-cell">
                      <button 
                        className="vb-icon-btn vb-pdf-btn" 
                        title="Download PDF"
                        onClick={() => handleDownloadPdf(bill.retail_bill_id, bill.bill_number)}
                      >
                        <Download size={16} />
                      </button>
                      
                      {bill.payment_status !== 'paid' && bill.customer_id && (
                        <button 
                          className="vb-icon-btn vb-pay-btn" 
                          title="Record Payment"
                          onClick={() => openPaymentModal(bill)}
                        >
                          <CreditCard size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="vb-pagination">
          <span className="vb-page-info">
            Showing {((pagination.page - 1) * pagination.limit) + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
          </span>
          <div className="vb-page-controls">
            <button 
              className="vb-page-btn" 
              disabled={pagination.page === 1}
              onClick={() => setPagination(p => ({...p, page: p.page - 1}))}
            >
              <ChevronLeft size={16} />
            </button>
            <span className="vb-page-number">Page {pagination.page}</span>
            <button 
              className="vb-page-btn" 
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setPagination(p => ({...p, page: p.page + 1}))}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && selectedBill && (
        <div className="vb-modal-overlay">
          <div className="vb-modal">
            <div className="vb-modal-header">
              <h2>Record Payment</h2>
              <button className="vb-close-btn" onClick={() => setShowPaymentModal(false)}>
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handlePaymentSubmit} className="vb-modal-body">
              <div className="vb-modal-info">
                <div className="vb-info-row">
                  <span>Bill No:</span> <strong>{selectedBill.bill_number}</strong>
                </div>
                <div className="vb-info-row">
                  <span>Customer:</span> <strong>{selectedBill.customer_name}</strong>
                </div>
                <div className="vb-info-row vb-highlight">
                  <span>Balance Due:</span> <strong>₹{selectedBill.balance_due}</strong>
                </div>
              </div>

              {paymentMsg.text && (
                <div className={`vb-msg-box vb-msg-${paymentMsg.type}`}>
                  {paymentMsg.type === 'success' ? <CheckCircle size={16}/> : <AlertCircle size={16}/>}
                  {paymentMsg.text}
                </div>
              )}

              <div className="vb-form-group">
                <label>Amount to Pay</label>
                <input 
                  type="number" 
                  step="0.01"
                  max={selectedBill.balance_due}
                  className="vb-input-full"
                  value={paymentForm.amount_paid}
                  onChange={(e) => setPaymentForm({...paymentForm, amount_paid: e.target.value})}
                  required 
                />
              </div>

              <div className="vb-form-group">
                <label>Payment Method</label>
                <select 
                  className="vb-input-full"
                  value={paymentForm.payment_method_id}
                  onChange={(e) => setPaymentForm({...paymentForm, payment_method_id: e.target.value})}
                >
                  <option value="1">Cash</option>
                  <option value="2">Card</option>
                  <option value="3">UPI / Online</option>
                  <option value="4">Bank Transfer</option>
                </select>
              </div>

              <div className="vb-form-group">
                <label>Remarks (Optional)</label>
                <textarea 
                  className="vb-input-full vb-textarea"
                  value={paymentForm.remarks}
                  onChange={(e) => setPaymentForm({...paymentForm, remarks: e.target.value})}
                />
              </div>

              <button 
                type="submit" 
                className="vb-submit-btn" 
                disabled={paymentLoading || paymentMsg.type === 'success'}
              >
                {paymentLoading ? 'Processing...' : 'Confirm Payment'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ViewRetailBill;