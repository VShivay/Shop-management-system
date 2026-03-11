// src/files/main/create_wholesale_bill.jsx
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { 
  Search, Plus, Trash2, Save, User, 
  CreditCard, Package, AlertCircle, CheckCircle 
} from 'lucide-react';
import './css/create_wholesale_bill.css';

const API_URL = process.env.REACT_APP_API_URL;

const CreateWholesaleBill = () => {
  // --- States ---
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  
  const [productSearch, setProductSearch] = useState('');
  const [products, setProducts] = useState([]);
  
  const [billItems, setBillItems] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');
  
  const [amountPaid, setAmountPaid] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // --- Auth Helper ---
  const getAuthHeader = () => ({
    Authorization: `Bearer ${localStorage.getItem('token')}`
  });

  // --- Initial Load ---
  useEffect(() => {
    fetchPaymentMethods();
  }, []);

  const fetchPaymentMethods = async () => {
    try {
      // In a real app, fetch this from API. Hardcoding for now based on common setup.
      setPaymentMethods([
        { id: 1, name: 'Cash' },
        { id: 2, name: 'Bank Transfer' },
        { id: 3, name: 'Cheque' },
        { id: 4, name: 'UPI' }
      ]);
      setSelectedPaymentMethod(1); // Default to Cash
    } catch (err) {
      console.error("Failed to load payment methods");
    }
  };

  // --- Debounced Search: Customers ---
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (customerSearch.length > 1 && !selectedCustomer) {
        try {
          const res = await axios.get(
            `${API_URL}/create-bill/search-customers?query=${customerSearch}`, 
            { headers: getAuthHeader() }
          );
          setCustomers(res.data);
        } catch (err) { console.error(err); }
      } else {
        setCustomers([]);
      }
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [customerSearch, selectedCustomer]);

  // --- Debounced Search: Products ---
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (productSearch.length > 1) {
        try {
          const res = await axios.get(
            `${API_URL}/create-bill/search-products?query=${productSearch}`, 
            { headers: getAuthHeader() }
          );
          setProducts(res.data);
        } catch (err) { console.error(err); }
      } else {
        setProducts([]);
      }
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [productSearch]);

  // --- Handlers: Customer ---
  const handleSelectCustomer = (cust) => {
    setSelectedCustomer(cust);
    setCustomerSearch(cust.customer_name);
    setCustomers([]);
  };

  const handleClearCustomer = () => {
    setSelectedCustomer(null);
    setCustomerSearch('');
  };

  // --- Handlers: Products ---
  const handleAddProduct = (prod) => {
    const existing = billItems.find(item => item.product_id === prod.product_id);
    if (existing) {
      setError(`Product "${prod.product_name}" is already in the list.`);
      setTimeout(() => setError(''), 3000);
      return;
    }

    // UPDATED: Guard against zero stock using the new variable name
    if(Number(prod.available_quantity_in_hand) <= 0) {
      setError(`"${prod.product_name}" is out of stock.`);
      setTimeout(() => setError(''), 3000);
      return;
    }

    const newItem = {
      ...prod,
      // UPDATED: Map the new variable
      available_quantity_in_hand: Number(prod.available_quantity_in_hand),
      quantity: 1,
      discount_per_unit: 0,
      total: parseFloat(prod.wholesale_price)
    };
    
    setBillItems([...billItems, newItem]);
    setProductSearch('');
    setProducts([]);
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...billItems];
    const item = newItems[index];
    let val = parseFloat(value) || 0;

    // Logic: Quantity check against stock (UPDATED variable name)
    if (field === 'quantity') {
      if (val > item.available_quantity_in_hand) {
        setError(`Quantity exceeds stock! Available: ${item.available_quantity_in_hand}`);
        val = item.available_quantity_in_hand;
      }
    }

    // Logic: Discount check against cost price (Warning only, backend enforces block)
    if (field === 'discount_per_unit') {
        const costPrice = parseFloat(item.cost_price);
        const wholesalePrice = parseFloat(item.wholesale_price);
        const effectivePrice = wholesalePrice - val;
        
        if (effectivePrice < costPrice) {
             setError(`Warning: Price is below Cost Price (${costPrice}).`);
        }
    }

    item[field] = val;
    
    // Recalculate line total
    const price = parseFloat(item.wholesale_price);
    const qty = parseFloat(item.quantity);
    const disc = parseFloat(item.discount_per_unit);
    
    // Ensure total isn't negative
    item.total = Math.max(0, (price - disc) * qty);

    setBillItems(newItems);
  };

  const handleRemoveItem = (index) => {
    const newItems = [...billItems];
    newItems.splice(index, 1);
    setBillItems(newItems);
  };

  // --- Calculations ---
  const calculateGrandTotal = useCallback(() => {
    return billItems.reduce((acc, item) => acc + item.total, 0);
  }, [billItems]);

  const grandTotal = calculateGrandTotal();
  const dueAmount = grandTotal - (parseFloat(amountPaid) || 0);

  // --- Helper: Secure PDF Download ---
  const handleDownloadPdf = async (billId, billNumber) => {
    try {
        const res = await axios.get(`${API_URL}/create-bill/${billId}/pdf`, {
            headers: getAuthHeader(),
            responseType: 'blob' // Important: Treat response as binary file
        });

        // Create a temporary URL for the blob
        const url = window.URL.createObjectURL(new Blob([res.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `Bill_${billNumber}.pdf`);
        
        // Append, click, and cleanup
        document.body.appendChild(link);
        link.click();
        link.parentNode.removeChild(link);
        window.URL.revokeObjectURL(url);
    } catch (err) {
        console.error("Download failed", err);
        setError('Bill created, but PDF download failed. Please check "View Bills".');
    }
  };

  // --- Submit ---
  const handleSubmit = async () => {
    setError('');
    setSuccess('');

    // Pre-flight Validation
    if (!selectedCustomer) return setError('Please select a customer.');
    if (billItems.length === 0) return setError('Please add at least one product.');
    if (parseFloat(amountPaid) > grandTotal) return setError('Paid amount cannot exceed total amount.');

    // Validating Cost Price constraint on Frontend to prevent API error
    for(let item of billItems) {
        if((item.wholesale_price - item.discount_per_unit) < item.cost_price) {
            return setError(`Error on ${item.product_name}: Price below cost price.`);
        }
    }

    setLoading(true);

    const payload = {
      customer_id: selectedCustomer.customer_id,
      payment_method_id: selectedPaymentMethod,
      amount_paid: parseFloat(amountPaid) || 0,
      items: billItems.map(item => ({
        product_id: item.product_id,
        quantity: item.quantity,
        discount_per_unit: item.discount_per_unit
      }))
    };

    try {
      const res = await axios.post(`${API_URL}/create-bill/create`, payload, { headers: getAuthHeader() });
      
      setSuccess(`Bill Created Successfully! Bill No: ${res.data.bill_number}`);
      
      // Trigger PDF Download
      await handleDownloadPdf(res.data.bill_id, res.data.bill_number);

      // Reset Form on success
      setSelectedCustomer(null);
      setCustomerSearch('');
      setBillItems([]);
      setAmountPaid('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create bill.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="wb-container fade-in">
      <div className="wb-header">
        <h2><CreditCard size={24} /> Wholesale Billing</h2>
        <div className="wb-status">
            {error && <div className="wb-alert error"><AlertCircle size={16}/> {error}</div>}
            {success && <div className="wb-alert success"><CheckCircle size={16}/> {success}</div>}
        </div>
      </div>

      <div className="wb-grid">
        {/* Left Panel: Customer & Product Search */}
        <div className="wb-panel left">
            {/* Customer Section */}
            <div className="wb-section">
                <label className="wb-label"><User size={14}/> Customer Details</label>
                <div className="wb-search-box">
                    <input 
                        type="text" 
                        placeholder="Search Customer (Name/Mobile)" 
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        disabled={!!selectedCustomer}
                        className={selectedCustomer ? 'locked' : ''}
                    />
                    {selectedCustomer ? (
                        <button className="wb-btn-icon danger" onClick={handleClearCustomer}><Trash2 size={16}/></button>
                    ) : (
                        <Search className="search-icon" size={16}/>
                    )}
                </div>
                {customers.length > 0 && (
                    <ul className="wb-dropdown">
                        {customers.map(c => (
                            <li key={c.customer_id} onClick={() => handleSelectCustomer(c)}>
                                <strong>{c.customer_name}</strong> <br/> 
                                <span className="small">{c.phone} | Bal: {c.current_balance}</span>
                            </li>
                        ))}
                    </ul>
                )}
                {selectedCustomer && (
                    <div className="wb-customer-card">
                        <p><strong>Addr:</strong> {selectedCustomer.address || 'N/A'}</p>
                        <p><strong>Prev Due:</strong> <span className="text-red">{selectedCustomer.current_balance}</span></p>
                    </div>
                )}
            </div>

            {/* Product Section */}
            <div className="wb-section">
                <label className="wb-label"><Package size={14}/> Add Products</label>
                <div className="wb-search-box">
                    <input 
                        type="text" 
                        placeholder="Search Product..." 
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                    />
                    <Search className="search-icon" size={16}/>
                </div>
                {products.length > 0 && (
                    <ul className="wb-dropdown">
                        {products.map(p => (
                            <li key={p.product_id} onClick={() => handleAddProduct(p)}>
                                <div>
                                    <strong>{p.product_name}</strong>
                                    {/* UPDATED: Reference available_quantity_in_hand */}
                                    <div className="small">Stk: {p.available_quantity_in_hand} {p.unit_name} | Price: {p.wholesale_price}</div>
                                </div>
                                <Plus size={16} className="text-green"/>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>

        {/* Right Panel: Bill Table & Calculation */}
        <div className="wb-panel right">
            <div className="wb-table-wrapper">
                <table className="wb-table">
                    <thead>
                        <tr>
                            <th>Product</th>
                            <th width="80">Qty</th>
                            <th width="90">Price</th>
                            <th width="90">Disc/Unit</th>
                            <th width="100" align="right">Total</th>
                            <th width="40"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {billItems.length === 0 ? (
                            <tr><td colSpan="6" className="text-center text-muted">No items added</td></tr>
                        ) : (
                            billItems.map((item, idx) => (
                                <tr key={idx}>
                                    <td>
                                        <div className="fw-bold">{item.product_name}</div>
                                        {/* UPDATED: Reference available_quantity_in_hand */}
                                        <div className="small text-muted">Stock: {item.available_quantity_in_hand}</div>
                                    </td>
                                    <td>
                                        <input 
                                            type="number" 
                                            className="wb-input-sm"
                                            value={item.quantity}
                                            onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                                            min="1"
                                        />
                                    </td>
                                    <td>{item.wholesale_price}</td>
                                    <td>
                                        <input 
                                            type="number" 
                                            className="wb-input-sm"
                                            value={item.discount_per_unit}
                                            onChange={(e) => handleItemChange(idx, 'discount_per_unit', e.target.value)}
                                            min="0"
                                        />
                                    </td>
                                    <td align="right">{item.total.toFixed(2)}</td>
                                    <td>
                                        <button className="wb-btn-icon text-red" onClick={() => handleRemoveItem(idx)}>
                                            <Trash2 size={14}/>
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Footer Calculation */}
            <div className="wb-footer">
                <div className="wb-payment-info">
                    <label className="wb-label">Payment Method</label>
                    <select 
                        value={selectedPaymentMethod} 
                        onChange={(e) => setSelectedPaymentMethod(e.target.value)}
                        className="wb-select"
                    >
                        {paymentMethods.map(pm => (
                            <option key={pm.id} value={pm.id}>{pm.name}</option>
                        ))}
                    </select>

                    <label className="wb-label mt-2">Amount Paid</label>
                    <input 
                        type="number" 
                        className="wb-input"
                        value={amountPaid}
                        onChange={(e) => setAmountPaid(e.target.value)}
                        placeholder="0.00"
                    />
                </div>

                <div className="wb-totals">
                    <div className="wb-total-row">
                        <span>Subtotal:</span>
                        <span>{grandTotal.toFixed(2)}</span>
                    </div>
                    <div className="wb-total-row grand">
                        <span>Grand Total:</span>
                        <span>{grandTotal.toFixed(2)}</span>
                    </div>
                    <div className="wb-total-row paid">
                        <span>Paid:</span>
                        <span>{parseFloat(amountPaid || 0).toFixed(2)}</span>
                    </div>
                    <div className="wb-total-row due">
                        <span>Due Balance:</span>
                        <span>{dueAmount.toFixed(2)}</span>
                    </div>
                </div>
            </div>

            <div className="wb-actions">
                <button className="wb-btn primary" onClick={handleSubmit} disabled={loading}>
                    {loading ? 'Processing...' : <><Save size={16}/> Create Bill</>}
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default CreateWholesaleBill;