import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  UserPlusIcon, 
  ArrowLeftIcon, 
  CheckCircleIcon 
} from '@heroicons/react/24/outline';
import './add_customer.css';

const API_URL = process.env.REACT_APP_API_URL;

const AddCustomer = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [formData, setFormData] = useState({
    customer_name: '',
    customer_type: 'wholesale', // Default
    phone: '',
    email: '',
    address: '',
    credit_limit: 0
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Basic Client Validation
    if (!formData.customer_name) {
        setError("Name is required");
        setLoading(false);
        return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/customers/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      const result = await response.json();

      if (!response.ok) throw new Error(result.error || 'Failed to add customer');

      // Success
      alert('Customer Added Successfully!');
      navigate('/dashboard/customers');

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ac-container fade-in">
      {/* Header */}
      <div className="ac-header">
        <button onClick={() => navigate(-1)} className="ac-back-btn">
          <ArrowLeftIcon className="w-4 h-4" /> Back
        </button>
        <div className="ac-title-box">
           <div className="ac-icon-bg"><UserPlusIcon className="w-6 h-6" /></div>
           <h1>Add New Customer</h1>
        </div>
      </div>

      {/* Form Card */}
      <div className="ac-card">
        {error && <div className="ac-error-msg">{error}</div>}

        <form onSubmit={handleSubmit} className="ac-form">
          <div className="ac-form-grid">
            
            {/* Name */}
            <div className="ac-group">
              <label>Customer Name <span className="req">*</span></label>
              <input 
                type="text" 
                name="customer_name" 
                value={formData.customer_name} 
                onChange={handleChange}
                placeholder="Enter full name"
                className="ac-input"
                required
              />
            </div>

            {/* Type */}
            <div className="ac-group">
              <label>Customer Type <span className="req">*</span></label>
              <select 
                name="customer_type" 
                value={formData.customer_type} 
                onChange={handleChange}
                className="ac-select"
              >
                <option value="wholesale">Wholesale</option>
                <option value="retail">Retail</option>
              </select>
            </div>

            {/* Phone */}
            <div className="ac-group">
              <label>Phone Number</label>
              <input 
                type="text" 
                name="phone" 
                value={formData.phone} 
                onChange={handleChange}
                placeholder="10-digit mobile"
                className="ac-input"
                pattern="[0-9]*"
              />
            </div>

            {/* Email */}
            <div className="ac-group">
              <label>Email Address</label>
              <input 
                type="email" 
                name="email" 
                value={formData.email} 
                onChange={handleChange}
                placeholder="name@example.com"
                className="ac-input"
              />
            </div>

            {/* Credit Limit */}
            <div className="ac-group">
              <label>Credit Limit (₹)</label>
              <input 
                type="number" 
                name="credit_limit" 
                value={formData.credit_limit} 
                onChange={handleChange}
                placeholder="0.00"
                className="ac-input"
                min="0"
              />
            </div>
            
            {/* Address (Full Width) */}
            <div className="ac-group full-width">
              <label>Billing Address</label>
              <textarea 
                name="address" 
                value={formData.address} 
                onChange={handleChange}
                placeholder="Enter complete address"
                className="ac-textarea"
                rows="3"
              />
            </div>

          </div>

          <div className="ac-actions">
            <button type="button" onClick={() => navigate(-1)} className="ac-btn cancel">Cancel</button>
            <button type="submit" disabled={loading} className="ac-btn submit">
              {loading ? 'Saving...' : <><CheckCircleIcon className="w-4 h-4" /> Save Customer</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddCustomer;