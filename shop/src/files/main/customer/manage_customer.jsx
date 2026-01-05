import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  MagnifyingGlassIcon, 
  FunnelIcon, 
  ChevronLeftIcon, 
  ChevronRightIcon,
  UserGroupIcon,
  PlusIcon,
  EyeIcon,
  PencilSquareIcon,
  TrashIcon,
  ExclamationCircleIcon
} from '@heroicons/react/24/outline';
import './manage_customer.css';

const API_URL = process.env.REACT_APP_API_URL;

const ManageCustomer = () => {
  const navigate = useNavigate();
  
  // Data State
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  
  // Filter State
  const [filters, setFilters] = useState({
    page: 1,
    limit: 10,
    search: '',
    type: 'wholesale',
    is_active: 'true',
    sort_by: 'name',
    order: 'ASC'
  });
  
  const [pagination, setPagination] = useState({
    current_page: 1,
    total_pages: 1,
    total_items: 0
  });

  // Fetch Data Trigger
  useEffect(() => {
    fetchCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.page, filters.type, filters.is_active, filters.sort_by, filters.order]);

  // Debounce Search
  useEffect(() => {
    const timer = setTimeout(() => {
        if(filters.page !== 1) setFilters(prev => ({...prev, page: 1}));
        else fetchCustomers();
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.search]);

  const fetchCustomers = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const queryParams = new URLSearchParams(filters).toString();
      
      const response = await fetch(`${API_URL}/customers?${queryParams}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('Unable to retrieve customer data.');
      
      const data = await response.json();
      setCustomers(data.data || []);
      setPagination(data.pagination || { current_page: 1, total_pages: 1, total_items: 0 });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id, isActive, name) => {
    const isSoftDelete = isActive;
    const confirmMessage = isSoftDelete 
      ? `Deactivate ${name}?`
      : `PERMANENTLY DELETE ${name}?`;

    if (!window.confirm(confirmMessage)) return;

    setDeleteLoading(true);
    const token = localStorage.getItem('token');
    const endpoint = isSoftDelete 
      ? `${API_URL}/customers/soft-delete/${id}`
      : `${API_URL}/customers/hard-delete/${id}`;
    const method = isSoftDelete ? 'PUT' : 'DELETE';

    try {
      const response = await fetch(endpoint, {
        method: method,
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Delete operation failed');

      // Refresh data to show updated status
      fetchCustomers(); 
    } catch (err) {
      alert(`Action failed: ${err.message}`);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value, page: 1 }));
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.total_pages) {
      setFilters(prev => ({ ...prev, page: newPage }));
    }
  };

  // Render Helpers
  const formatCurrency = (amount) => {
    return Number(amount).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
  };

  return (
    <div className="mc-wrapper">
      {/* --- Header Card --- */}
      <div className="mc-card">
        <div className="mc-header-row">
          <div className="mc-title-box">
            <div className="mc-icon-bg">
              <UserGroupIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="mc-title">Customers</h2>
              <p className="mc-subtitle">
                {pagination.total_items} records found
              </p>
            </div>
          </div>
          <button 
            className="mc-btn mc-btn-primary" 
            onClick={() => navigate('/dashboard/customers/add')}
          >
            <PlusIcon className="w-4 h-4" /> Add New
          </button>
        </div>

        {/* --- Filters Toolbar --- */}
        <div className="mc-filter-grid">
          <div className="mc-input-group">
            <MagnifyingGlassIcon className="mc-input-icon" />
            <input 
              type="text" 
              name="search"
              placeholder="Search customers..." 
              value={filters.search}
              onChange={handleFilterChange}
              className="mc-input"
            />
          </div>

          <div className="mc-input-group">
            <select name="type" value={filters.type} onChange={handleFilterChange} className="mc-select">
              <option value="all">All Types</option>
              <option value="wholesale">Wholesale</option>
              <option value="retail">Retail</option>
            </select>
          </div>

          <div className="mc-input-group">
             <select name="is_active" value={filters.is_active} onChange={handleFilterChange} className="mc-select">
              <option value="all">All Status</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>

          <div className="mc-input-group">
            <select name="sort_by" value={filters.sort_by} onChange={handleFilterChange} className="mc-select">
              <option value="name">Name</option>
              <option value="date">Date Joined</option>
              <option value="balance">Balance</option>
            </select>
          </div>

          <div className="mc-input-group">
            <select name="order" value={filters.order} onChange={handleFilterChange} className="mc-select">
              <option value="ASC">Ascending</option>
              <option value="DESC">Descending</option>
            </select>
          </div>
        </div>
      </div>

      {/* --- Error Display --- */}
      {error && (
        <div className="mc-error-banner fade-in">
          <ExclamationCircleIcon className="w-5 h-5" />
          <span>{error}</span>
        </div>
      )}

      {/* --- Data Table --- */}
      <div className="mc-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="mc-table-container">
          <table className="mc-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Type</th>
                <th>Contact</th>
                <th>Balance</th>
                <th>Status</th>
                <th style={{textAlign: 'right'}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                // Skeleton Loading State
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan="6" style={{padding: '8px'}}>
                      <div className="mc-loading-skeleton"></div>
                    </td>
                  </tr>
                ))
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{textAlign: 'center', padding: '20px', color: '#64748b'}}>
                    <FunnelIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    No customers found matching your criteria.
                  </td>
                </tr>
              ) : (
                customers.map((customer) => (
                  <tr key={customer.customer_id}>
                    {/* Customer Name & Avatar */}
                    <td>
                      <div className="mc-avatar-group">
                        <div className="mc-avatar">
                          {customer.customer_name?.charAt(0).toUpperCase()}
                        </div>
                        <div className="mc-name-text">
                          <span>{customer.customer_name}</span>
                          <span className="mc-sub-text">{customer.customer_code}</span>
                        </div>
                      </div>
                    </td>

                    {/* Type Badge */}
                    <td>
                      <span className={`mc-badge ${customer.customer_type}`}>
                        {customer.customer_type}
                      </span>
                    </td>

                    {/* Contact Info */}
                    <td>
                      <div className="mc-name-text">
                        <span>{customer.phone || '-'}</span>
                        <span className="mc-sub-text">{customer.email}</span>
                      </div>
                    </td>

                    {/* Balance */}
                    <td>
                      <span className={Number(customer.current_balance) > 0 ? 'mc-price-pos' : 'mc-price-neg'}>
                        {formatCurrency(customer.current_balance)}
                      </span>
                    </td>

                    {/* Active Status */}
                    <td>
                      <span className={`mc-badge ${customer.is_active ? 'active' : 'inactive'}`}>
                        {customer.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>

                    {/* Actions */}
                    <td>
                      <div className="mc-actions">
                        <button 
                          className="mc-action-btn"
                          title="View Details"
                          onClick={() => navigate(`/dashboard/customers/${customer.customer_id}`)}
                        >
                          <EyeIcon className="w-4 h-4" />
                        </button>
                        <button 
                          className="mc-action-btn"
                          title="Edit"
                          onClick={() => navigate(`/dashboard/customers/edit/${customer.customer_id}`)}
                        >
                          <PencilSquareIcon className="w-4 h-4" />
                        </button>
                        <button 
                          className="mc-action-btn delete"
                          title={customer.is_active ? "Deactivate" : "Delete"}
                          disabled={deleteLoading}
                          onClick={() => handleDelete(customer.customer_id, customer.is_active, customer.customer_name)}
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* --- Pagination Footer inside Card --- */}
        {!loading && customers.length > 0 && (
          <div style={{ padding: '0 10px 10px 10px' }}>
            <div className="mc-pagination">
              <span>
                Page <strong>{pagination.current_page}</strong> of {pagination.total_pages}
              </span>
              <div className="mc-page-controls">
                <button 
                  className="mc-page-btn" 
                  disabled={pagination.current_page === 1}
                  onClick={() => handlePageChange(pagination.current_page - 1)}
                >
                  <ChevronLeftIcon className="w-4 h-4" />
                </button>
                <button 
                  className="mc-page-btn"
                  disabled={pagination.current_page === pagination.total_pages}
                  onClick={() => handlePageChange(pagination.current_page + 1)}
                >
                  <ChevronRightIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ManageCustomer;