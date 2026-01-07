// src/files/main/view_wholesale_bill.jsx
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import debounce from 'lodash.debounce';
import { 
  Search, Calendar, Download, 
  CreditCard, ChevronLeft, ChevronRight, X 
} from 'lucide-react';
import './css/view_wholesale_bill.css';

const API_URL = process.env.REACT_APP_API_URL;

const ViewWholesaleBill = () => {
  // --- State Management ---
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, totalItems: 0 });

  // Filters
  const [filterDate, setFilterDate] = useState('week'); // defaults to last week
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  
  // Search Customer
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);

  // Payment Modal
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedDue, setSelectedDue] = useState(null);
  const [paymentForm, setPaymentForm] = useState({ amount: '', method: 1, remarks: '' });
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState('');

  // --- Fetch Data ---
  const fetchBills = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = {
        page: pagination.page,
        limit: 10,
        filter_date: filterDate,
        search_customer_id: selectedCustomer?.customer_id,
      };

      if (customStart && customEnd) {
        params.start_date = customStart;
        params.end_date = customEnd;
      }

      const res = await axios.get(`${API_URL}/view-wholesale-bill`, {
        headers: { Authorization: `Bearer ${token}` },
        params
      });

      setBills(res.data.data);
      setPagination(prev => ({
        ...prev,
        totalPages: res.data.totalPages,
        totalItems: res.data.totalItems
      }));
    } catch (err) {
      console.error("Error fetching bills:", err);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, filterDate, selectedCustomer, customStart, customEnd]);

  useEffect(() => {
    fetchBills();
  }, [fetchBills]);

  // --- Search Logic (Debounce) ---
  const searchCustomers = async (query) => {
    if (!query) {
      setCustomerResults([]);
      return;
    }
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/view-wholesale-bill/search-customers`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { query }
      });
      setCustomerResults(res.data);
      setShowDropdown(true);
    } catch (err) {
      console.error(err);
    }
  };

  // Create debounced function once
  const debouncedSearch = useCallback(debounce((q) => searchCustomers(q), 500), []);

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setCustomerSearch(val);
    if (!val) {
      setSelectedCustomer(null);
      setShowDropdown(false);
    } else {
      debouncedSearch(val);
    }
  };

  const selectCustomer = (cust) => {
    setSelectedCustomer(cust);
    setCustomerSearch(cust.customer_name);
    setShowDropdown(false);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  // --- Actions ---
  const handleDownload = async (id, billNo) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/view-wholesale-bill/${id}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Bill_${billNo}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert("Error downloading PDF");
    }
  };

  const openPayModal = (bill) => {
    setSelectedDue({
      due_id: bill.due_id,
      balance: bill.balance_due,
      bill_number: bill.bill_number
    });
    setPaymentForm({ amount: '', method: 1, remarks: '' });
    setPayError('');
    setShowPayModal(true);
  };

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    if (!paymentForm.amount || parseFloat(paymentForm.amount) <= 0) {
      setPayError('Please enter a valid amount');
      return;
    }
    if (parseFloat(paymentForm.amount) > parseFloat(selectedDue.balance)) {
      setPayError(`Amount cannot exceed balance (${selectedDue.balance})`);
      return;
    }

    setPayLoading(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/view-wholesale-bill/record-payment`, {
        due_id: selectedDue.due_id,
        amount_paid: paymentForm.amount,
        payment_method_id: paymentForm.method,
        remarks: paymentForm.remarks
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setShowPayModal(false);
      fetchBills(); // Refresh list to see updated status
    } catch (err) {
      setPayError(err.response?.data?.error || 'Payment failed');
    } finally {
      setPayLoading(false);
    }
  };

  // --- Render ---
  return (
    <div className="view-wholesale-container">
      {/* Header */}
      <div className="header-section">
        <div className="header-title">
          <CreditCard size={24} />
          Wholesale Bills
        </div>
        <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>
          Records: {pagination.totalItems}
        </div>
      </div>

      {/* Filters */}
      <div className="filter-card">
        {/* Date Filter */}
        <div className="form-group">
          <label><Calendar size={14} /> Date Range</label>
          <select 
            className="input-control" 
            value={filterDate} 
            onChange={(e) => {
              setFilterDate(e.target.value);
              setCustomStart('');
              setCustomEnd('');
              setPagination(p => ({...p, page: 1}));
            }}
          >
            <option value="today">Today</option>
            <option value="week">Last 7 Days</option>
            <option value="month">Last 30 Days</option>
            <option value="year">Last Year</option>
            <option value="custom">Custom Range</option>
          </select>
        </div>

        {filterDate === 'custom' && (
          <>
            <div className="form-group">
              <label>From</label>
              <input 
                type="date" 
                className="input-control" 
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>To</label>
              <input 
                type="date" 
                className="input-control" 
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
              />
            </div>
          </>
        )}

        {/* Customer Search */}
        <div className="form-group search-wrapper">
          <label><Search size={14} /> Filter Customer</label>
          <input 
            type="text" 
            className="input-control" 
            placeholder="Search Name or Phone..."
            value={customerSearch}
            onChange={handleSearchChange}
            onFocus={() => customerSearch && setShowDropdown(true)}
          />
          {selectedCustomer && (
            <button 
              className="action-btn" 
              style={{position: 'absolute', right: 5, top: 28, color: '#ef4444'}}
              onClick={() => {
                setSelectedCustomer(null);
                setCustomerSearch('');
                setPagination(p => ({...p, page: 1}));
              }}
            >
              <X size={14}/>
            </button>
          )}

          {showDropdown && customerResults.length > 0 && (
            <div className="search-dropdown">
              {customerResults.map(cust => (
                <div 
                  key={cust.customer_id} 
                  className="search-item"
                  onClick={() => selectCustomer(cust)}
                >
                  <div style={{fontWeight: 600}}>{cust.customer_name}</div>
                  <div style={{fontSize: '0.8rem', color: '#64748b'}}>{cust.phone}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Bill No</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Total</th>
              <th>Paid</th>
              <th>Status</th>
              <th style={{textAlign: 'right'}}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
               <tr><td colSpan="7" style={{textAlign:'center', padding: 20}}>Loading...</td></tr>
            ) : bills.length === 0 ? (
               <tr><td colSpan="7" style={{textAlign:'center', padding: 20}}>No bills found.</td></tr>
            ) : (
              bills.map(bill => (
                <tr key={bill.wholesale_bill_id}>
                  <td>{bill.bill_number}</td>
                  <td>{new Date(bill.bill_date).toLocaleDateString()}</td>
                  <td>{bill.customer_name}</td>
                  <td style={{fontWeight: 600}}>₹{parseFloat(bill.total_amount).toFixed(2)}</td>
                  <td>₹{parseFloat(bill.amount_paid).toFixed(2)}</td>
                  <td>
                    <span className={`status-badge status-${bill.payment_status}`}>
                      {bill.payment_status}
                    </span>
                  </td>
                  <td style={{textAlign: 'right'}}>
                    <button 
                      className="action-btn btn-download" 
                      title="Download PDF"
                      onClick={() => handleDownload(bill.wholesale_bill_id, bill.bill_number)}
                    >
                      <Download size={14} /> PDF
                    </button>
                    {bill.payment_status !== 'paid' && bill.due_id && (
                      <button 
                        className="action-btn btn-pay" 
                        title="Record Payment"
                        onClick={() => openPayModal(bill)}
                      >
                        <CreditCard size={14} /> Pay
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="pagination">
            <button 
              className="page-btn" 
              disabled={pagination.page === 1}
              onClick={() => setPagination(p => ({...p, page: p.page - 1}))}
            >
              <ChevronLeft size={16} />
            </button>
            <span style={{fontSize: '0.9rem', margin: '0 8px'}}>
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button 
              className="page-btn" 
              disabled={pagination.page === pagination.totalPages}
              onClick={() => setPagination(p => ({...p, page: p.page + 1}))}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Payment Modal */}
      {showPayModal && (
        <div className="modal-overlay" onClick={() => setShowPayModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span>Record Payment: {selectedDue?.bill_number}</span>
              <button className="btn-close" style={{border:'none', background:'none', cursor:'pointer'}} onClick={() => setShowPayModal(false)}><X size={20}/></button>
            </div>
            
            <form onSubmit={handlePaymentSubmit}>
              <div className="form-group" style={{marginBottom: 10}}>
                <label>Remaining Balance</label>
                <div style={{fontWeight: 'bold', fontSize: '1.1rem'}}>
                  ₹{selectedDue?.balance}
                </div>
              </div>

              <div className="form-group" style={{marginBottom: 10}}>
                <label>Amount to Pay *</label>
                <input 
                  type="number" 
                  className="input-control" 
                  step="0.01"
                  min="0.01"
                  max={selectedDue?.balance}
                  value={paymentForm.amount}
                  onChange={e => setPaymentForm({...paymentForm, amount: e.target.value})}
                  required
                />
              </div>

              <div className="form-group" style={{marginBottom: 10}}>
                <label>Payment Method</label>
                <select 
                  className="input-control"
                  value={paymentForm.method}
                  onChange={e => setPaymentForm({...paymentForm, method: e.target.value})}
                >
                  <option value={1}>Cash</option>
                  <option value={2}>UPI</option>
                  <option value={3}>Bank Transfer</option>
                </select>
              </div>

              <div className="form-group" style={{marginBottom: 15}}>
                <label>Remarks</label>
                <input 
                  type="text" 
                  className="input-control" 
                  value={paymentForm.remarks}
                  onChange={e => setPaymentForm({...paymentForm, remarks: e.target.value})}
                  placeholder="Txn ID or notes..."
                />
              </div>

              {payError && <div className="error-text">{payError}</div>}

              <button type="submit" className="btn-primary" disabled={payLoading}>
                {payLoading ? 'Processing...' : 'Confirm Payment'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ViewWholesaleBill;