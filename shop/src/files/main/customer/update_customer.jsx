import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  PencilSquareIcon, 
  ArrowLeftIcon, 
  CheckCircleIcon 
} from '@heroicons/react/24/outline';
import './update_customer.css';

const API_URL = process.env.REACT_APP_API_URL;

const UpdateCustomer = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true); // Loading initial data
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  
  const [formData, setFormData] = useState({
    customer_name: '',
    customer_type: 'wholesale',
    phone: '',
    email: '',
    address: '',
    credit_limit: 0,
    is_active: true
  });

  // Fetch Data on Mount
  useEffect(() => {
    const fetchCustomer = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_URL}/customers/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Customer not found');
            
            const result = await response.json();
            const { profile } = result.data;

            setFormData({
                customer_name: profile.customer_name,
                customer_type: profile.customer_type,
                phone: profile.phone || '',
                email: profile.email || '',
                address: profile.address || '',
                credit_limit: profile.credit_limit,
                is_active: profile.is_active
            });
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };
    fetchCustomer();
  }, [id]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ 
        ...prev, 
        [name]: type === 'checkbox' ? checked : value 
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      // Only send necessary updates (Can send full object too)
      const response = await fetch(`${API_URL}/customers/update/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      const result = await response.json();

      if (!response.ok) throw new Error(result.error || 'Failed to update customer');

      alert('Customer Updated Successfully!');
      navigate('/dashboard/customers');

    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if(loading) return <div className="uc-loading">Loading Customer Data...</div>;

  return (
    <div className="uc-container fade-in">
      {/* Header */}
      <div className="uc-header">
        <button onClick={() => navigate(-1)} className="uc-back-btn">
          <ArrowLeftIcon className="w-4 h-4" /> Back
        </button>
        <div className="uc-title-box">
           <div className="uc-icon-bg"><PencilSquareIcon className="w-6 h-6" /></div>
           <h1>Edit Customer</h1>
        </div>
      </div>

      {/* Form Card */}
      <div className="uc-card">
        {error && <div className="uc-error-msg">{error}</div>}

        <form onSubmit={handleSubmit} className="uc-form">
          <div className="uc-form-grid">
            
            <div className="uc-group">
              <label>Customer Name <span className="req">*</span></label>
              <input 
                type="text" 
                name="customer_name" 
                value={formData.customer_name} 
                onChange={handleChange}
                className="uc-input"
                required
              />
            </div>

            <div className="uc-group">
              <label>Customer Type <span className="req">*</span></label>
              <select 
                name="customer_type" 
                value={formData.customer_type} 
                onChange={handleChange}
                className="uc-select"
              >
                <option value="wholesale">Wholesale</option>
                <option value="retail">Retail</option>
              </select>
            </div>

            <div className="uc-group">
              <label>Phone Number</label>
              <input 
                type="text" 
                name="phone" 
                value={formData.phone} 
                onChange={handleChange}
                className="uc-input"
              />
            </div>

            <div className="uc-group">
              <label>Email Address</label>
              <input 
                type="email" 
                name="email" 
                value={formData.email} 
                onChange={handleChange}
                className="uc-input"
              />
            </div>

            <div className="uc-group">
              <label>Credit Limit (₹)</label>
              <input 
                type="number" 
                name="credit_limit" 
                value={formData.credit_limit} 
                onChange={handleChange}
                className="uc-input"
                min="0"
              />
            </div>

             {/* Active Toggle */}
             <div className="uc-group">
              <label>Account Status</label>
              <div className="uc-toggle-wrap">
                  <input 
                    type="checkbox" 
                    name="is_active" 
                    id="isActive"
                    checked={formData.is_active} 
                    onChange={handleChange}
                  />
                  <label htmlFor="isActive">Active Customer</label>
              </div>
            </div>
            
            <div className="uc-group full-width">
              <label>Billing Address</label>
              <textarea 
                name="address" 
                value={formData.address} 
                onChange={handleChange}
                className="uc-textarea"
                rows="3"
              />
            </div>
          </div>

          <div className="uc-actions">
            <button type="button" onClick={() => navigate(-1)} className="uc-btn cancel">Cancel</button>
            <button type="submit" disabled={submitting} className="uc-btn submit">
              {submitting ? 'Updating...' : <><CheckCircleIcon className="w-4 h-4" /> Update Details</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UpdateCustomer;