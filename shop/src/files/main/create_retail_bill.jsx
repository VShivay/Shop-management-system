// src/files/retail/create_retail_bill.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { 
  Search, 
  Trash2, 
  Plus, 
  User, 
  Printer, 
  CheckCircle, 
  AlertTriangle,
  CreditCard,
  ShoppingCart,
  X,
  FileText
} from 'lucide-react';
import './css/create_retail_bill.css';

const API_URL = process.env.REACT_APP_API_URL;

// Custom Hook
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

const CreateRetailBill = () => {
  // --- State ---
  const [paymentMethods, setPaymentMethods] = useState([]);
  
  // Search
  const [productResults, setProductResults] = useState([]);
  const [customerResults, setCustomerResults] = useState([]);

  // Bill Data
  const [items, setItems] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [billMeta, setBillMeta] = useState({
    payment_method_id: '',
    payment_status: 'paid',
    amount_paid: 0,
    remarks: '',
  });

  // Inputs
  const [productSearch, setProductSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  
  // UI State
  const [showProdDropdown, setShowProdDropdown] = useState(false);
  const [showCustDropdown, setShowCustDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const prodSearchRef = useRef(null);
  const custSearchRef = useRef(null);

  const debouncedProductSearch = useDebounce(productSearch, 300);
  const debouncedCustomerSearch = useDebounce(customerSearch, 300);

  const getAuthHeader = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  });

  // --- Effects ---
  useEffect(() => {
    fetchMetadata();
    const handleClickOutside = (event) => {
      if (prodSearchRef.current && !prodSearchRef.current.contains(event.target)) {
        setShowProdDropdown(false);
      }
      if (custSearchRef.current && !custSearchRef.current.contains(event.target)) {
        setShowCustDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchMetadata = async () => {
    try {
      const res = await axios.get(`${API_URL}/retail/metadata`, getAuthHeader());
      setPaymentMethods(res.data.payment_methods);
      if (res.data.payment_methods.length > 0) {
        setBillMeta(prev => ({ ...prev, payment_method_id: res.data.payment_methods[0].payment_method_id }));
      }
    } catch (err) {
      console.error("Metadata Error", err);
    }
  };

  // Search Effects
  useEffect(() => {
    if (debouncedProductSearch.length > 1) {
      axios.get(`${API_URL}/retail/search-products?query=${debouncedProductSearch}`, getAuthHeader())
        .then(res => {
          setProductResults(res.data);
          setShowProdDropdown(true);
        })
        .catch(err => console.error(err));
    } else {
      setProductResults([]);
      setShowProdDropdown(false);
    }
  }, [debouncedProductSearch]);

  useEffect(() => {
    if (debouncedCustomerSearch.length > 1) {
      axios.get(`${API_URL}/retail/search-customers?query=${debouncedCustomerSearch}`, getAuthHeader())
        .then(res => {
          setCustomerResults(res.data);
          setShowCustDropdown(true);
        })
        .catch(err => console.error(err));
    } else {
      setCustomerResults([]);
      setShowCustDropdown(false);
    }
  }, [debouncedCustomerSearch]);

  // --- Logic ---
  const addProductToBill = (product) => {
    const existing = items.find(i => i.product_id === product.product_id);
    if (existing) {
      setError(`"${product.product_name}" is already in the list.`);
      setProductSearch('');
      setShowProdDropdown(false);
      return;
    }
    
    // UPDATED: Look for available_quantity_in_hand from the API response
    if(Number(product.available_quantity_in_hand) <= 0) {
      setError(`"${product.product_name}" is out of stock.`);
      return;
    }

    const newItem = {
      product_id: product.product_id,
      product_name: product.product_name,
      unit_name: product.unit_name,
      // UPDATED: Map the new quantity variable into our state
      available_quantity_in_hand: Number(product.available_quantity_in_hand), 
      retail_price: Number(product.retail_price),
      cost_price: Number(product.cost_price),
      quantity: 1,
      discount_per_unit: 0
    };

    setItems([...items, newItem]);
    setProductSearch('');
    setShowProdDropdown(false);
    setError('');
  };
  const updateItem = (index, field, value) => {
    const newItems = [...items];
    const item = newItems[index];
    const val = Number(value);

    if (field === 'quantity') {
      // UPDATED: Check against the new variable name
      if (val > item.available_quantity_in_hand) {
        alert(`Cannot exceed stock (${item.available_quantity_in_hand})`);
        return;
      }
      item.quantity = val >= 0 ? val : 0;
    } 
    else if (field === 'discount_per_unit') {
      const netPrice = item.retail_price - val;
      if (netPrice < item.cost_price) {
        // Optional: Block selling below cost
        // alert(`Price cannot be lower than Cost Price`);
      }
      item.discount_per_unit = val >= 0 ? val : 0;
    }
    setItems(newItems);
  };

  const removeItem = (index) => setItems(items.filter((_, i) => i !== index));

  const selectCustomer = (cust) => {
    setSelectedCustomer(cust);
    setCustomerSearch('');
    setShowCustDropdown(false);
  };

  // Calculations
  const calculateTotals = useCallback(() => {
    let subtotal = 0;
    let totalDiscount = 0;
    items.forEach(item => {
      subtotal += item.quantity * item.retail_price;
      totalDiscount += item.quantity * item.discount_per_unit;
    });
    const grandTotal = subtotal - totalDiscount;
    return { subtotal, totalDiscount, grandTotal };
  }, [items]);

  const { subtotal, totalDiscount, grandTotal } = calculateTotals();

  // Auto-update Amount Paid based on payment status
  useEffect(() => {
    if (billMeta.payment_status === 'paid') {
      setBillMeta(prev => ({ ...prev, amount_paid: grandTotal }));
    } else if (billMeta.payment_status === 'unpaid') {
      setBillMeta(prev => ({ ...prev, amount_paid: 0 }));
    }
  }, [grandTotal, billMeta.payment_status]);

  // Submit
  const handleSubmit = async () => {
    setError('');
    setSuccess('');

    if (items.length === 0) return setError("Please add at least one product.");
    if (!billMeta.payment_method_id) return setError("Select a payment method.");
    if (Number(billMeta.amount_paid) > grandTotal) return setError("Paid amount cannot exceed Total.");
    if (billMeta.payment_status !== 'paid' && !selectedCustomer) return setError("Customer required for partial/unpaid bills.");

    setLoading(true);

    const payload = {
      customer_id: selectedCustomer ? selectedCustomer.customer_id : null,
      payment_method_id: billMeta.payment_method_id,
      payment_status: billMeta.payment_status,
      amount_paid: Number(billMeta.amount_paid),
      remarks: billMeta.remarks,
      items: items.map(i => ({
        product_id: i.product_id,
        quantity: i.quantity,
        unit_price: i.retail_price,
        discount_per_unit: i.discount_per_unit
      }))
    };

    try {
      const res = await axios.post(`${API_URL}/retail/create`, payload, getAuthHeader());
      setSuccess(`Bill #${res.data.bill_number} Created!`);
      downloadPDF(res.data.retail_bill_id, res.data.bill_number);
      
      // Reset
      setItems([]);
      setSelectedCustomer(null);
      setBillMeta(prev => ({ ...prev, amount_paid: 0, remarks: '', payment_status: 'paid' }));
    } catch (err) {
      setError(err.response?.data?.error || "Transaction failed");
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = async (id, billNo) => {
    try {
      const response = await axios.get(`${API_URL}/retail/pdf/${id}`, {
        ...getAuthHeader(),
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Bill_${billNo}.pdf`);
      document.body.appendChild(link);
      link.click();
    } catch (err) {
      alert("Bill created, but PDF download failed.");
    }
  };

  return (
    <div className="crb-wrapper crb-fade-in">
      
      {/* Header */}
      <div className="crb-header-card">
        <div className="crb-header-left">
          <div className="crb-icon-circle">
            <ShoppingCart size={20} />
          </div>
          <h2 className="crb-title">New Retail Bill</h2>
        </div>
        <div className="crb-status-badge">
          <FileText size={14} />
          {new Date().toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="crb-alert crb-alert-error">
          <AlertTriangle size={18} /> {error}
        </div>
      )}
      {success && (
        <div className="crb-alert crb-alert-success">
          <CheckCircle size={18} /> {success}
        </div>
      )}

      {/* Main Grid */}
      <div className="crb-grid">
        
        {/* === LEFT COLUMN (Operations) === */}
        <div className="crb-col-left">
          
          {/* 1. Customer Selection */}
          <div className="crb-card crb-card-sm">
            <div className="crb-card-header">
              <h3 className="crb-label">
                <User size={14} /> Customer Details
              </h3>
              {selectedCustomer ? (
                 <button onClick={() => setSelectedCustomer(null)} className="crb-link-danger">Change</button>
              ) : (
                <span className="crb-badge-neutral">Walk-in Customer</span>
              )}
            </div>

            {!selectedCustomer ? (
              <div className="crb-search-container" ref={custSearchRef}>
                <Search className="crb-search-icon" size={16} />
                <input 
                  type="text" 
                  placeholder="Search customer by name or mobile..." 
                  className="crb-input crb-input-pl"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  onFocus={() => { if(customerResults.length > 0) setShowCustDropdown(true); }}
                />
                
                {showCustDropdown && customerResults.length > 0 && (
                  <ul className="crb-dropdown">
                    {customerResults.map(c => (
                      <li key={c.customer_id} onMouseDown={() => selectCustomer(c)}>
                        <div className="crb-dd-main">{c.customer_name}</div>
                        <div className="crb-dd-sub">{c.phone}</div>
                        {Number(c.current_balance) > 0 && (
                          <div className="crb-dd-alert">Due: ₹{c.current_balance}</div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div className="crb-customer-active">
                <div className="crb-cust-name">{selectedCustomer.customer_name}</div>
                <div className="crb-cust-phone">{selectedCustomer.phone}</div>
              </div>
            )}
          </div>

          {/* 2. Product Table */}
          <div className="crb-card crb-flex-grow">
            
            {/* Search Bar */}
            <div className="crb-search-container crb-mb-10" ref={prodSearchRef}>
              <Search className="crb-search-icon" size={16} />
              <input 
                type="text" 
                placeholder="Scan barcode or search product..." 
                className="crb-input crb-input-pl"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                onFocus={() => { if(productResults.length > 0) setShowProdDropdown(true); }}
                autoFocus
              />
              
              {showProdDropdown && productResults.length > 0 && (
                <ul className="crb-dropdown">
                  {productResults.map(p => (
                    <li key={p.product_id} onMouseDown={() => addProductToBill(p)} className="crb-dd-item-row">
                      <div>
                        <div className="crb-dd-main">{p.product_name}</div>
                        <div className="crb-dd-sub">₹{p.retail_price}</div>
                      </div>
                      {/* UPDATED: Reference available_quantity_in_hand */}
                      <span className={`crb-stock-badge ${p.available_quantity_in_hand > 0 ? 'good' : 'bad'}`}>
                        {p.available_quantity_in_hand} {p.unit_name}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Table */}
            <div className="crb-table-wrapper">
              <table className="crb-table">
                <thead>
                  <tr>
                    <th style={{width: '35%'}}>Item</th>
                    <th style={{width: '15%'}}>Price</th>
                    <th style={{width: '15%'}}>Qty</th>
                    <th style={{width: '15%'}}>Disc.</th>
                    <th style={{width: '15%'}} className="text-right">Total</th>
                    <th style={{width: '5%'}}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="crb-empty-state">
                        <ShoppingCart size={32} />
                        <span>Cart is empty</span>
                      </td>
                    </tr>
                  ) : (
                    items.map((item, index) => (
                      <tr key={item.product_id} className="crb-row-anim">
                        <td>
                          <div className="crb-p-name">{item.product_name}</div>
                          <div className="crb-p-stock">Stock: {item.available_quantity_in_hand}</div>                          
                        </td>
                        <td className="crb-text-sm">₹{item.retail_price.toFixed(2)}</td>
                        <td>
                          <input 
                            type="number" 
                            className="crb-input-tiny" 
                            value={item.quantity}
                            onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                          />
                        </td>
                        <td>
                          <input 
                            type="number" 
                            className="crb-input-tiny" 
                            value={item.discount_per_unit}
                            onChange={(e) => updateItem(index, 'discount_per_unit', e.target.value)}
                          />
                        </td>
                        <td className="crb-text-right crb-font-bold">
                          ₹{((item.retail_price - item.discount_per_unit) * item.quantity).toFixed(2)}
                        </td>
                        <td className="crb-text-center">
                          <button onClick={() => removeItem(index)} className="crb-btn-icon-del">
                            <X size={14} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* === RIGHT COLUMN (Payment & Sidebar) === */}
        <div className="crb-col-right">
          <div className="crb-card crb-sticky">
            
            <h3 className="crb-section-header">
               <CreditCard size={16} /> Payment Details
            </h3>
            
            {/* Totals Section */}
            <div className="crb-totals-box">
              <div className="crb-total-row">
                <span>Subtotal</span>
                <span>{subtotal.toFixed(2)}</span>
              </div>
              <div className="crb-total-row crb-text-green">
                <span>Discount</span>
                <span>-{totalDiscount.toFixed(2)}</span>
              </div>
              <div className="crb-divider"></div>
              <div className="crb-total-row crb-grand-total">
                <span>Grand Total</span>
                <span>₹{grandTotal.toFixed(2)}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="crb-form-group">
              <label>Payment Method</label>
              <select 
                className="crb-select"
                value={billMeta.payment_method_id}
                onChange={(e) => setBillMeta({...billMeta, payment_method_id: e.target.value})}
              >
                <option value="" disabled>Select Method</option>
                {paymentMethods.map(pm => (
                  <option key={pm.payment_method_id} value={pm.payment_method_id}>{pm.method_name}</option>
                ))}
              </select>
            </div>

            <div className="crb-form-group">
              <label>Payment Status</label>
              <div className="crb-status-tabs">
                {['paid', 'partial', 'unpaid'].map(status => (
                  <button
                    key={status}
                    className={`crb-tab ${billMeta.payment_status === status ? 'active' : ''}`}
                    onClick={() => setBillMeta({...billMeta, payment_status: status})}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="crb-form-group">
              <label>Amount Paid</label>
              <div className="crb-input-wrapper">
                <span className="crb-curr-symbol">₹</span>
                <input 
                  type="number" 
                  className={`crb-input crb-input-right crb-input-pl-lg ${billMeta.amount_paid < grandTotal && billMeta.payment_status === 'paid' ? 'error-border' : ''}`}
                  value={billMeta.amount_paid}
                  onChange={(e) => setBillMeta({...billMeta, amount_paid: e.target.value})}
                  disabled={billMeta.payment_status === 'unpaid'}
                />
              </div>
            </div>

             {billMeta.payment_status !== 'paid' && (
                <div className="crb-due-alert">
                  <span>Balance Due:</span>
                  <strong>₹{(grandTotal - billMeta.amount_paid).toFixed(2)}</strong>
                </div>
             )}

            <div className="crb-form-group">
              <label>Remarks (Optional)</label>
              <textarea 
                className="crb-input crb-textarea" 
                placeholder="Add notes..."
                value={billMeta.remarks}
                onChange={(e) => setBillMeta({...billMeta, remarks: e.target.value})}
              />
            </div>

            <button 
              className={`crb-btn-primary ${loading ? 'loading' : ''}`}
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? 'Processing...' : (
                <>
                  <Printer size={16} /> Generate Bill
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default CreateRetailBill;