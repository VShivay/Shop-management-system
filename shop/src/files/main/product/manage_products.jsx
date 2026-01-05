import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { 
  MagnifyingGlassIcon, 
  PlusIcon,
  ArchiveBoxIcon,
  ExclamationTriangleIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  TrashIcon,         
  NoSymbolIcon,
  PencilSquareIcon,
  FunnelIcon
} from '@heroicons/react/24/outline';
import './manage_products.css';

const ManageProducts = () => {
  const navigate = useNavigate();
  
  // Data State
  const [products, setProducts] = useState([]);
  
  // Pagination State
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const limit = 10; 

  // Filter State
  const [filters, setFilters] = useState({
    name: '',
    category_id: '',
    unit_id: '',
    sales_channel: '',
    is_active: ''
  });
  
  // Dropdown Data
  const [dropdowns, setDropdowns] = useState({
    categories: [],
    units: [],
    suppliers: [],
    sales_channels: [] 
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal State
  const [modal, setModal] = useState({ 
    show: false, 
    type: null, 
    id: null, 
    name: '' 
  });

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

  // 1. Fetch Dropdown Options
  useEffect(() => {
    const fetchDropdowns = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${API_URL}/products/dropdowns`, { 
          headers: { Authorization: `Bearer ${token}` }
        });
        setDropdowns(res.data);
      } catch (err) {
        console.error("Failed to load filters", err);
      }
    };
    fetchDropdowns();
  }, [API_URL]);

  // 2. Fetch Products Logic
  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const params = { page, limit, ...filters };
      Object.keys(params).forEach(key => {
        if (params[key] === '' || params[key] === null) delete params[key];
      });

      const res = await axios.get(`${API_URL}/products`, {
        headers: { Authorization: `Bearer ${token}` },
        params
      });

      if (res.data.meta) {
        setProducts(res.data.products || []);
        setTotalPages(res.data.meta.total_pages);
        setTotalItems(res.data.meta.total_items);
      } else {
        setProducts(res.data.products || []);
      }
    } catch (err) {
      setError('Failed to load products.');
      if (err.response && err.response.status === 401) navigate('/'); 
    } finally {
      setLoading(false);
    }
  }, [API_URL, filters, page, navigate]);

  // 3. Trigger Fetch
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProducts();
    }, 400);
    return () => clearTimeout(timer);
  }, [fetchProducts]); 

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
    setPage(1); 
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) setPage(newPage);
  };

  const handleEdit = (e, productId) => {
    e.stopPropagation(); 
    navigate(`/dashboard/products/edit/${productId}`);
  };

  const initiateAction = (e, type, product) => {
    e.stopPropagation(); 
    setModal({ show: true, type, id: product.product_id, name: product.product_name });
  };

  const confirmAction = async () => {
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };

      if (modal.type === 'archive') {
        await axios.patch(`${API_URL}/products/${modal.id}/archive`, {}, config);
      } else if (modal.type === 'delete') {
        await axios.delete(`${API_URL}/products/${modal.id}`, config);
      }

      setModal({ show: false, type: null, id: null, name: '' });
      fetchProducts(); 
    } catch (err) {
      alert(err.response?.data?.error || "Action failed");
      setModal({ show: false, type: null, id: null, name: '' });
    }
  };

  const formatPrice = (price) => {
    if (price === null || price === undefined) return '—';
    return `$${parseFloat(price).toFixed(2)}`;
  };

  return (
    <div className="manage-products-wrapper">
      
      {/* Header Section */}
      <div className="mp-header-card">
        <div className="mp-header-content">
          <div className="mp-titles">
            <h2 className="mp-title">Inventory</h2>
            <span className="mp-badge-count">{totalItems} Items</span>
          </div>
          <p className="mp-subtitle">Manage catalog, pricing, and status.</p>
        </div>
        <button className="mp-btn-gradient" onClick={() => navigate('/dashboard/products/add')}>
          <PlusIcon className="icon-sm" /> 
          <span>New Product</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="mp-filter-card">
        <div className="mp-search-wrapper">
          <MagnifyingGlassIcon className="search-icon" />
          <input 
            type="text" 
            name="name" 
            placeholder="Search by name..." 
            value={filters.name}
            onChange={handleFilterChange}
            className="mp-input-search"
          />
        </div>
        
        <div className="mp-filters-group">
           <div className="select-wrapper">
             <select name="category_id" value={filters.category_id} onChange={handleFilterChange} className="mp-select">
               <option value="">Category: All</option>
               {dropdowns.categories.map(c => (
                 <option key={c.category_id} value={c.category_id}>{c.category_name}</option>
               ))}
             </select>
           </div>

           <div className="select-wrapper">
             <select name="sales_channel" value={filters.sales_channel} onChange={handleFilterChange} className="mp-select">
               <option value="">Channel: All</option>
               {dropdowns.sales_channels?.map((sc) => (
                 <option key={sc.id} value={sc.name}>{sc.name}</option>
               ))}
             </select>
           </div>

           <div className="select-wrapper">
             <select name="is_active" value={filters.is_active} onChange={handleFilterChange} className="mp-select">
               <option value="">Status: All</option>
               <option value="true">Active</option>
               <option value="false">Inactive</option>
             </select>
           </div>
        </div>
      </div>

      {error && (
        <div className="mp-alert-error">
          <ExclamationTriangleIcon className="icon-sm" /> {error}
        </div>
      )}

      {/* Main Table Area */}
      <div className="mp-table-container">
        {loading ? (
          <div className="mp-loading-state">
             <div className="spinner-gradient"></div>
             <p>Syncing Data...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="mp-empty-state">
            <ArchiveBoxIcon className="icon-xl" />
            <h3>No Inventory Found</h3>
            <p>Adjust your filters or add a new product.</p>
          </div>
        ) : (
          <>
            <div className="mp-table-scroll">
              <table className="mp-table">
                <thead>
                  <tr>
                    <th className="th-left">Product Details</th>
                    <th>Category</th>
                    <th>Unit</th>
                    <th className="th-right">Cost</th>
                    <th className="th-right">Wholesale</th>
                    <th className="th-right">Retail</th>
                    <th className="th-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr 
                      key={product.product_id} 
                      onClick={() => navigate(`/dashboard/products/${product.product_id}`)}
                      className={`mp-row ${!product.is_active ? 'mp-row-inactive' : ''}`}
                    >
                      <td>
                        <div className="mp-cell-name">
                          <span className="mp-name-text">{product.product_name}</span>
                          {!product.is_active && <span className="mp-tag-inactive">Inactive</span>}
                        </div>
                      </td>
                      <td><span className="mp-pill">{product.category_name || '—'}</span></td>
                      <td><span className="mp-text-sub">{product.unit_name || '—'}</span></td>
                      <td className="text-right mp-font-mono mp-text-muted">{formatPrice(product.cost_price)}</td>
                      <td className="text-right mp-font-mono">{formatPrice(product.wholesale_price)}</td>
                      <td className="text-right mp-font-mono mp-text-highlight">{formatPrice(product.retail_price)}</td>
                      
                      <td className="text-right" onClick={e => e.stopPropagation()}>
                        <div className="mp-actions">
                          <button className="mp-icon-btn btn-blue" onClick={(e) => handleEdit(e, product.product_id)} title="Edit">
                            <PencilSquareIcon className="icon-xs" />
                          </button>
                          {product.is_active && (
                            <button className="mp-icon-btn btn-orange" onClick={(e) => initiateAction(e, 'archive', product)} title="Deactivate">
                              <NoSymbolIcon className="icon-xs" />
                            </button>
                          )}
                          <button className="mp-icon-btn btn-red" onClick={(e) => initiateAction(e, 'delete', product)} title="Delete">
                            <TrashIcon className="icon-xs" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="mp-pagination-bar">
                <span className="mp-page-info">
                    {totalItems} Results
                </span>
                <div className="mp-page-controls">
                    <button className="mp-pg-btn" disabled={page === 1} onClick={() => handlePageChange(page - 1)}>
                        <ChevronLeftIcon className="icon-xs" />
                    </button>
                    <span className="mp-pg-num">{page} / {totalPages}</span>
                    <button className="mp-pg-btn" disabled={page === totalPages} onClick={() => handlePageChange(page + 1)}>
                        <ChevronRightIcon className="icon-xs" />
                    </button>
                </div>
            </div>
          </>
        )}
      </div>

      {/* Modern Modal */}
      {modal.show && (
        <div className="mp-modal-backdrop">
          <div className="mp-modal-card">
            <div className={`mp-modal-header ${modal.type === 'delete' ? 'header-danger' : 'header-warn'}`}>
              <ExclamationTriangleIcon className="modal-icon" />
              <h3>{modal.type === 'delete' ? 'Delete Item' : 'Deactivate Item'}</h3>
            </div>
            <div className="mp-modal-body">
              <p>Are you sure you want to proceed with <strong>{modal.name}</strong>?</p>
              {modal.type === 'delete' && <p className="mp-warning-text">This action is permanent and cannot be undone.</p>}
            </div>
            <div className="mp-modal-footer">
              <button className="mp-btn-ghost" onClick={() => setModal({ show: false })}>Cancel</button>
              <button 
                className={`mp-btn-action ${modal.type === 'delete' ? 'bg-danger' : 'bg-warn'}`} 
                onClick={confirmAction}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageProducts;