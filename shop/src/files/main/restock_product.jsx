// src/files/main/restock_product.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Search, PackagePlus, AlertTriangle, X, 
  ChevronLeft, ChevronRight, CheckCircle, Loader2 
} from 'lucide-react';
import './css/restock_product.css';

const API_URL = process.env.REACT_APP_API_URL;

const RestockProduct = () => {
  // State: Data
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  
  // State: UI & Pagination
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [pagination, setPagination] = useState({
    current_page: 1,
    total_pages: 1,
    total_items: 0
  });

  // State: Modal & Form
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [formData, setFormData] = useState({
    supplier_id: '',
    quantity: '',
    supply_price: ''
  });
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // --- 1. Fetch Data ---

  const fetchProducts = async (page = 1, search = '') => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/restock`, {
        params: { page, limit: 10, search },
        headers: { Authorization: `Bearer ${token}` }
      });
      setProducts(res.data.data);
      setPagination(res.data.meta);
    } catch (err) {
      console.error("Fetch products failed", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const token = localStorage.getItem('token');
      // Ensure this endpoint exists in your backend to get supplier list
      const res = await axios.get(`${API_URL}/suppliers`, { 
        headers: { Authorization: `Bearer ${token}` } 
      });
      // Adjust structure if your API returns {data: [...]} or directly [...]
      const supplierList = res.data.data ? res.data.data : res.data;
      setSuppliers(Array.isArray(supplierList) ? supplierList : []);
    } catch (err) {
      console.error("Fetch suppliers failed", err);
    }
  };

  useEffect(() => {
    fetchProducts(1, '');
    fetchSuppliers();
  }, []);

  // --- 2. Handlers ---

  const handleSearch = (e) => {
    const val = e.target.value;
    setSearchTerm(val);
    fetchProducts(1, val);
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.total_pages) {
      fetchProducts(newPage, searchTerm);
    }
  };

  const openRestockModal = (product) => {
    setSelectedProduct(product);
    setFormData({ supplier_id: '', quantity: '', supply_price: '' });
    setFormError('');
    setSuccessMsg('');
  };

  const closeRestockModal = () => {
    setSelectedProduct(null);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmitRestock = async (e) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);

    // Validation
    if (!formData.supplier_id || !formData.quantity || !formData.supply_price) {
      setFormError("All fields are required.");
      setSubmitting(false);
      return;
    }
    if (Number(formData.quantity) <= 0 || Number(formData.supply_price) <= 0) {
      setFormError("Quantity and Price must be positive.");
      setSubmitting(false);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/restock`, {
        product_id: selectedProduct.product_id,
        supplier_id: parseInt(formData.supplier_id),
        quantity: parseFloat(formData.quantity),
        supply_price: parseFloat(formData.supply_price)
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setSuccessMsg("Stock updated successfully!");
      
      // Close and refresh after delay
      setTimeout(() => {
        closeRestockModal();
        fetchProducts(pagination.current_page, searchTerm);
      }, 1200);

    } catch (err) {
      console.error(err);
      setFormError(err.response?.data?.error || "Restock failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const isLowStock = (qty, threshold) => Number(qty) <= Number(threshold);

  return (
    <div className="restock-container">
      {/* Header */}
      <div className="restock-header">
        <div className="header-title">
          <PackagePlus size={24} className="icon-main" />
          <h2>Restock Inventory</h2>
        </div>
        <div className="search-bar">
          <Search size={16} className="search-icon" />
          <input 
            type="text" 
            placeholder="Search product..." 
            value={searchTerm}
            onChange={handleSearch}
          />
        </div>
      </div>

      {/* Main Card */}
      <div className="restock-card">
        {loading ? (
          <div className="loading-state">
            <Loader2 className="animate-spin" size={32} />
            <p>Loading inventory...</p>
          </div>
        ) : (
          <>
            <div className="table-responsive">
              <table className="restock-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Available</th>
                    <th>Status</th>
                    <th style={{textAlign: 'center'}}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {products.length > 0 ? (
                    products.map(prod => (
                      <tr key={prod.product_id} className={isLowStock(prod.available_quantity, prod.low_stock_threshold) ? 'row-low-stock' : ''}>
                        <td className="fw-500">{prod.product_name}</td>
                        <td>{prod.category_name || '-'}</td>
                        <td>
                          <span className="qty-badge">
                            {prod.available_quantity} {prod.unit_name}
                          </span>
                        </td>
                        <td>
                          {isLowStock(prod.available_quantity, prod.low_stock_threshold) ? (
                            <span className="status-badge low">
                              <AlertTriangle size={12} /> Low
                            </span>
                          ) : (
                            <span className="status-badge ok">
                              <CheckCircle size={12} /> Good
                            </span>
                          )}
                        </td>
                        <td style={{textAlign: 'center'}}>
                          <button 
                            className="btn-restock"
                            onClick={() => openRestockModal(prod)}
                          >
                            Add Stock
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5" className="no-data">No products found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {products.length > 0 && (
              <div className="pagination">
                <button 
                  disabled={pagination.current_page === 1}
                  onClick={() => handlePageChange(pagination.current_page - 1)}
                >
                  <ChevronLeft size={16} />
                </button>
                <span>Page {pagination.current_page} of {pagination.total_pages}</span>
                <button 
                  disabled={pagination.current_page === pagination.total_pages}
                  onClick={() => handlePageChange(pagination.current_page + 1)}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal */}
      {selectedProduct && (
        <div className="modal-overlay">
          <div className="modal-content fade-in-up">
            <div className="modal-header">
              <h3>Restock: {selectedProduct.product_name}</h3>
              <button className="close-btn" onClick={closeRestockModal}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitRestock} className="modal-body">
              {successMsg && <div className="alert success">{successMsg}</div>}
              {formError && <div className="alert error">{formError}</div>}

              <div className="form-group">
                <label>Select Supplier</label>
                <select 
                  name="supplier_id" 
                  value={formData.supplier_id} 
                  onChange={handleInputChange}
                  required
                >
                  <option value="">-- Choose --</option>
                  {suppliers.map(sup => (
                    <option key={sup.supplier_id} value={sup.supplier_id}>
                      {sup.supplier_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <div className="form-group half">
                  <label>Quantity</label>
                  <input 
                    type="number" 
                    name="quantity"
                    min="0.1"
                    step="0.01"
                    value={formData.quantity} 
                    onChange={handleInputChange}
                    placeholder="0.00"
                    required
                  />
                </div>
                <div className="form-group half">
                  <label>Total Cost</label>
                  <input 
                    type="number" 
                    name="supply_price"
                    min="0"
                    step="0.01"
                    value={formData.supply_price} 
                    onChange={handleInputChange}
                    placeholder="0.00"
                    required
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-cancel" onClick={closeRestockModal}>Cancel</button>
                <button type="submit" className="btn-submit" disabled={submitting}>
                  {submitting ? <Loader2 className="animate-spin" size={14} /> : 'Confirm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default RestockProduct;